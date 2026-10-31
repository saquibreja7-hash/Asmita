// Checks the least-privilege database setup (ADR 004, M1 + M2) against a real
// Postgres. CI only: it creates throwaway roles.
//
//   node scripts/check-db-privileges.mjs setup    before `prisma migrate deploy`
//   node scripts/check-db-privileges.mjs verify   after migrations and seed
import pg from "pg";

const adminUrl = process.env.DIRECT_URL;
if (!adminUrl) throw new Error("DIRECT_URL is required");

// `setup` re-grants the Supabase API roles and `verify` creates a weak login.
// Never run against anything but the throwaway CI database.
const host = new URL(adminUrl).hostname;
if (process.env.CI !== "true" || !["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to run outside CI against a local database (host: ${host})`);
}

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function expectDenied(client, statement) {
  try {
    await client.query(statement);
  } catch {
    return;
  }
  throw new Error(`Expected to be denied: ${statement}`);
}

// Mimic Supabase: public API roles that receive every new table by default.
async function setup() {
  await withClient(adminUrl, async (db) => {
    for (const role of ["anon", "authenticated"]) {
      await db.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF;
      END $$`);
      await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
    }
  });
  console.log("Created anon and authenticated with Supabase-style default grants.");
}

async function verify() {
  const tables = await withClient(adminUrl, async (db) => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asmita_ci') THEN
        CREATE ROLE asmita_ci LOGIN PASSWORD 'ci' IN ROLE asmita_app;
      END IF;
    END $$`);

    const { rows } = await db.query(`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY 1`);

    const exposed = rows.filter((t) => t.anon_access || t.authenticated_access).map((t) => t.name);
    if (exposed.length) throw new Error(`Supabase API roles can still reach: ${exposed.join(", ")}`);

    const appTables = rows.filter((t) => t.name !== "_prisma_migrations");
    const withoutRls = appTables.filter((t) => !t.rls).map((t) => t.name);
    if (withoutRls.length) throw new Error(`Row-level security is off on: ${withoutRls.join(", ")}`);

    for (const table of appTables) {
      const { rows: count } = await db.query(`SELECT count(*)::int AS n FROM "${table.name}"`);
      table.ownerCount = count[0].n;
    }
    return appTables;
  });

  const appUrl = new URL(adminUrl);
  appUrl.username = "asmita_ci";
  appUrl.password = "ci";

  await withClient(appUrl.toString(), async (db) => {
    for (const table of tables) {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${table.name}"`);
      if (rows[0].n !== table.ownerCount) {
        throw new Error(`App role sees ${rows[0].n} of ${table.ownerCount} rows in ${table.name}`);
      }
    }

    await db.query("BEGIN");
    await db.query('LOCK TABLE "audit_log" IN EXCLUSIVE MODE');
    await db.query("ROLLBACK");

    await expectDenied(db, 'UPDATE "audit_log" SET "sequence" = "sequence" WHERE false');
    await expectDenied(db, 'DELETE FROM "audit_log" WHERE false');
    await expectDenied(db, 'TRUNCATE "audit_log"');
    await expectDenied(db, 'SELECT 1 FROM "_prisma_migrations"');
  });

  console.log(`Verified ${tables.length} tables: RLS on, Supabase API roles locked out, app role works, audit_log append-only.`);
}

if (process.argv[2] === "setup") await setup();
else if (process.argv[2] === "verify") await verify();
else throw new Error("Usage: check-db-privileges.mjs setup|verify");
