/**
 * Buffers SSCD embeddings and posts them to Asmita in small batches
 * (WP28). Embeddings are rare — at most one per PDQ-match sighting — so
 * this is a much smaller sibling of FindingsSink:
 *
 *   - at most MAX_EMBEDDINGS_PER_CALL per call (~10 KiB each, far under
 *     the server's 256 KiB); a full batch is posted at once, the rest at
 *     each flush (the run's findings timer) and at the final flush;
 *   - posting is serialised and idempotent server-side (a repeat answers
 *     stored/already-present), so a retry never duplicates anything;
 *   - per-item "rejected": counted; "fingerprint_not_accepted" withdraws
 *     the pool id at once through the callback, exactly like a finding
 *     rejection — a withdrawn id must stop matching in every layer;
 *   - 400/413 are our bug: the batch is dropped, never retried; 5xx/429/
 *     network keep the batch queued; 503/401 surface the same way the
 *     findings sink's flags do (the caller stops the run).
 *
 * No vector is ever logged — only counts (rule 3).
 */
import { CrawlError, toCrawlError } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { RunMetrics } from "./metrics.ts";
import { MAX_EMBEDDINGS_PER_CALL, type EmbeddingItem, type EmbeddingResult } from "./asmita/client.ts";

export type PostEmbeddings = (runId: string, embeddings: EmbeddingItem[], signal?: AbortSignal) => Promise<EmbeddingResult[]>;

type Queued = { item: EmbeddingItem };

export class EmbeddingsSink {
  private queue: Queued[] = [];
  /** (fingerprintId, imageUrl) pairs already queued this run: never twice. */
  private readonly queued = new Set<string>();
  private chain: Promise<void> = Promise.resolve();
  /** Set when the API reports the crawler switched off mid-run. */
  disabled = false;
  /** Set when the API rejected the service key mid-run. */
  unauthorized = false;

  constructor(
    private readonly runId: string,
    private readonly post: PostEmbeddings,
    private readonly metrics: RunMetrics,
    private readonly log: Logger,
    /** Called when the server says a fingerprint is no longer accepted. */
    private readonly onFingerprintWithdrawn: (fingerprintId: string) => void = () => undefined,
  ) {}

  /** Queue one embedding; false when the pair was already offered this run. */
  add(item: EmbeddingItem): boolean {
    if (this.disabled || this.unauthorized) return false;
    const key = `${item.fingerprintId}\n${item.imageUrl}`;
    if (this.queued.has(key)) return false;
    this.queued.add(key);
    this.queue.push({ item });
    if (this.queue.length >= MAX_EMBEDDINGS_PER_CALL) void this.flush(false);
    return true;
  }

  /** With `all` false only full batches are sent; with `all` true everything. */
  flush(all: boolean, signal?: AbortSignal): Promise<void> {
    this.chain = this.chain.then(() => this.drain(all, signal));
    return this.chain;
  }

  /** Drop queued offers whose fingerprint is no longer in the pool. */
  purge(stillInPool: (fingerprintId: string) => boolean): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => stillInPool(q.item.fingerprintId));
    this.metrics.sscdEmbeddingsRejected += before - this.queue.length;
  }

  get pending(): number {
    return this.queue.length;
  }

  private async drain(all: boolean, signal?: AbortSignal): Promise<void> {
    const failed: Queued[] = [];
    while (!this.disabled && !this.unauthorized && this.queue.length > 0 && (all || this.queue.length >= MAX_EMBEDDINGS_PER_CALL)) {
      const batch = this.queue.splice(0, MAX_EMBEDDINGS_PER_CALL);
      try {
        const results = await this.post(this.runId, batch.map((q) => q.item), signal);
        this.record(batch, results);
        this.log.info("embeddings_posted", { count: batch.length });
      } catch (raw) {
        const err = toCrawlError(raw);
        this.metrics.error(err.code);
        if (err.code === "api_payload_too_large" || err.code === "api_bad_request" || err.code === "internal") {
          // A request the server will never accept: a bug, not a transient.
          this.log.error("embeddings_post_rejected", { code: err.code, count: batch.length });
          continue;
        }
        this.log.warn("embeddings_post_failed", { code: err.code, count: batch.length });
        failed.push(...batch);
        if (err instanceof CrawlError && err.code === "api_disabled") this.disabled = true;
        if (err.code === "api_unauthorized") this.unauthorized = true;
        if (this.disabled || this.unauthorized || !all || signal?.aborted) break;
      }
    }
    this.queue = [...failed, ...this.queue];
  }

  private record(batch: Queued[], results: EmbeddingResult[]): void {
    const withdrawn = new Set<string>();
    results.forEach((r, i) => {
      this.metrics.sscdEmbeddingsPosted++;
      if (r.status === "stored") {
        this.metrics.sscdEmbeddingsStored++;
      } else {
        this.metrics.sscdEmbeddingsRejected++;
        if (r.reason === "fingerprint_not_accepted") withdrawn.add(batch[i]!.item.fingerprintId);
      }
    });
    for (const id of withdrawn) this.onFingerprintWithdrawn(id);
  }

  /** Called once at the very end: count what could not be delivered. */
  finish(): number {
    const unsent = this.queue.length;
    this.queue = [];
    return unsent;
  }
}
