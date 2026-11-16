/**
 * Buffers findings and posts them to Asmita in batches.
 *
 * Batching: at most 50 findings AND at most MAX_FINDINGS_BODY_BYTES of JSON
 * per call (server limit 256 KiB). Full batches are posted as soon as they
 * fill (not only at the end), so a hard kill loses at most one partial batch.
 * Posting is serialised.
 *
 * Server answers:
 *   5xx / 429 / network -> retried by the client with backoff; if still
 *                          failing the batch stays queued for the next flush
 *                          (re-posting is safe: the server dedups).
 *   413                 -> the batch is split in half and both halves resent.
 *   400                 -> our request was malformed (a bug): logged with its
 *                          code, the batch is dropped, never retried.
 *   401                 -> stop posting (the run fails non-zero).
 *   503                 -> crawler switched off: stop posting, stop the run.
 *   per-item "rejected" -> counted by reason. "fingerprint_not_accepted"
 *                          means consent was withdrawn: the fingerprint is
 *                          dropped from the in-memory pool at once (callback)
 *                          and queued findings for it are discarded.
 * Findings that fail local validation (same rules as the server) are dropped
 * before queueing and counted as findingsInvalid.
 */
import { CrawlError, toCrawlError } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { RunMetrics } from "./metrics.ts";
import {
  FindingSchema,
  MAX_FINDINGS_BODY_BYTES,
  MAX_FINDINGS_PER_CALL,
  REJECT_REASONS,
  type Finding,
  type FindingResult,
} from "./asmita/client.ts";

export type PostFindings = (runId: string, findings: Finding[], signal?: AbortSignal) => Promise<FindingResult[]>;

type Queued = { finding: Finding; bytes: number };

/** JSON envelope overhead: {"runId":"...","findings":[...]} plus commas. */
const ENVELOPE_BYTES = 128;

export class FindingsSink {
  private queue: Queued[] = [];
  /** Fingerprints the server said it no longer accepts (this run). */
  private readonly withdrawn = new Set<string>();
  /** Set after a 413: the next batch is cut to at most this many items. */
  private splitHint = MAX_FINDINGS_PER_CALL;
  private chain: Promise<void> = Promise.resolve();
  /** Set when the API reports the crawler switched off mid-run. */
  disabled = false;
  /** Set when the API rejected the service key mid-run. */
  unauthorized = false;

  constructor(
    private readonly runId: string,
    private readonly post: PostFindings,
    private readonly metrics: RunMetrics,
    private readonly log: Logger,
    /** Called when the server says a fingerprint is no longer accepted. */
    private readonly onFingerprintWithdrawn: (fingerprintId: string) => void = () => undefined,
  ) {}

  add(finding: Finding): void {
    if (this.withdrawn.has(finding.fingerprintId)) {
      this.metrics.findingsWithdrawn++;
      return;
    }
    if (!FindingSchema.safeParse(finding).success) {
      this.metrics.findingsInvalid++;
      return;
    }
    const bytes = Buffer.byteLength(JSON.stringify(finding)) + 1;
    if (bytes + ENVELOPE_BYTES > MAX_FINDINGS_BODY_BYTES) {
      this.metrics.findingsInvalid++;
      return;
    }
    this.queue.push({ finding, bytes });
    this.metrics.findingsQueued++;
    if (this.queue.length >= MAX_FINDINGS_PER_CALL || this.queuedBytes() + ENVELOPE_BYTES >= MAX_FINDINGS_BODY_BYTES) {
      void this.flush(false);
    }
  }

  /** Drop queued findings whose fingerprint is no longer in the pool. */
  purge(stillInPool: (fingerprintId: string) => boolean): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => stillInPool(q.finding.fingerprintId));
    this.metrics.findingsWithdrawn += before - this.queue.length;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** With `all` false only full batches are sent; with `all` true everything. */
  flush(all: boolean, signal?: AbortSignal): Promise<void> {
    this.chain = this.chain.then(() => this.drain(all, signal));
    return this.chain;
  }

  private queuedBytes(): number {
    return this.queue.reduce((n, q) => n + q.bytes, 0);
  }

  /** Take the next batch: up to 50 items and under the byte limit. */
  private takeBatch(): Queued[] {
    let bytes = ENVELOPE_BYTES;
    let n = 0;
    const maxItems = Math.min(MAX_FINDINGS_PER_CALL, this.splitHint);
    while (n < this.queue.length && n < maxItems && bytes + this.queue[n]!.bytes <= MAX_FINDINGS_BODY_BYTES) {
      bytes += this.queue[n]!.bytes;
      n++;
    }
    return this.queue.splice(0, Math.max(n, 1));
  }

  private batchReady(all: boolean): boolean {
    if (this.queue.length === 0) return false;
    if (all) return true;
    return this.queue.length >= MAX_FINDINGS_PER_CALL || this.queuedBytes() + ENVELOPE_BYTES >= MAX_FINDINGS_BODY_BYTES;
  }

  private async drain(all: boolean, signal?: AbortSignal): Promise<void> {
    const failed: Queued[] = [];
    while (!this.disabled && !this.unauthorized && this.batchReady(all)) {
      const batch = this.takeBatch();
      const started = Date.now();
      try {
        const results = await this.post(this.runId, batch.map((q) => q.finding), signal);
        this.record(batch, results);
        this.log.info("findings_posted", { count: batch.length, durationMs: Date.now() - started });
      } catch (raw) {
        const err = toCrawlError(raw);
        this.metrics.error(err.code);
        if (err.code === "api_payload_too_large" && batch.length > 1) {
          // Split and resend both halves (front of the queue, order kept).
          this.log.warn("findings_batch_split", { code: err.code, count: batch.length });
          this.queue.unshift(...batch);
          this.splitHint = Math.ceil(batch.length / 2);
          continue;
        }
        if (err.code === "api_payload_too_large" || err.code === "api_bad_request" || err.code === "internal") {
          // A request the server will never accept: a bug, not a transient.
          this.log.error("findings_post_rejected", { code: err.code, count: batch.length });
          this.metrics.findingsFailed += batch.length;
          continue;
        }
        this.log.warn("findings_post_failed", { code: err.code, count: batch.length });
        failed.push(...batch);
        if (err instanceof CrawlError && err.code === "api_disabled") this.disabled = true;
        if (err.code === "api_unauthorized") this.unauthorized = true;
        if (this.disabled || this.unauthorized || !all || signal?.aborted) break;
      }
    }
    this.queue = [...failed, ...this.queue];
  }

  private record(batch: Queued[], results: FindingResult[]): void {
    this.splitHint = MAX_FINDINGS_PER_CALL;
    this.metrics.findingsPosted += batch.length;
    const withdrawn = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "created") this.metrics.findingsCreated++;
      else if (r.status === "duplicate") this.metrics.findingsDuplicate++;
      else {
        this.metrics.findingsRejected++;
        const reason = (REJECT_REASONS as readonly string[]).includes(r.reason ?? "") ? r.reason! : "other";
        this.metrics.rejectedByReason[reason] = (this.metrics.rejectedByReason[reason] ?? 0) + 1;
        if (reason === "fingerprint_not_accepted") withdrawn.add(batch[i]!.finding.fingerprintId);
      }
    });
    for (const id of withdrawn) {
      this.withdrawn.add(id);
      this.onFingerprintWithdrawn(id);
    }
    if (withdrawn.size > 0) this.purge((id) => !withdrawn.has(id));
  }

  /** Called once at the very end: count what could not be delivered. */
  finish(): void {
    this.metrics.findingsUnsent += this.queue.length;
    this.queue = [];
  }
}
