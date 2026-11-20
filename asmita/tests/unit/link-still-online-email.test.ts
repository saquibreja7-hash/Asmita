import { afterEach, describe, expect, it } from "vitest";
import { createLinkStillOnlineEmail, sendLinkStillOnlineNotification } from "@/lib/email";

// Watch-and-verify WP23: the still-online email tells her that content she
// had reported as removed may be back. Like every survivor email it carries
// only her case reference and a sign-in prompt — never the address, the site,
// the platform or anything about the content beyond the fact that it is back.
// The wording is new legal text created unreviewed; counsel must read it
// before real use. Synthetic data only.

const REFERENCE = "ASMITA-2026-00042";
const DASHBOARD_URL = "https://meriasmita.org/case/abc-123";
const originalResendKey = process.env.RESEND_API_KEY;
afterEach(() => {
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
});

describe("createLinkStillOnlineEmail", () => {
  it("includes the case reference and dashboard URL", () => {
    const { subject, text } = createLinkStillOnlineEmail(REFERENCE, DASHBOARD_URL);
    expect(subject).toContain(REFERENCE);
    expect(text).toContain(REFERENCE);
    expect(text).toContain(DASHBOARD_URL);
  });

  it("mentions no site, platform or content address beyond the dashboard link", () => {
    const { text } = createLinkStillOnlineEmail(REFERENCE, DASHBOARD_URL);
    expect(text).toContain("no submitted URLs or personal information");
    expect(text.split(/\n/).filter((line) => line.includes("http"))).toHaveLength(1);
  });

  it("returns English copy when locale is hi (Hindi pending native review)", () => {
    // Per hi-review-status.json: trauma-informed survivor copy must be
    // authored by a native Hindi speaker. The locale arg is plumbed for
    // future use; until a reviewed version lands, English is returned.
    const { text } = createLinkStillOnlineEmail(REFERENCE, DASHBOARD_URL, "hi");
    expect(text).toContain("Hello,");
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });

  it("returns a dev id without sending when no Resend key is set", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendLinkStillOnlineNotification(
      "survivor@example.invalid",
      REFERENCE,
      DASHBOARD_URL,
    );
    expect(result).toEqual({ id: `dev-verify-still-${REFERENCE}` });
  });
});
