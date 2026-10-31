import { execSync } from "node:child_process";
import { enrolledTestAdmins } from "./support/admin";
import { adminUrl, appRole, withAdmin } from "./support/database";

// Fresh database per run, shaped like Supabase: the Data API roles receive
// every new table by default, and the migrations have to take that away.
export default async function globalSetup() {
  await withAdmin(async (db) => {
    // A tunnel can make a real Supabase database look local. Supabase servers
    // always have supabase_admin; never wipe one.
    const supabase = await db.query("SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin'");
    if (supabase.rowCount) throw new Error("Refusing to reset a Supabase database");

    await db.query("DROP SCHEMA IF EXISTS public CASCADE");
    await db.query("CREATE SCHEMA public");
    for (const role of ["anon", "authenticated"]) {
      await db.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF;
      END $$`);
      await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
    }
  });

  const env = { ...process.env, DATABASE_URL: adminUrl, DIRECT_URL: adminUrl };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx prisma db seed", { env, stdio: "inherit" });

  await withAdmin(async (db) => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        CREATE ROLE ${appRole} LOGIN PASSWORD 'e2e' IN ROLE asmita_app;
      END IF;
    END $$`);
    // Specs sign admin sessions for these synthetic identities; with MFA
    // enforced, each needs a confirmed enrolment (the secret is never used).
    for (const emailHash of enrolledTestAdmins) {
      await db.query(
        `INSERT INTO "AdminMfaSecret" ("emailHash", "secretEncrypted", "enrolledAt", "confirmedAt")
         VALUES ($1, 'unused', now(), now()) ON CONFLICT ("emailHash") DO NOTHING`,
        [emailHash],
      );
    }
  });
}
