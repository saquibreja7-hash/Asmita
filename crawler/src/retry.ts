/** Retries with exponential backoff and full jitter. */
import { setTimeout as sleep } from "node:timers/promises";
import { CrawlError, toCrawlError } from "./errors.ts";

export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  signal?: AbortSignal | undefined;
  random?: () => number;
  /** Called before each retry (attempt is 1-based count of failures so far). */
  onRetry?: (err: CrawlError, attempt: number) => void;
};

/** Full jitter: uniform in [0, min(max, base * 2^attempt)]. */
export function backoffDelay(attempt: number, opts: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "random">): number {
  const ceiling = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  return Math.floor((opts.random ?? Math.random)() * ceiling);
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (raw) {
      const err = toCrawlError(raw);
      attempt++;
      if (!err.retryable || attempt >= opts.attempts || opts.signal?.aborted) throw err;
      opts.onRetry?.(err, attempt);
      let delay = backoffDelay(attempt, opts);
      if (err.retryAfterMs !== undefined) delay = Math.max(delay, Math.min(err.retryAfterMs, opts.maxDelayMs));
      try {
        await sleep(delay, undefined, opts.signal ? { signal: opts.signal } : undefined);
      } catch {
        throw new CrawlError("aborted");
      }
    }
  }
}

/** Parse Retry-After (seconds or HTTP date) into milliseconds, or undefined. */
export function parseRetryAfter(value: string | string[] | undefined, now = Date.now()): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return undefined;
  if (/^\d+$/.test(v.trim())) return Number(v.trim()) * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.max(0, t - now);
}
