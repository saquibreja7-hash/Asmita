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
  pagesNonHtml = 0;
  pagesOutOfScope = 0;
  imagesSeen = 0;
  imagesHashed = 0;
  matches = 0;
  findingsQueued = 0;
  findingsPosted = 0;
  findingsCreated = 0;
  findingsDuplicate = 0;
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
      pagesNonHtml: this.pagesNonHtml,
      imagesSeen: this.imagesSeen,
      imagesHashed: this.imagesHashed,
      imagesSkipped: { ...this.imagesSkipped } as Record<string, number>,
      matches: this.matches,
      findingsQueued: this.findingsQueued,
      findingsPosted: this.findingsPosted,
      findingsCreated: this.findingsCreated,
      findingsDuplicate: this.findingsDuplicate,
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
