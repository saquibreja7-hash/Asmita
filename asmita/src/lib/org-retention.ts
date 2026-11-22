import { orgSubmissions, type OrgSubmissionStatus } from "@/lib/org-submissions";
import { NEWSLETTER_CONFIRM_TTL_MS, newsletterSubscribers } from "@/lib/org-newsletter";

/*
 * Retention for the organization pages (docs/org/spec.md, section 0):
 * closed or declined submissions are deleted 12 months after closing, and
 * unconfirmed newsletter sign-ups after 7 days. The maintenance cron
 * (/api/cron/maintenance) runs both sweeps; they are pure functions of
 * "now" so tests can move the clock.
 */

export const SUBMISSION_RETENTION_MS = 12 * 30 * 24 * 60 * 60_000; // 12 months, calendar-rounded by the caller

const CLOSING_STATUSES: OrgSubmissionStatus[] = ["CLOSED", "DECLINED"];

export type RetentionReport = {
  submissionsDeleted: number;
  unconfirmedSubscribersDeleted: number;
};

/** Delete closed or declined submissions past their 12-month clock. */
export async function purgeClosedOrgSubmissions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SUBMISSION_RETENTION_MS);
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    const before = orgSubmissions.length;
    const keep = (entry: (typeof orgSubmissions)[number]) =>
      !(CLOSING_STATUSES.includes(entry.status) && entry.closedAt && new Date(entry.closedAt) < cutoff);
    const survivors = orgSubmissions.filter(keep);
    orgSubmissions.length = 0;
    orgSubmissions.push(...survivors);
    return before - orgSubmissions.length;
  }
  const { db } = await import("@/lib/db");
  const removed = await db.orgSubmission.deleteMany({
    where: { status: { in: CLOSING_STATUSES }, closedAt: { lt: cutoff } },
  });
  return removed.count;
}

/**
 * Delete newsletter sign-ups that never confirmed within 7 days. The clock is
 * updatedAt, not createdAt: a re-signup issues a fresh token and restarts the
 * clock on the existing row, matching confirmNewsletter's own expiry check.
 */
export async function purgeUnconfirmedNewsletterSignups(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - NEWSLETTER_CONFIRM_TTL_MS);
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    const before = newsletterSubscribers.length;
    const survivors = newsletterSubscribers.filter(
      (entry) => !(entry.status === "PENDING" && new Date(entry.updatedAt) < cutoff),
    );
    newsletterSubscribers.length = 0;
    newsletterSubscribers.push(...survivors);
    return before - newsletterSubscribers.length;
  }
  const { db } = await import("@/lib/db");
  const removed = await db.newsletterSubscriber.deleteMany({
    where: { status: "PENDING", updatedAt: { lt: cutoff } },
  });
  return removed.count;
}

/** Both sweeps, for the maintenance cron. */
export async function runOrgRetention(now = new Date()): Promise<RetentionReport> {
  const submissionsDeleted = await purgeClosedOrgSubmissions(now);
  const unconfirmedSubscribersDeleted = await purgeUnconfirmedNewsletterSignups(now);
  return { submissionsDeleted, unconfirmedSubscribersDeleted };
}
