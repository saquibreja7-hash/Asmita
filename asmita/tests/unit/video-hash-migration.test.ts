import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The WP17 migration is additive only (crawler spec rule: migrations are
// additive), and the schema carries the video columns exactly as the
// video-fingerprints spec defines them.

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "20261119000000_video_fingerprints", "migration.sql"),
  "utf8",
);

function hashSubmissionModel(source: string) {
  const start = source.indexOf("model HashSubmission {");
  const end = source.indexOf("}", start);
  return source.slice(start, end);
}

describe("schema: video fingerprints (WP17)", () => {
  it("adds VPDQ to the hash algorithm enum", () => {
    expect(schema).toMatch(/enum HashAlgorithm \{\s*PDQ\s*VPDQ\s*\}/);
  });

  it("adds the three nullable video columns to HashSubmission", () => {
    const model = hashSubmissionModel(schema);
    expect(model).toMatch(/videoFramesEncrypted\s+String\?/);
    expect(model).toMatch(/videoFrameCount\s+Int\?/);
    expect(model).toMatch(/videoDurationSec\s+Int\?/);
    // Nullable means nullable: none of the video columns is required.
    expect(model).not.toMatch(/videoFramesEncrypted\s+String(?!\?)/);
    expect(model).not.toMatch(/videoFrameCount\s+Int(?!\?)/);
  });

  it("keeps the digest unique index that dedups video re-uploads", () => {
    expect(hashSubmissionModel(schema)).toMatch(/@@unique\(\[caseId, hashDigest\]/);
  });

  it("stores no media, file path or content field", () => {
    const model = hashSubmissionModel(schema);
    for (const forbidden of [/videoBytes/i, /videoData/i, /filePath/i, /mediaUrl/i, /s3Key/i, /base64/i]) {
      expect(model).not.toMatch(forbidden);
    }
  });
});

describe("migration 20261119000000_video_fingerprints", () => {
  it("adds the enum value and the three columns", () => {
    expect(migration).toMatch(/ALTER TYPE "HashAlgorithm" ADD VALUE IF NOT EXISTS 'VPDQ'/);
    expect(migration).toMatch(/ADD COLUMN\s+"videoFramesEncrypted" TEXT/);
    expect(migration).toMatch(/ADD COLUMN\s+"videoFrameCount" INTEGER/);
    expect(migration).toMatch(/ADD COLUMN\s+"videoDurationSec" INTEGER/);
  });

  it("is additive only: nothing is dropped, changed or written", () => {
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|UPDATE|DELETE|INSERT|RENAME|ALTER COLUMN|SET NOT NULL|SET DEFAULT)\b/i);
    // Every ALTER statement in the file is an addition.
    for (const line of migration.split("\n")) {
      if (/^\s*ALTER /i.test(line)) {
        expect(line).toMatch(/ADD (VALUE|COLUMN)/i);
      }
    }
  });

  it("adds the columns nullable: no NOT NULL and no backfill", () => {
    expect(migration).not.toMatch(/NOT NULL/);
  });
});
