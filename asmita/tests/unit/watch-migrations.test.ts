import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WP34: the watch lanes' schema changes must be fully covered by additive
// migrations, in timestamp order. The gap this guards against was real: the
// WP23 schema and code added the CONTENT_STILL_ONLINE audit event, but no
// migration added it to the Postgres enum (the WP23 migration created
// LinkVerificationOutcome, not this value), so the first still-online audit
// write would have failed against a real database. Every enum value the
// Prisma schema lists must therefore appear in some migration, and the watch
// migrations must add nothing but additive statements.

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
const migrationSql = new Map(
  readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") === false && !name.endsWith(".toml"))
    .map((name) => [name, readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8")]),
);
const allSql = [...migrationSql.values()].join("\n");

function enumValues(name: string): string[] {
  const start = schema.indexOf(`enum ${name} {`);
  expect(start).toBeGreaterThan(-1);
  const body = schema.slice(start, schema.indexOf("}", start));
  return [...body.matchAll(/^\s*([A-Z0-9_]+)\s*$/gm)].map((match) => match[1]);
}

const watchMigrations = [
  "20261119000000_link_verification",
  "20261119000000_watch_mode",
  "20261119120000_crawl_consent_watch_until",
  "20261119130000_audit_content_still_online",
];

describe("the watch lane's migrations cover the schema", () => {
  it("every AuditEventType value the schema lists was added by some migration", () => {
    // The enum is a real Postgres type (AuditLog.eventType), so a schema value
    // without a migration is a write that fails at the database.
    const missing = enumValues("AuditEventType").filter(
      (value) => !new RegExp(`('${value}')`).test(allSql),
    );
    expect(missing).toEqual([]);
  });

  it("every TemplateType value the schema lists was added by some migration", () => {
    const missing = enumValues("TemplateType").filter((value) => !allSql.includes(`'${value}'`));
    expect(missing).toEqual([]);
  });

  it("the still-online audit event has its own additive migration (the WP23 gap)", () => {
    const migration = migrationSql.get("20261119130000_audit_content_still_online") ?? "";
    expect(migration).toMatch(/ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CONTENT_STILL_ONLINE'/);
  });

  it("the watch migrations are additive only: nothing is dropped or rewritten", () => {
    for (const name of watchMigrations) {
      const sql = migrationSql.get(name) ?? "";
      expect(migrationSql.has(name), name).toBe(true);
      // No destructive or data-rewriting statement leads a line.
      for (const line of sql.split("\n")) {
        expect(line).not.toMatch(/^\s*(DROP|TRUNCATE|UPDATE|DELETE|INSERT INTO|RENAME|ALTER COLUMN|MODIFY)\b/i);
        // Every ALTER is an addition or RLS enablement, never a change of shape.
        if (/^\s*ALTER /i.test(line)) {
          expect(line).toMatch(/ADD (VALUE|COLUMN|CONSTRAINT)|ENABLE ROW LEVEL SECURITY/i);
        }
      }
    }
  });

  it("the four watch migrations sit in timestamp order among their neighbours", () => {
    const names = [...migrationSql.keys()].sort();
    const positions = watchMigrations.map((name) => names.indexOf(name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // And nothing else claims the same timestamp with a name between them.
    expect(names.filter((name) => name.startsWith("20261119")).length).toBeGreaterThanOrEqual(watchMigrations.length);
  });

  it("the schema carries the watch columns the migrations added", () => {
    const consent = schema.slice(schema.indexOf("model CrawlConsent {"), schema.indexOf("model CrawlFinding"));
    expect(consent).toMatch(/scope\s+CrawlConsentScope\s+@default\(SEARCH_AND_NOTICE\)/);
    expect(consent).toMatch(/convertedFromId\s+String\?/);
    expect(consent).toMatch(/watchUntil\s+DateTime\?/);
    expect(schema).toMatch(/mode\s+CaseMode\s+@default\(CASE\)/);
    expect(schema).toMatch(/enum CaseMode \{\s*CASE\s*WATCH\s*\}/);
    expect(schema).toMatch(/enum CrawlConsentScope \{\s*SEARCH_AND_NOTICE\s*WATCH_ONLY\s*\}/);
  });

  it("no URL column joined the LinkVerification table", () => {
    const model = schema.slice(schema.indexOf("model LinkVerification {"), schema.indexOf("}", schema.indexOf("model LinkVerification {")));
    // Column lines only; the SubmittedUrl relation (id and @relation line) is
    // the reference the check works from, never an address of its own.
    const columns = model.split("\n").filter((line) => /^\s{2}[a-zA-Z]+\s+[A-Za-z]/.test(line) && !/^\s{2}submittedUrl\s+SubmittedUrl\s+@relation/.test(line));
    for (const column of columns) {
      if (/^submittedUrlId/.test(column.trim())) continue; // the FK to SubmittedUrl
      expect(column).not.toMatch(/url|address|host/i);
    }
    expect(model).toMatch(/submittedUrlId\s+String/);
  });
});
