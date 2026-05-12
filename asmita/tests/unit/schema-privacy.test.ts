import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");

describe("schema privacy constraints", () => {
  it("does not define Aadhaar number, intimate media, or Phase 2 hash storage fields", () => {
    expect(schema).not.toMatch(/\baadhaarNumber\b/i);
    expect(schema).not.toMatch(/\bcontentHash\b/i);
    expect(schema).not.toMatch(/\bhashContent\b/i);
    expect(schema).not.toMatch(/\bmediaUrl\b/i);
    expect(schema).not.toMatch(/\bfilePath\b/i);
    expect(schema).not.toMatch(/\bs3Key\b/i);
  });
});
