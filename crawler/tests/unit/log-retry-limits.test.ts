import { describe, expect, it } from "vitest";
import { CrawlError, toCrawlError } from "../../src/errors.ts";
import { HostScheduler, Semaphore } from "../../src/crawl/limits.ts";
import { Logger, sanitizeLogString } from "../../src/log.ts";
import { backoffDelay, parseRetryAfter, withRetry } from "../../src/retry.ts";

describe("Logger", () => {
  const capture = () => {
    const lines: string[] = [];
    return { log: new Logger({ sink: (l) => lines.push(l), level: "debug" }), lines };
  };

  it("redacts anything that is not an id or code", () => {
    for (const bad of [
      "https://example.com/a.png",
      "example.com",
      "10.0.0.1",
      "a/b",
      "has space",
      "deadbeefdeadbeefdeadbeef",
      "x".repeat(81),
      "",
    ]) {
      expect(sanitizeLogString(bad)).toBe("[redacted]");
    }
    expect(sanitizeLogString("src-123")).toBe("src-123");
    expect(sanitizeLogString("body_too_large")).toBe("body_too_large");
  });

  it("drops unknown fields and sanitises nested counters", () => {
    const { log, lines } = capture();
    log.info("evt", {
      sourceId: "s1",
      code: "https://evil.example/",
      count: 3,
      summary: { errors: { blocked_address: 2 }, "https://x.example": 1 } as never,
      ...({ url: "https://example.com/", hostname: "example.com", message: "boom" } as object),
    });
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec).toMatchObject({ level: "info", event: "evt", sourceId: "s1", code: "[redacted]", count: 3 });
    expect(rec.summary).toEqual({ errors: { blocked_address: 2 } });
    expect(rec).not.toHaveProperty("url");
    expect(rec).not.toHaveProperty("hostname");
    expect(rec).not.toHaveProperty("message");
  });

  it("respects the level", () => {
    const lines: string[] = [];
    const log = new Logger({ sink: (l) => lines.push(l), level: "warn" });
    log.info("a");
    log.warn("b");
    expect(lines).toHaveLength(1);
  });
});

describe("toCrawlError", () => {
  it("keeps only a code, never the message", () => {
    const raw = Object.assign(new Error("getaddrinfo ENOTFOUND secret-host.example"), { code: "ENOTFOUND" });
    const e = toCrawlError(raw);
    expect(e.code).toBe("dns_failed");
    expect(e.message).toBe("dns_failed");
    expect(JSON.stringify({ m: e.message, c: e.code })).not.toContain("secret-host");
    expect(toCrawlError(new Error("https://x.example/ failed")).code).toBe("internal");
    expect(toCrawlError({ cause: { code: "UND_ERR_HEADERS_TIMEOUT" } }).code).toBe("headers_timeout");
    expect(toCrawlError(new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })])).code).toBe("connect_failed");
  });
});

describe("retry", () => {
  it("backs off exponentially with full jitter under a cap", () => {
    for (let a = 1; a < 10; a++) {
      const d = backoffDelay(a, { baseDelayMs: 100, maxDelayMs: 5000, random: () => 0.999 });
      expect(d).toBeLessThanOrEqual(Math.min(5000, 100 * 2 ** a));
      expect(backoffDelay(a, { baseDelayMs: 100, maxDelayMs: 5000, random: () => 0 })).toBe(0);
    }
  });
  it("retries only retryable errors", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new CrawlError("http_status", { status: 404 });
        },
        { attempts: 5, baseDelayMs: 1, maxDelayMs: 2 },
      ),
    ).rejects.toMatchObject({ code: "http_status" });
    expect(n).toBe(1);
    n = 0;
    const v = await withRetry(
      async () => {
        if (++n < 3) throw new CrawlError("connect_failed", { retryable: true });
        return "ok";
      },
      { attempts: 5, baseDelayMs: 1, maxDelayMs: 2 },
    );
    expect([v, n]).toEqual(["ok", 3]);
  });
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(new Date(10_000 + 3000).toUTCString(), 10_000)).toBeGreaterThanOrEqual(2000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});

describe("politeness primitives", () => {
  it("spaces requests to one host by the delay", async () => {
    const s = new HostScheduler();
    const t0 = Date.now();
    await Promise.all([s.wait("h", 60), s.wait("h", 60), s.wait("h", 60)]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
    const t1 = Date.now();
    await s.wait("other", 60);
    expect(Date.now() - t1).toBeLessThan(50);
  });
  it("caps concurrency", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        sem.use(async () => {
          peak = Math.max(peak, ++active);
          await new Promise((r) => setTimeout(r, 10));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
