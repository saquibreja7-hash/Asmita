import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("research documentation", () => {
  it("defines evidence and safety requirements for GO research", () => {
    const brief = readFileSync(path.join(process.cwd(), "docs", "research", "go-research-brief.md"), "utf8");

    expect(brief).toContain("Use official platform, regulator, court, or government pages first.");
    expect(brief).toContain("verified_by_human");
    expect(brief).toContain("Never paste victim-submitted URLs into external research tools.");
    expect(brief).toContain("Default role owner: Product Operations Lead.");
  });

  it("provides a guarded NGO announcement draft", () => {
    const draft = readFileSync(path.join(process.cwd(), "docs", "outreach", "ngo-announcement-draft.md"), "utf8");

    expect(draft).toContain("pending founder/legal review");
    expect(draft).toContain("does not open, preview, download, or fetch submitted content");
    expect(draft).toContain("does not request real victim cases yet");
  });
});
