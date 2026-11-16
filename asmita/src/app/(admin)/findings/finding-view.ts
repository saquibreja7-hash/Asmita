// Pure helpers for the findings list, kept apart so they can be tested.

import type { CrawlFindingListRow } from "@/lib/crawl-findings";

export const STATUS_LABELS = { CANDIDATE: "Needs review", APPROVED: "Approved", DISMISSED: "Dismissed" } as const;

/** Unreviewed first, waiting-for-second-reviewer ahead of the rest, then oldest first. */
export function sortFindings(rows: CrawlFindingListRow[]): CrawlFindingListRow[] {
  const rank = (row: CrawlFindingListRow) => (row.reviewStatus === "CANDIDATE" ? (row.awaitingSecondReview ? 0 : 1) : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.firstSeenAt.localeCompare(b.firstSeenAt));
}

export function reviewLabel(row: Pick<CrawlFindingListRow, "reviewStatus" | "awaitingSecondReview" | "needsSecondReview">) {
  if (row.reviewStatus === "CANDIDATE") {
    return row.awaitingSecondReview ? "Waiting for second reviewer" : row.needsSecondReview ? "Needs review (two reviewers)" : "Needs review";
  }
  return STATUS_LABELS[row.reviewStatus];
}

export function shortDate(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}
