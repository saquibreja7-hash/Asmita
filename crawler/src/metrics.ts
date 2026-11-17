/** Run counters. Only numbers and fixed reason/error codes, never URLs. */
import type { ErrorCode } from "./errors.ts";

export type SkipReason =
  | "duplicate_url"
  | "budget"
  | "content_type"
  | "low_quality"
  | "pool_stale"
  | "fetch_failed"
  | "decode_failed"
  | "per_page_cap"
  | "decoder_timeout"
  | "decoder_crashed"
  | "image_hosts_capped"
  | "image_host_failures_capped"
  | "truncated"
  | "too_small"
  | "too_many_pixels"
  | "not_image"
  | "format"
  | "robots"
  | "data_uri"
  | "svg"
  | "tiny_declared"
  | "invalid_url";

export class RunMetrics {
  readonly startedAt: number;
  pagesAttempted = 0;
  pagesFetched = 0;
  /** Pages the server answered 304 for (conditional GET, WP3). */
  pagesNotModified = 0;
  pagesNonHtml = 0;
  pagesOutOfScope = 0;
  /** Links beyond MAX_LINKS_PER_PAGE on a page. */
  linksDropped = 0;
  /**
   * Largest batch claimed from the app's frontier (WP3). The crawler holds no
   * other frontier state, so this is its frontier memory bound: it can never
   * exceed FRONTIER_CLAIM_LIMIT.
   */
  batchPeak = 0;
  imagesSeen = 0;
  imagesHashed = 0;
  /** Images whose fetch touched a host outside the source's scope (CDNs). */
  imagesOffHost = 0;
  /** Images refused because the source hit MAX_OFFSITE_IMAGE_HOSTS. */
  imageHostsCapped = 0;
  /** Images refused because the source hit MAX_OFFSITE_HOST_FAILURES. */
  imageHostFailuresCapped = 0;
  matches = 0;
  findingsQueued = 0;
  findingsPosted = 0;
  /** Accepted by the server (new or already known: it no longer says which). */
  findingsAccepted = 0;
  findingsRejected = 0;
  findingsUnsent = 0;
  findingsWithdrawn = 0;
  /** Failed local validation (never sent). */
  findingsInvalid = 0;
  /** Sent but refused as a whole (400, or 413 for a single finding). */
  findingsFailed = 0;
  readonly rejectedByReason: Record<string, number> = {};
  poolSyncs = 0;
  poolSyncFailures = 0;
  sourcesCrawled = 0;
  sourcesInvalid = 0;
  readonly imagesSkipped: Partial<Record<SkipReason, number>> = {};
  readonly errors: Partial<Record<ErrorCode, number>> = {};
  readonly robots: Record<string, number> = {};

  constructor(now: number = Date.now()) {
    this.startedAt = now;
  }

  skip(reason: SkipReason, n = 1): void {
    if (n > 0) this.imagesSkipped[reason] = (this.imagesSkipped[reason] ?? 0) + n;
  }

  error(code: ErrorCode): void {
    this.errors[code] = (this.errors[code] ?? 0) + 1;
  }

  summary(opts: { now?: number; budgetPages: number; budgetImages: number; outcome: string }): Record<string, number | string | Record<string, number>> {
    return {
      outcome: opts.outcome,
      durationMs: (opts.now ?? Date.now()) - this.startedAt,
      sourcesCrawled: this.sourcesCrawled,
      sourcesInvalid: this.sourcesInvalid,
      pagesAttempted: this.pagesAttempted,
      pagesFetched: this.pagesFetched,
      pagesNotModified: this.pagesNotModified,
      pagesNonHtml: this.pagesNonHtml,
      linksDropped: this.linksDropped,
      batchPeak: this.batchPeak,
      imagesSeen: this.imagesSeen,
      imagesHashed: this.imagesHashed,
      imagesOffHost: this.imagesOffHost,
      imageHostsCapped: this.imageHostsCapped,
      imageHostFailuresCapped: this.imageHostFailuresCapped,
      imagesSkipped: { ...this.imagesSkipped } as Record<string, number>,
      matches: this.matches,
      findingsQueued: this.findingsQueued,
      findingsPosted: this.findingsPosted,
      findingsAccepted: this.findingsAccepted,
      findingsRejected: this.findingsRejected,
      findingsUnsent: this.findingsUnsent,
      findingsWithdrawn: this.findingsWithdrawn,
      findingsInvalid: this.findingsInvalid,
      findingsFailed: this.findingsFailed,
      rejectedByReason: { ...this.rejectedByReason },
      poolSyncs: this.poolSyncs,
      poolSyncFailures: this.poolSyncFailures,
      errors: { ...this.errors } as Record<string, number>,
      robots: { ...this.robots },
      budgetPagesUsed: this.pagesAttempted,
      budgetPages: opts.budgetPages,
      budgetImagesUsed: this.imagesSeen,
      budgetImages: opts.budgetImages,
    };
  }
}
