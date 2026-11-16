/** Politeness and concurrency primitives. */
import { setTimeout as sleep } from "node:timers/promises";
import { CrawlError } from "../errors.ts";

/** Counting semaphore (global concurrency cap, decode cap). */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.max) this.active++;
    // Otherwise wait for a releasing holder to hand its slot over directly
    // (active is not decremented in between, so nobody can slip in).
    else await new Promise<void>((r) => this.waiters.push(r));
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/**
 * Per-host request spacing. A slot is reserved synchronously, so concurrent
 * callers for the same host queue up `delayMs` apart instead of bursting.
 */
export class HostScheduler {
  private readonly nextAt = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async wait(host: string, delayMs: number, signal?: AbortSignal): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextAt.get(host) ?? 0);
    this.nextAt.set(host, at + delayMs);
    if (at > now) {
      try {
        await sleep(at - now, undefined, signal ? { signal } : undefined);
      } catch {
        throw new CrawlError("aborted");
      }
    }
  }

  /** Push the host's next slot back (after a 429/503 or Retry-After). */
  penalize(host: string, ms: number): void {
    this.nextAt.set(host, Math.max(this.nextAt.get(host) ?? 0, this.now() + ms));
  }
}
