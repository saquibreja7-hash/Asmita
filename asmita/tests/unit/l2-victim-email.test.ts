import { describe, expect, it } from "vitest";
import { createL2VictimNotificationEmail } from "@/lib/email";

describe("createL2VictimNotificationEmail", () => {
  it("includes the case reference and dashboard URL", () => {
    const { subject, text } = createL2VictimNotificationEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
    );
    expect(subject).toContain("ASMITA-2026-00042");
    expect(text).toContain("ASMITA-2026-00042");
    expect(text).toContain("https://meriasmita.org/case/abc-123");
  });

  it("does not leak any URL or PII placeholder beyond the dashboard link", () => {
    const { text } = createL2VictimNotificationEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
    );
    expect(text.toLowerCase()).not.toContain("aadhaar");
    expect(text.toLowerCase()).not.toContain("phone");
    expect(text.toLowerCase()).not.toContain("mobile");
    expect(text).toContain("no submitted URLs or personal information");
  });

  it("returns English copy when locale is hi (Hindi pending native review)", () => {
    // Per hi-review-status.json: trauma-informed survivor copy must be
    // authored by a native Hindi speaker. The locale arg is plumbed for
    // future use; until a reviewed version lands, English is returned.
    const { text } = createL2VictimNotificationEmail(
      "ASMITA-2026-00042",
      "https://meriasmita.org/case/abc-123",
      "hi",
    );
    expect(text).toContain("Hello,");
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });
});
