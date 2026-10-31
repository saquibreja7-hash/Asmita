import pg from "pg";

// The e2e suite runs against a real, throwaway Postgres 17. It is reset on
// every run, so it must never point anywhere but a local database.
export const adminUrl =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/asmita_e2e";

const host = new URL(adminUrl).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`E2E_DATABASE_URL must point at a local database (host: ${host})`);
}

// The app connects as a login role inside asmita_app, like production.
export const appRole = "asmita_e2e";
const app = new URL(adminUrl);
app.username = appRole;
app.password = "e2e";
export const appUrl = app.toString();

export async function withAdmin<T>(work: (db: pg.Client) => Promise<T>) {
  const db = new pg.Client({ connectionString: adminUrl });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}
