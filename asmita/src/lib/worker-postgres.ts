import { Client, type QueryResultRow } from "pg";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("database_not_configured");
  return new Client({ connectionString });
}

export function usesWorkerPostgres() {
  return process.env.ASMITA_DATABASE_DRIVER === "pg";
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const client = createClient();
  try {
    await client.connect();
    return await client.query<T>(text, values);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function withPostgresTransaction<T>(work: (client: Client) => Promise<T>) {
  const client = createClient();
  try {
    await client.connect();
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Minimal driver-level probe for the Cloudflare Worker runtime. Prisma Migrate
 * remains responsible for schema changes; this confirms that Hyperdrive and
 * node-postgres can reach the PostgreSQL origin from a deployed Worker.
 */
export async function probePostgresConnection() {
  const result = await queryPostgres<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
