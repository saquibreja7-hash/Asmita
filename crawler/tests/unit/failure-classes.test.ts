/**
 * Fetch-failure classes (crawler v3 WP13, review fix): a DNS name that does
 * not exist and a definite TLS certificate failure (expired, wrong name,
 * self-signed) are permanent — never retried in this run, reported `error`
 * with the `permanent` hint, and the app kills the row only on a second
 * permanent failure at least 24 h later. Environment-type certificate
 * failures (`tls_unverified`: a missing local issuer, a non-TLS answer on
 * the TLS port) are temporary, like timeouts, resets and 5xx; 429/503 keep
 * today's treatment exactly. Unit level: error mapping, the class of each
 * code, the retry decision, the resolver split, the robots.txt pass-through
 * and the summary counters. The end-to-end report is covered by
 * tests/integration/permanent-failures.test.ts.
 */
import { describe, expect, it } from "vitest";
import { CrawlError, fetchFailureClass, toCrawlError } from "../../src/errors.ts";
import { resolveAllowed, productionPolicy, type NetPolicy, type ResolvedAddress } from "../../src/net/policy.ts";
import { RobotsCache } from "../../src/crawl/robots.ts";
import type { FetchResult } from "../../src/net/safe-fetch.ts";
import { RunMetrics } from "../../src/metrics.ts";
import { withRetry } from "../../src/retry.ts";

const errno = (code: string) => Object.assign(new Error("x"), { code });

/** toCrawlError applied to a raw syscall-style error. */
const mapped = (code: string) => toCrawlError(errno(code));

describe("error mapping by class (WP13)", () => {
  it("maps a name that does not exist to dns_not_found, permanent and never retried", () => {
    const e = mapped("ENOTFOUND");
    expect(e.code).toBe("dns_not_found");
    expect(e.retryable).toBe(false);
    expect(fetchFailureClass(e)).toBe("permanent");
  });

  it("keeps every other resolver failure on the retryable dns_failed", () => {
    for (const code of ["EAI_AGAIN"]) {
      const e = mapped(code);
      expect(e.code).toBe("dns_failed");
      expect(e.retryable).toBe(true);
      expect(fetchFailureClass(e)).toBe("temporary");
    }
  });

  it.each([
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ])("maps %s to tls_failed, permanent and never retried", (code) => {
    const e = mapped(code);
    expect(e.code).toBe("tls_failed");
    expect(e.retryable).toBe(false);
    expect(fetchFailureClass(e)).toBe("permanent");
  });

  it.each([
    // Review fix: a certificate the crawler could not verify for a reason
    // that usually lies with its own environment (no CA bundle, a
    // TLS-intercepting middlebox, a proxy answering a TLS port) is not
    // proof the site is broken — temporary, like a timeout.
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "ERR_SSL_WRONG_VERSION_NUMBER",
  ])("maps %s to tls_unverified, temporary and retried", (code) => {
    const e = mapped(code);
    expect(e.code).toBe("tls_unverified");
    expect(e.retryable).toBe(true);
    expect(fetchFailureClass(e)).toBe("temporary");
  });

  it.each([
    ["ETIMEDOUT", "connect_timeout"],
    ["UND_ERR_CONNECT_TIMEOUT", "connect_timeout"],
    ["UND_ERR_HEADERS_TIMEOUT", "headers_timeout"],
    ["UND_ERR_BODY_TIMEOUT", "body_timeout"],
    ["ECONNRESET", "network_error"],
    ["EPIPE", "network_error"],
    ["UND_ERR_SOCKET", "network_error"],
    ["ECONNREFUSED", "connect_failed"],
  ])("maps %s to %s, temporary and retryable", (raw, code) => {
    const e = mapped(raw);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(true);
    expect(fetchFailureClass(e)).toBe("temporary");
  });
});

describe("the class of a fetch failure (WP13)", () => {
  it("permanent: a dead name and certificate failures", () => {
    for (const code of ["dns_not_found", "tls_failed"] as const) {
      expect(fetchFailureClass(new CrawlError(code))).toBe("permanent");
    }
  });

  it("temporary: timeouts, resets, refused connections, 5xx and 429/503", () => {
    for (const code of ["dns_failed", "connect_failed", "connect_timeout", "headers_timeout", "body_timeout", "network_error", "tls_unverified"] as const) {
      expect(fetchFailureClass(new CrawlError(code))).toBe("temporary");
    }
    for (const status of [429, 500, 502, 503, 504]) {
      expect(fetchFailureClass(new CrawlError("http_status", { status }))).toBe("temporary");
    }
  });

  it("no class for statuses with their own mapping and for non-fetch errors", () => {
    // 404/410 are `gone` and 401/403 `blocked` by the page rules, not by class.
    for (const status of [404, 410, 401, 403, 400]) {
      expect(fetchFailureClass(new CrawlError("http_status", { status }))).toBeNull();
    }
    expect(fetchFailureClass(new CrawlError("http_status"))).toBeNull(); // no status known
    for (const code of ["robots_disallowed", "out_of_scope", "body_too_large", "internal", "api_network"] as const) {
      expect(fetchFailureClass(new CrawlError(code))).toBeNull();
    }
  });
});

describe("retry only what can work (WP13)", () => {
  const opts = { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 };

  it("never retries a DNS name that does not exist", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new CrawlError("dns_not_found");
        },
        opts,
      ),
    ).rejects.toMatchObject({ code: "dns_not_found" });
    expect(n).toBe(1);
  });

  it("never retries a TLS certificate failure", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new CrawlError("tls_failed");
        },
        opts,
      ),
    ).rejects.toMatchObject({ code: "tls_failed" });
    expect(n).toBe(1);
  });

  it("retries a temporary DNS failure, a reset, a 5xx and an environment TLS failure", async () => {
    for (const err of [new CrawlError("dns_failed", { retryable: true }), new CrawlError("network_error", { retryable: true }), new CrawlError("http_status", { status: 500, retryable: true }), new CrawlError("tls_unverified", { retryable: true })]) {
      let n = 0;
      await expect(
        withRetry(
          async () => {
            n++;
            if (n < 3) throw err;
            return "ok";
          },
          opts,
        ),
      ).resolves.toBe("ok");
      expect(n).toBe(3);
    }
  });

  it("keeps today's backoff for 429 and 503: retryable, Retry-After honoured", async () => {
    const fourTwoNine = new CrawlError("http_status", { status: 429, retryable: true, retryAfterMs: 1 });
    const fiveOhThree = new CrawlError("http_status", { status: 503, retryable: true, retryAfterMs: 1 });
    for (const err of [fourTwoNine, fiveOhThree]) {
      expect(fetchFailureClass(err)).toBe("temporary");
      let n = 0;
      await expect(
        withRetry(
          async () => {
            n++;
            if (n < 3) throw err;
            return "ok";
          },
          opts,
        ),
      ).resolves.toBe("ok");
      expect(n).toBe(3);
    }
  });
});

describe("the resolver split (WP13)", () => {
  const policyWith = (thrower: (host: string) => never | ResolvedAddress[]): NetPolicy => {
    const prod = productionPolicy();
    return {
      resolve: async (host) => thrower(host),
      isAddressAllowed: prod.isAddressAllowed,
      isPortAllowed: prod.isPortAllowed,
    };
  };

  it("a resolver ENOTFOUND is the permanent dns_not_found", async () => {
    const p = policyWith(() => {
      throw errno("ENOTFOUND");
    });
    const err = await resolveAllowed("gone.example", p).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "dns_not_found", retryable: false });
  });

  it("any other resolver failure stays the temporary dns_failed", async () => {
    const p = policyWith(() => {
      throw errno("EAI_AGAIN");
    });
    const err = await resolveAllowed("flake.example", p).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "dns_failed", retryable: true });
  });

  it("an empty answer stays the temporary dns_failed", async () => {
    const p = policyWith(() => [] as ResolvedAddress[]);
    const err = await resolveAllowed("empty.example", p).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "dns_failed", retryable: true });
  });
});

describe("robots.txt passes a permanent failure through (WP13)", () => {
  const url = new URL("https://x.example/page");

  it("rethrows a dead name and a certificate failure instead of disallowing", async () => {
    for (const err of [new CrawlError("dns_not_found"), new CrawlError("tls_failed")]) {
      const outcomes: string[] = [];
      const cache = new RobotsCache(
        () => {
          throw err;
        },
        "AsmitaCrawler",
        (o) => outcomes.push(o),
      );
      await expect(cache.isAllowed(url)).rejects.toMatchObject({ code: err.code });
      expect(outcomes).toEqual([]); // not an "unreachable robots" policy decision
    }
  });

  it("does not cache a permanent robots failure: the next request asks again (review fix)", async () => {
    // One bad resolver answer must not condemn every page of the origin for
    // the rest of the run: the rejected verdict is dropped from the cache,
    // so the next request re-probes robots.txt (and may get a better answer).
    let calls = 0;
    const cache = new RobotsCache(
      () => {
        calls++;
        throw new CrawlError("dns_not_found");
      },
      "AsmitaCrawler",
    );
    await expect(cache.isAllowed(url)).rejects.toMatchObject({ code: "dns_not_found" });
    await expect(cache.isAllowed(url)).rejects.toMatchObject({ code: "dns_not_found" });
    expect(calls).toBe(2);
  });

  it("still treats temporary failures as robots-unreachable: disallow all", async () => {
    for (const err of [new CrawlError("dns_failed", { retryable: true }), new CrawlError("network_error", { retryable: true }), new CrawlError("http_status", { status: 503, retryable: true })]) {
      const outcomes: string[] = [];
      const cache = new RobotsCache(
        () => {
          throw err;
        },
        "AsmitaCrawler",
        (o) => outcomes.push(o),
      );
      await expect(cache.isAllowed(url)).resolves.toBe(false);
      expect(outcomes).toEqual(["unreachable"]);
    }
  });

  it("keeps the same rules for a fetched robots.txt", async () => {
    const ok = (): FetchResult => ({
      url: new URL("https://x.example/robots.txt"),
      status: 200,
      contentType: "text/plain",
      body: Buffer.from("User-agent: *\nDisallow: /private/\n"),
      xRobotsTag: "",
      etag: null,
      lastModified: null,
    });
    const cache = new RobotsCache(async () => ok(), "AsmitaCrawler");
    await expect(cache.isAllowed(new URL("https://x.example/page"))).resolves.toBe(true);
    await expect(cache.isAllowed(new URL("https://x.example/private/x"))).resolves.toBe(false);
  });
});

describe("run summary counts failures by class (WP13)", () => {
  it("counts each class where the error code is recorded", () => {
    const m = new RunMetrics(0);
    m.error("dns_not_found");
    m.error("tls_failed");
    m.error("dns_not_found");
    m.error("network_error");
    m.error("connect_timeout");
    m.error("http_status", 500);
    m.error("http_status", 503);
    m.error("http_status", 429);
    m.error("http_status"); // no status known: the code counter only
    m.error("robots_disallowed");
    m.error("out_of_scope");
    m.error("api_network");
    expect(m.failures).toEqual({ permanent: 3, temporary: 5 });
  });

  it("carries the class counts and the home-page counter in the summary", () => {
    const m = new RunMetrics(0);
    m.error("dns_not_found");
    m.error("network_error");
    m.homePermanentFailures = 1;
    const summary = m.summary({ now: 5, budgetPages: 10, budgetImages: 10, outcome: "completed" });
    expect(summary.failures).toEqual({ permanent: 1, temporary: 1 });
    expect(summary.homePermanentFailures).toBe(1);
    expect(summary.errors).toEqual({ dns_not_found: 1, network_error: 1 });
  });
});
