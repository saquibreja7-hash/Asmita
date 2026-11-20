import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The WP28 migration (ADR 008) is additive except one documented widening:
// "CrawlFinding"."distance" becomes nullable, because an SSCD finding has no
// PDQ distance. Everything else is an addition, and the new table gets the
// same RLS rule as every crawler table.

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "20261119120000_sscd_embeddings", "migration.sql"),
  "utf8",
);

function model(source: string, name: string) {
  const start = source.indexOf(`model ${name} {`);
  const end = source.indexOf("}", start);
  return source.slice(start, end);
}

describe("schema: the SSCD second layer (WP28)", () => {
  it("adds the CrawlFindingMethod enum with the three methods", () => {
    expect(schema).toMatch(/enum CrawlFindingMethod \{\s*PDQ\s*VPDQ\s*SSCD\s*\}/);
  });

  it("CrawlFinding gains method (default PDQ), sscdSimilarity and a nullable distance", () => {
    const crawlFinding = model(schema, "CrawlFinding");
    expect(crawlFinding).toMatch(/method\s+CrawlFindingMethod @default\(PDQ\)/);
    expect(crawlFinding).toMatch(/sscdSimilarity\s+Float\?/);
    // The one documented widening: an SSCD finding has no PDQ distance.
    expect(crawlFinding).toMatch(/distance\s+Int\?/);
    expect(crawlFinding).toMatch(/embeddings\s+FindingEmbedding\[\]/);
  });

  it("FindingEmbedding stores an encrypted vector of an analyst-confirmed copy, and nothing else", () => {
    const embedding = model(schema, "FindingEmbedding");
    expect(embedding).toMatch(/findingId\s+String\s+@unique/);
    expect(embedding).toMatch(/hashSubmissionId\s+String/);
    expect(embedding).toMatch(/caseId\s+String/);
    expect(embedding).toMatch(/model\s+String/);
    expect(embedding).toMatch(/version\s+String/);
    expect(embedding).toMatch(/vectorEncrypted\s+String/);
    expect(embedding).toMatch(/createdAt\s+DateTime @default\(now\(\)\)/);
    expect(embedding).toMatch(/finding\s+CrawlFinding @relation\(fields: \[findingId\], references: \[id\], onDelete: Cascade\)/);
    expect(embedding).toMatch(/@@index\(\[hashSubmissionId\]\)/);
    expect(embedding).toMatch(/@@index\(\[caseId\]\)/);
    // Never an image, a path or anything media-shaped.
    for (const forbidden of [/image/i, /media/i, /filePath/i, /base64/i, /s3Key/i, /thumbnail/i]) {
      expect(embedding).not.toMatch(forbidden);
    }
  });
});

describe("migration 20261119120000_sscd_embeddings", () => {
  it("creates the enum, the two finding columns and the table with its indexes and foreign key", () => {
    expect(migration).toMatch(/CREATE TYPE "CrawlFindingMethod" AS ENUM \('PDQ','VPDQ','SSCD'\)/);
    expect(migration).toMatch(/ADD COLUMN\s+"method" "CrawlFindingMethod" NOT NULL DEFAULT 'PDQ'/);
    expect(migration).toMatch(/ADD COLUMN\s+"sscdSimilarity" DOUBLE PRECISION/);
    expect(migration).toMatch(/CREATE TABLE "FindingEmbedding"/);
    expect(migration).toMatch(/"vectorEncrypted" TEXT NOT NULL/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX "FindingEmbedding_findingId_key"/);
    expect(migration).toMatch(/CREATE INDEX "FindingEmbedding_hashSubmissionId_idx"/);
    expect(migration).toMatch(/CREATE INDEX "FindingEmbedding_caseId_idx"/);
    expect(migration).toMatch(/FOREIGN KEY \("findingId"\) REFERENCES "CrawlFinding"\("id"\) ON DELETE CASCADE/);
  });

  it("widens distance to nullable with the reason recorded in a comment", () => {
    expect(migration).toMatch(/ALTER TABLE "CrawlFinding" ALTER COLUMN "distance" DROP NOT NULL/);
    // The widening is documented in the migration itself: an SSCD finding has
    // no PDQ distance, old rows always wrote one, nothing narrows later.
    expect(migration).toMatch(/SSCD finding has no/i);
    expect(migration).toMatch(/PDQ distance/);
    expect(migration).toMatch(/nothing narrows|always carry a distance/i);
    // Nothing narrows: no NOT NULL is added anywhere.
    expect(migration).not.toMatch(/SET NOT NULL/);
  });

  it("backfills the method of pre-existing video findings from their VPDQ submissions", () => {
    expect(migration).toMatch(/UPDATE "CrawlFinding" SET "method"='VPDQ' WHERE "hashSubmissionId" IN \(SELECT "id" FROM "HashSubmission" WHERE "algorithm"='VPDQ'\)/);
  });

  it("is additive otherwise: nothing is dropped, deleted or renamed, and the only UPDATE is the backfill", () => {
    // ON DELETE CASCADE on the new foreign key is an addition, not a deletion.
    expect(migration).not.toMatch(/\b(DROP TABLE|DROP COLUMN|DROP TYPE|TRUNCATE|DELETE FROM|INSERT INTO|RENAME)\b/i);
    const updates = migration.split("\n").filter((line) => /^\s*UPDATE /i.test(line));
    expect(updates).toHaveLength(1);
    for (const line of migration.split("\n")) {
      if (/^\s*ALTER /i.test(line)) {
        // ADD COLUMN/CONSTRAINT, the RLS switch on the new table, or the one
        // documented DROP NOT NULL widening.
        expect(line).toMatch(/ADD (VALUE|COLUMN|CONSTRAINT)|ENABLE ROW LEVEL SECURITY|ALTER COLUMN "distance" DROP NOT NULL/i);
      }
    }
  });

  it("gives the new table the same RLS rule as every crawler table", () => {
    expect(migration).toMatch(/ALTER TABLE "FindingEmbedding" ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/CREATE POLICY asmita_app_all ON "FindingEmbedding" FOR ALL TO asmita_app USING \(true\) WITH CHECK \(true\)/);
  });
});
