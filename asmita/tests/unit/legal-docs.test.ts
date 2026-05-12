import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("legal compliance docs", () => {
  it("records the DPDP rules check and product implications", () => {
    const doc = readFileSync(
      path.join(process.cwd(), "docs", "legal", "dpdp-rules-check-2026-05-12.md"),
      "utf8",
    );

    expect(doc).toContain("DPDP Rules have been notified");
    expect(doc).toContain("do not collect URL submissions from minors");
    expect(doc).toContain("Re-check rules before public launch and quarterly after launch");
  });
});
