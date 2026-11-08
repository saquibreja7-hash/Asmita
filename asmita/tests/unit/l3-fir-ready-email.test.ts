import { describe, expect, it } from "vitest";
import { createL3FirReadyEmail } from "@/lib/email";

describe("createL3FirReadyEmail", () => {
  it("includes the case ref and dashboard link, and no PDF link (the export cannot run on Workers)", () => {
    const { subject, text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
    );
    expect(subject).toContain("ASMITA-2026-00042");
    expect(text).toContain("ASMITA-2026-00042");
    expect(text).toContain("https://meriasmita.org/case/abc-123");
    expect(text).not.toContain("/export");
    expect(text).toContain("Grievance Appellate Committee");
  });

  it("does not leak any URL or PII placeholder in the body", () => {
    const { text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
    );
    expect(text.toLowerCase()).not.toContain("aadhaar");
    expect(text.toLowerCase()).not.toContain("mobile");
    expect(text).toContain("no submitted URLs");
  });

  it("returns English copy when locale is hi (Hindi pending native review)", () => {
    const { text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
      "hi",
    );
    expect(text).toContain("Hello,");
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });
});
