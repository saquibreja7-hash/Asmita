import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purgeClosedOrgSubmissions, purgeUnconfirmedNewsletterSignups, runOrgRetention } from "@/lib/org-retention";
import { orgSubmissions, recordOrgSubmission } from "@/lib/org-submissions";
import { newsletterSubscribers, subscribeToNewsletter } from "@/lib/org-newsletter";

// Retention (docs/org/spec.md, section 0): closed or declined submissions
// are deleted 12 months after closing; unconfirmed newsletter sign-ups
// after 7 days. Memory mode with a moved clock.

function volunteerSubmission(email: string) {
  return recordOrgSubmission("VOLUNTEER", {
    name: "Test Volunteer",
    email,
    city: "Pune",
    state: "Maharashtra",
    languages: ["Hindi"],
    roles: ["TRANSLATION"],
    hours: "UP_TO_2",
    experience: "I can help with translation work.",
    adult: true,
    consent: true,
  });
}

describe("org retention", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgSubmissions.splice(0, orgSubmissions.length);
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
  });

  it("deletes closed or declined submissions 12 months after closing, and keeps the rest", async () => {
    await volunteerSubmission("old@example.invalid");
    await volunteerSubmission("recent@example.invalid");
    await volunteerSubmission("open@example.invalid");
    orgSubmissions[0].status = "CLOSED";
    orgSubmissions[0].closedAt = new Date(Date.now() - 13 * 30 * 24 * 60 * 60_000).toISOString();
    orgSubmissions[1].status = "DECLINED";
    orgSubmissions[1].closedAt = new Date(Date.now() - 11 * 30 * 24 * 60 * 60_000).toISOString();

    const deleted = await purgeClosedOrgSubmissions();
    expect(deleted).toBe(1);
    expect(orgSubmissions).toHaveLength(2);
    expect(orgSubmissions.some((entry) => entry.status === "CLOSED")).toBe(false);
    expect(orgSubmissions.some((entry) => entry.status === "DECLINED")).toBe(true);
  });

  it("deletes unconfirmed newsletter sign-ups after 7 days, keeping confirmed ones", async () => {
    await subscribeToNewsletter({ email: "stale@example.invalid", locale: "en", source: "t" });
    await subscribeToNewsletter({ email: "fresh@example.invalid", locale: "en", source: "t" });
    await subscribeToNewsletter({ email: "kept@example.invalid", locale: "en", source: "t" });
    // Backdate the stale and the confirmed sign-ups; only the stale one is
    // still PENDING.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();
    for (const index of [0, 2]) {
      newsletterSubscribers[index].createdAt = eightDaysAgo;
      newsletterSubscribers[index].updatedAt = eightDaysAgo;
    }
    newsletterSubscribers[2].status = "CONFIRMED";
    const staleHash = newsletterSubscribers[0].emailHash;
    const confirmedHash = newsletterSubscribers[2].emailHash;

    const deleted = await purgeUnconfirmedNewsletterSignups();
    expect(deleted).toBe(1);
    expect(newsletterSubscribers).toHaveLength(2);
    expect(newsletterSubscribers.some((entry) => entry.emailHash === staleHash)).toBe(false);
    expect(newsletterSubscribers.some((entry) => entry.emailHash === confirmedHash)).toBe(true);
  });

  it("keeps a re-subscriber's pending row: a fresh sign-up restarts the 7-day clock", async () => {
    await subscribeToNewsletter({ email: "again@example.invalid", locale: "en", source: "t" });
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    newsletterSubscribers[0].createdAt = longAgo;
    newsletterSubscribers[0].updatedAt = longAgo;
    // Signing up again reuses the row (old createdAt) with a new token.
    await subscribeToNewsletter({ email: "again@example.invalid", locale: "en", source: "t" });
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].createdAt).toBe(longAgo);

    expect(await purgeUnconfirmedNewsletterSignups()).toBe(0);
    expect(newsletterSubscribers).toHaveLength(1);
  });

  it("reports both sweeps for the maintenance cron", async () => {
    await volunteerSubmission("kept@example.invalid");
    orgSubmissions[0].status = "CLOSED";
    orgSubmissions[0].closedAt = new Date(Date.now() - 400 * 24 * 60 * 60_000).toISOString();
    await subscribeToNewsletter({ email: "pending@example.invalid", locale: "en", source: "t" });
    newsletterSubscribers[0].createdAt = new Date(Date.now() - 9 * 24 * 60 * 60_000).toISOString();
    newsletterSubscribers[0].updatedAt = newsletterSubscribers[0].createdAt;

    const report = await runOrgRetention();
    expect(report).toEqual({ submissionsDeleted: 1, unconfirmedSubscribersDeleted: 1 });
    expect(orgSubmissions).toHaveLength(0);
    expect(newsletterSubscribers).toHaveLength(0);
  });
});
