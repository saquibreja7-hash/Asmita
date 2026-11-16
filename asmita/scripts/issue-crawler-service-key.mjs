// Issues or revokes a bearer key for the crawler service (/api/crawler/*).
//
//   DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs issue <name>
//   DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs revoke <key id>
//   DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs list
//
// Optional PGSSLROOTCERT=<path to Supabase CA> verifies TLS fully. "issue"
// prints the new key once; only its sha256 is stored (CrawlServiceKey.keyHash,
// the same hash src/lib/crawler-auth.ts checks). Hand it to the crawler
// operator out of band and set it as the crawler's secret. "list" shows ids,
// names and dates, never a key or hash. The app must also run with
// ENABLE_CRAWLER=true for the key to be accepted.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const hashCrawlerKey = (key) => createHash("sha256").update(key).digest("hex");
export const generateCrawlerKey = () => `cwk_${randomBytes(24).toString("hex")}`;

const USAGE = "Usage: node scripts/issue-crawler-service-key.mjs issue <name> | revoke <key id> | list";

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!["issue", "revoke", "list"].includes(command ?? "")) throw new Error(USAGE);
  if (command === "issue" && !/^[\w .-]{1,80}$/.test(arg ?? "")) throw new Error("A name of 1-80 letters, digits, spaces, dots or dashes is required.");
  if (command === "revoke" && !/^[0-9a-f-]{36}$/i.test(arg ?? "")) throw new Error("A key id (uuid) is required.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const url = new URL(process.env.DATABASE_URL);
  const ssl = process.env.PGSSLROOTCERT
    ? { ca: readFileSync(process.env.PGSSLROOTCERT, "utf8"), servername: url.hostname }
    : undefined;
  if (ssl) url.searchParams.delete("sslmode");

  const client = new pg.Client({ connectionString: url.toString(), ssl });
  await client.connect();
  try {
    if (command === "issue") {
      const key = generateCrawlerKey();
      const id = randomUUID();
      await client.query(
        `INSERT INTO "CrawlServiceKey" ("id", "name", "keyHash") VALUES ($1, $2, $3)`,
        [id, arg, hashCrawlerKey(key)],
      );
      console.log(`Crawler key ${id} (${arg}):`);
      console.log(key);
      console.log("Shown once and not stored. Revoke with: revoke " + id);
    } else if (command === "revoke") {
      const result = await client.query(
        `UPDATE "CrawlServiceKey" SET "revokedAt" = now() WHERE "id" = $1 AND "revokedAt" IS NULL`,
        [arg],
      );
      console.log(result.rowCount ? `Revoked ${arg}.` : `No active key ${arg}.`);
    } else {
      const result = await client.query(
        `SELECT "id", "name", "createdAt", "lastUsedAt", "revokedAt" FROM "CrawlServiceKey" ORDER BY "createdAt"`,
      );
      for (const row of result.rows) {
        console.log(`${row.id}  ${row.name}  created ${row.createdAt.toISOString()}  last used ${row.lastUsedAt?.toISOString() ?? "never"}  ${row.revokedAt ? "REVOKED" : "active"}`);
      }
    }
  } finally {
    await client.end();
  }
}

// Run only as a script, so tests can import the hash.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
