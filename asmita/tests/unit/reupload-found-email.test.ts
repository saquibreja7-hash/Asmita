import { afterEach, describe, expect, it } from "vitest";
import { createReuploadFoundEmail, sendReuploadFoundNotification } from "@/lib/email";

// Watch-and-verify WP24: the re-upload email tells her that a reviewer
// confirmed a new copy of her image while her case was closed. Like every
// survivor email it carries only her case reference and a sign-in prompt —
// never the address, the site, the platform or anything about the content
// beyond the fact that a copy was found. The wording is new legal text
// created unreviewed; counsel must read it before real use. Synthetic data only.

const REFERENCE = "ASMITA-2026-00042";
const DASHBOARD_URL = "https://meriasmita.org/case/abc-123";
const originalResendKey = process.env.RESEND_API_KEY;
afterEach(() => {
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
});

describe("createReuploadFoundEmail", () => {
  it("includes the case reference and dashboard URL", () => {
    const { subject, text } = createReuploadFoundEmail(REFERENCE, DASHBOARD_URL);
    expect(subject).toContain(REFERENCE);
    expect(text).toContain(REFERENCE);
    expect(text).toContain(DASHBOARD_URL);
  });

  it("mentions no site, platform or content address beyond the dashboard link", () => {
    const { text } = createReuploadFoundEmail(REFERENCE, DASHBOARD_URL);
    expect(text).toContain("no submitted URLs or personal information");
    expect(text.split(/\n/).filter((line) => line.includes("http"))).toHaveLength(1);
  });

  it("says a reviewer confirmed the copy and that Asmita acts under her existing authorisation", () => {
    const { text } = createReuploadFoundEmail(REFERENCE, DASHBOARD_URL);
    expect(text).toContain("A trained Asmita reviewer has confirmed it.");
    expect(text).toContain("under the authorisation you already gave");
    expect(text).toContain("Sign in to see it on your case page.");
  });

  it("returns English copy when locale is hi (Hindi pending native review)", () => {
    // Per hi-review-status.json: trauma-informed survivor copy must be
    // authored by a native Hindi speaker. The locale arg is plumbed for
    // future use; until a reviewed version lands, English is returned.
    const { text } = createReuploadFoundEmail(REFERENCE, DASHBOARD_URL, "hi");
    expect(text).toContain("Hello,");
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });

  it("returns a dev id without sending when no Resend key is set", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendReuploadFoundNotification(
      "survivor@example.invalid",
      REFERENCE,
      DASHBOARD_URL,
    );
    expect(result).toEqual({ id: `dev-reupload-${REFERENCE}` });
  });
});
