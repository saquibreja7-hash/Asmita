import { describe, expect, it } from "vitest";
import { createL3FirReadyEmail } from "@/lib/email";

describe("createL3FirReadyEmail", () => {
  it("includes case ref, dashboard, and PDF download links", () => {
    const { subject, text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://asmita.in/case/abc-123",
      "https://asmita.in/api/cases/abc-123/export",
    );
    expect(subject).toContain("ASMITA-2026-00042");
    expect(text).toContain("ASMITA-2026-00042");
    expect(text).toContain("https://asmita.in/case/abc-123");
    expect(text).toContain("https://asmita.in/api/cases/abc-123/export");
  });

  it("does not leak any URL or PII placeholder in the body", () => {
    const { text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://asmita.in/case/abc-123",
      "https://asmita.in/api/cases/abc-123/export",
    );
    expect(text.toLowerCase()).not.toContain("aadhaar");
    expect(text.toLowerCase()).not.toContain("mobile");
    expect(text).toContain("no submitted URLs");
  });

  it("returns English copy when locale is hi (Hindi pending native review)", () => {
    const { text } = createL3FirReadyEmail(
      "ASMITA-2026-00042",
      "https://asmita.in/case/abc-123",
      "https://asmita.in/api/cases/abc-123/export",
      "hi",
    );
    expect(text).toContain("Hello,");
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });
});
