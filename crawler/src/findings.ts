/**
 * Buffers findings and posts them to Asmita in batches of at most 50.
 *
 * Batches are posted as soon as they fill (not only at the end), so a hard
 * kill loses at most one partial batch. Posting is serialised. A batch whose
 * POST fails after retries stays queued for the final flush; resending is
 * safe because the server answers "duplicate" for findings it already has.
 * When the pool is re-synced, queued findings for fingerprints that left the
 * pool (for example consent withdrawn) are dropped before they are sent.
 */
import { CrawlError, toCrawlError } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { RunMetrics } from "./metrics.ts";
import { MAX_FINDINGS_PER_CALL, type Finding, type FindingResult } from "./asmita/client.ts";

export type PostFindings = (runId: string, findings: Finding[], signal?: AbortSignal) => Promise<FindingResult[]>;

export class FindingsSink {
  private queue: Finding[] = [];
  private chain: Promise<void> = Promise.resolve();
  /** Set when the API reports the crawler switched off mid-run. */
  disabled = false;

  constructor(
    private readonly runId: string,
    private readonly post: PostFindings,
    private readonly metrics: RunMetrics,
    private readonly log: Logger,
  ) {}

  add(finding: Finding): void {
    this.queue.push(finding);
    this.metrics.findingsQueued++;
    if (this.queue.length >= MAX_FINDINGS_PER_CALL) void this.flush(false);
  }

  /** Drop queued findings whose fingerprint is no longer in the pool. */
  purge(stillInPool: (fingerprintId: string) => boolean): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((f) => stillInPool(f.fingerprintId));
    this.metrics.findingsWithdrawn += before - this.queue.length;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Post queued findings. With `all` false only full batches are sent; with
   * `all` true everything is sent (final flush).
   */
  flush(all: boolean, signal?: AbortSignal): Promise<void> {
    this.chain = this.chain.then(() => this.drain(all, signal));
    return this.chain;
  }

  private async drain(all: boolean, signal?: AbortSignal): Promise<void> {
    const failed: Finding[] = [];
    while (!this.disabled && (this.queue.length >= MAX_FINDINGS_PER_CALL || (all && this.queue.length > 0))) {
      const batch = this.queue.splice(0, MAX_FINDINGS_PER_CALL);
      const started = Date.now();
      try {
        const results = await this.post(this.runId, batch, signal);
        this.metrics.findingsPosted += batch.length;
        for (const r of results) {
          if (r.status === "created") this.metrics.findingsCreated++;
          else if (r.status === "duplicate") this.metrics.findingsDuplicate++;
          else this.metrics.findingsRejected++;
        }
        this.log.info("findings_posted", { count: batch.length, durationMs: Date.now() - started });
      } catch (raw) {
        const err = toCrawlError(raw);
        this.metrics.error(err.code);
        this.log.warn("findings_post_failed", { code: err.code, count: batch.length });
        if (err instanceof CrawlError && err.code === "api_disabled") this.disabled = true;
        if (err.code === "api_unauthorized" || err.code === "api_disabled") {
          failed.push(...batch);
          break;
        }
        failed.push(...batch);
        if (!all) break; // try again on the next flush
        if (signal?.aborted) break;
      }
    }
    // Keep failures at the front so ordering is preserved for the retry.
    this.queue = [...failed, ...this.queue];
  }

  /** Called once at the very end: count what could not be delivered. */
  finish(): void {
    this.metrics.findingsUnsent += this.queue.length;
    this.queue = [];
  }
}
