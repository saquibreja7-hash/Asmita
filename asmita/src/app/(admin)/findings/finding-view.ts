// Pure helpers for the findings pages, kept apart so they can be tested.

import type { CrawlFindingListRow, FindingPlatformView } from "@/lib/crawl-findings";

export const STATUS_LABELS = {
  CANDIDATE: "Needs review",
  APPROVED: "Approved",
  DISMISSED: "Dismissed",
  MINOR_PROTOCOL: "Minor protocol",
} as const;

/** The label names as the console shows them (review labels WP37). */
export const LABEL_TEXT = { aiMade: "Looks AI-made", sexual: "Sexual content", possibleMinor: "Possible minor" } as const;

/** The labels set on a row, in a fixed order; empty when none are. */
export function labelList(row: Pick<CrawlFindingListRow, "labels">): string[] {
  const labels: string[] = [];
  if (row.labels.aiMade.set) labels.push(LABEL_TEXT.aiMade);
  if (row.labels.sexual.set) labels.push(LABEL_TEXT.sexual);
  if (row.labels.possibleMinor.set) labels.push(LABEL_TEXT.possibleMinor);
  return labels;
}

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
  "reviewStatus" | "representativeNoticeSentAt" | "noticeAttemptUnconfirmed" | "crawlConsentWithdrawn" | "watchOnly" | "urlsPurged" | "linkStatus" | "labels"
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
  if (state.labels.possibleMinor.set) {
    return {
      kind: "blocked",
      code: "possible_minor_label_set",
      message: "Possible minor: this finding is marked for the minors protocol, so no representative notice can be sent for it while the label is set.",
    };
  }
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

// ---------------------------------------------------------------------------
// How the finding matched (ADR 008, WP28): the distance line for PDQ and
// VPDQ, the SSCD line for a second-layer match, and the borderline score a
// PDQ finding may carry. Plain text only, no new deps.

/** The similarity as the analysts see it: two decimals, never a raw float. */
export function similarityText(similarity: number | null) {
  return similarity === null ? "-" : similarity.toFixed(2);
}

/** The Match line of the finding detail: today's distance line for PDQ and VPDQ, the SSCD line for SSCD. */
export function matchLine(row: Pick<CrawlFindingListRow, "method" | "distance" | "sscdSimilarity">) {
  if (row.method === "SSCD") return `Matched by SSCD · similarity ${similarityText(row.sscdSimilarity)}`;
  return `Distance ${row.distance} (lower is closer)`;
}

/** The SSCD line of a second-layer match, shared by the list and the detail page. */
export function sscdMatchLine(row: Pick<CrawlFindingListRow, "sscdSimilarity">) {
  return `Matched by SSCD · similarity ${similarityText(row.sscdSimilarity)}`;
}

/**
 * The borderline SSCD score a PDQ finding carries (ADR 008): the crawler
 * scored the match against that fingerprint's own embeddings. Information for
 * the reviewer, never an automatic accept or reject; null when there is
 * nothing to show (an SSCD finding shows its similarity in the match line, a
 * VPDQ finding never carries a score).
 */
export function borderlineScoreLine(row: Pick<CrawlFindingListRow, "method" | "sscdSimilarity">) {
  if (row.method !== "PDQ" || row.sscdSimilarity === null) return null;
  return `SSCD score ${similarityText(row.sscdSimilarity)} · information for the reviewer, never an automatic accept or reject`;
}
