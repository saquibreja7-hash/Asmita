// Pure helpers for the findings pages, kept apart so they can be tested.

import type { CrawlFindingListRow, FindingPlatformView } from "@/lib/crawl-findings";

export const STATUS_LABELS = { CANDIDATE: "Needs review", APPROVED: "Approved", DISMISSED: "Dismissed" } as const;

/** Unreviewed first, waiting-for-second-reviewer ahead of the rest, then oldest first. */
export function sortFindings(rows: CrawlFindingListRow[]): CrawlFindingListRow[] {
  const rank = (row: CrawlFindingListRow) => (row.reviewStatus === "CANDIDATE" ? (row.awaitingSecondReview ? 0 : 1) : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.firstSeenAt.localeCompare(b.firstSeenAt));
}

export function reviewLabel(
  row: Pick<CrawlFindingListRow, "reviewStatus" | "awaitingSecondReview" | "needsSecondReview"> & { currentAdminGaveFirstReview?: boolean },
) {
  if (row.reviewStatus === "CANDIDATE") {
    if (row.awaitingSecondReview) return row.currentAdminGaveFirstReview ? "Waiting for another reviewer (you gave the first)" : "Waiting for second reviewer";
    return row.needsSecondReview ? "Needs review (two reviewers)" : "Needs review";
  }
  return STATUS_LABELS[row.reviewStatus];
}

export function platformLabel(platform: FindingPlatformView | null) {
  if (!platform) return "Unknown platform";
  if (platform.formOnly) return `${platform.name} (own form only)`;
  return platform.contactVerified ? `${platform.name} (verified contact)` : `${platform.name} (contact not verified)`;
}

export function noticeLabel(row: Pick<CrawlFindingListRow, "reviewStatus" | "representativeNoticeSentAt" | "noticeAttemptUnconfirmed" | "crawlConsentWithdrawn" | "watchOnly">) {
  if (row.representativeNoticeSentAt) return `Sent ${shortDate(row.representativeNoticeSentAt)}`;
  if (row.watchOnly) return "Watch only";
  if (row.crawlConsentWithdrawn) return "Consent withdrawn";
  if (row.noticeAttemptUnconfirmed) return "Attempt unconfirmed";
  return row.reviewStatus === "APPROVED" ? "Not sent" : "-";
}

export type NoticeGateInput = Pick<
  CrawlFindingListRow,
  "reviewStatus" | "representativeNoticeSentAt" | "noticeAttemptUnconfirmed" | "crawlConsentWithdrawn" | "watchOnly" | "urlsPurged" | "linkStatus"
> & { crawlerEnabled: boolean };

export type NoticeGate =
  | { kind: "sent"; sentAt: string }
  | { kind: "blocked"; code: string; message: string }
  | { kind: "open"; warning: string | null };

/**
 * What the notice step may offer, from the address-free summary. The server
 * re-checks every gate at preview and send; this only avoids offering an
 * action that cannot succeed.
 */
export function noticeGate(state: NoticeGateInput): NoticeGate {
  if (state.representativeNoticeSentAt) return { kind: "sent", sentAt: state.representativeNoticeSentAt };
  if (state.crawlConsentWithdrawn) {
    return { kind: "blocked", code: "consent_withdrawn", message: "Consent withdrawn: the survivor withdrew her authorisation for the crawler, so no notice can be sent for this finding." };
  }
  if (state.watchOnly) {
    // WP22: the case is a watch. Nothing can be sent until she chooses
    // "Take it down" and signs the full authorisation; the server refuses
    // with watch_only_consent.
    return { kind: "blocked", code: "watch_only_consent", message: "Watch only: she has not asked for removal yet. When she chooses \"Take it down\", her watch becomes a case and she signs the full authorisation." };
  }
  if (state.reviewStatus !== "APPROVED") return { kind: "blocked", code: "finding_not_approved", message: "A notice can be prepared only after the finding is approved." };
  if (state.urlsPurged) return { kind: "blocked", code: "finding_expired", message: "The addresses passed the 30-day retention period and were deleted, so no notice can be sent." };
  if (!state.crawlerEnabled) {
    return { kind: "blocked", code: "crawler_disabled", message: "The crawler is switched off (ENABLE_CRAWLER), so notices cannot be previewed or sent." };
  }
  if (state.linkStatus === null) {
    return { kind: "blocked", code: "crawler_link_not_found", message: "This finding has no crawler link of its own on the case (the survivor reported the page herself, or another finding added it), so there is no representative notice to send." };
  }
  return {
    kind: "open",
    warning: state.noticeAttemptUnconfirmed
      ? "An earlier attempt to send this notice was stored but is not recorded as sent. It may be in progress, or it may have reached the platform. A preview and send today resends exactly the same notice under the same idempotency key; if the server answers \"earlier attempt unconfirmed\", stop and follow the runbook."
      : null,
  };
}

export function shortDate(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}
