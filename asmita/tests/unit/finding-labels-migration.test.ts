import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The review-labels migration (review labels WP37) is additive only (crawler
// spec rule: migrations are additive), the schema carries the label columns
// and the two enum values exactly as the work package defines them, and
// row-level security is untouched: no new table, no policy statement.

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "20261119010000_finding_review_labels", "migration.sql"),
  "utf8",
);

function crawlFindingModel(source: string) {
  const start = source.indexOf("model CrawlFinding {");
  const end = source.indexOf("\n}", start);
  return source.slice(start, end);
}

describe("schema: finding review labels (WP37)", () => {
  it("adds MINOR_PROTOCOL to the finding status enum", () => {
    expect(schema).toMatch(/enum CrawlFindingStatus \{\s*CANDIDATE\s*APPROVED\s*DISMISSED\s*MINOR_PROTOCOL\s*\}/);
  });

  it("adds the two audit event types", () => {
    expect(schema).toMatch(/CRAWL_FINDING_LABEL_SET/);
    expect(schema).toMatch(/CRAWL_FINDING_LABEL_CLEARED/);
  });

  it("carries each label with who set it and when", () => {
    const model = crawlFindingModel(schema);
    for (const label of ["AiMade", "Sexual", "PossibleMinor"]) {
      expect(model).toMatch(new RegExp(`label${label}\\s+Boolean\\s+@default\\(false\\)`));
      expect(model).toMatch(new RegExp(`label${label}ById\\s+String\\?`));
      expect(model).toMatch(new RegExp(`label${label}At\\s+DateTime\\?`));
    }
  });

  it("records the possible-minor clear: who, when, why, and where the finding returns to", () => {
    const model = crawlFindingModel(schema);
    expect(model).toMatch(/labelPossibleMinorClearedById\s+String\?/);
    expect(model).toMatch(/labelPossibleMinorClearedAt\s+DateTime\?/);
    expect(model).toMatch(/labelPossibleMinorClearReason\s+String\?/);
    expect(model).toMatch(/minorProtocolBefore\s+String\?/);
  });

  it("adds no table and no stored address, URL or media field", () => {
    const model = crawlFindingModel(schema);
    for (const forbidden of [/Bytes/i, /base64/i, /dataUrl/i, /EncryptedUrl/i]) {
      expect(model).not.toMatch(forbidden);
    }
  });
});

describe("migration 20261119010000_finding_review_labels", () => {
  it("adds the enum values and the label columns", () => {
    expect(migration).toMatch(/ALTER TYPE "CrawlFindingStatus" ADD VALUE IF NOT EXISTS 'MINOR_PROTOCOL'/);
    expect(migration).toMatch(/ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_LABEL_SET'/);
    expect(migration).toMatch(/ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_LABEL_CLEARED'/);
    expect(migration).toMatch(/ADD COLUMN "labelAiMade" BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/ADD COLUMN "labelPossibleMinor" BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/ADD COLUMN "minorProtocolBefore" TEXT/);
  });

  it("is additive only: nothing is dropped, changed or written", () => {
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|UPDATE|DELETE|INSERT|RENAME|ALTER COLUMN|SET NOT NULL|SET DEFAULT)\b/i);
    // Statements, not lines: the ALTER TABLE spans several lines (one ADD
    // COLUMN per line), so every statement must be an additive ALTER.
    const statements = migration
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER (TYPE [\s\S]* ADD VALUE|TABLE [\s\S]* ADD COLUMN)/i);
    }
  });

  it("touches no row-level security: no policy, no table, no owner change", () => {
    expect(migration).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/CREATE POLICY|DROP POLICY/i);
    expect(migration).not.toMatch(/CREATE TABLE/i);
  });
});
