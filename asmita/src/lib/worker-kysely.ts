import { Client, type QueryResultRow } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { DB } from "@/generated/kysely-types";

// Table types are generated from prisma/schema.prisma by prisma-kysely on
// every install (src/generated is not committed), so they match the schema.
type WorkerDatabase = DB;

class HyperdriveClientPool {
  async connect() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("database_not_configured");

    // Hyperdrive owns the shared origin pool. A short-lived pg Client is the
    // documented Workers pattern and avoids retaining sockets between requests.
    const client = new Client({ connectionString });
    await client.connect();
    return {
      query: <R extends QueryResultRow>(text: string, values: readonly unknown[]) => client.query<R>(text, values as unknown[]) as never,
      release: () => { void client.end().catch(() => undefined); },
    };
  }

  async end() {
    // Individual clients are closed by release(). Hyperdrive retains its pool.
  }
}

const globals = globalThis as typeof globalThis & { __asmitaWorkerKysely?: Kysely<WorkerDatabase> };

export function usesWorkerKysely() {
  return process.env.ASMITA_DATABASE_DRIVER === "pg";
}

export function getWorkerDb() {
  if (!usesWorkerKysely()) throw new Error("worker_database_not_enabled");
  globals.__asmitaWorkerKysely ??= new Kysely<WorkerDatabase>({
    dialect: new PostgresDialect({ pool: new HyperdriveClientPool() as never }),
  });
  return globals.__asmitaWorkerKysely;
}

export type { WorkerDatabase };
