/**
 * Do not retry what cannot work (crawler v3 WP13), end to end against the
 * permanent-failure fixture and the mock API's frontier:
 *   - a DNS name that does not exist is reported `gone` on the first attempt
 *     (one robots.txt probe, one page fetch, no in-run retry), the app marks
 *     the row dead without the five error retries, and a second run claims
 *     nothing;
 *   - temporary failures (a plain 500, a 502, a connection reset, a 429)
 *     keep today's treatment: the in-run retry set is untouched (500 once,
 *     502/reset/429 three times), the report says `error`, and the app
 *     backs off 1 h with the failure count at one;
 *   - the run summary counts failures by class and counts a source whose
 *     home page failed permanently once, with no hostname in any log line.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FetchOptions, FetchResult, SafeFetcher } from "../../src/net/safe-fetch.ts";
import {
  buildPermanentFailuresFixture,
  DEAD_HOST,
  fixtureSeedUrl,
  PERMANENT_FAILURE_HOSTS,
  RATE429_HOST,
  RESET_HOST,
  TEMP500_HOST,
  TEMP502_HOST,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

const HOUR = 60 * 60 * 1000;

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildPermanentFailuresFixture();
}, 30_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

async function mock(opts: Omit<MockAsmitaOptions, "key" | "pool">): Promise<MockAsmita> {
  const api = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, seedUrl: fixtureSeedUrl(fx.site.port), ...opts }).start();
  servers.push(api);
  return api;
}

/** A counting wrapper around the SafeFetcher: how many fetches were attempted. */
function countingFetch(counter: { calls: number }): (inner: SafeFetcher) => Pick<SafeFetcher, "fetch"> {
  return (inner) => ({
    fetch: (input: string | URL, opts: FetchOptions): Promise<FetchResult> => {
      counter.calls++;
      return inner.fetch(input, opts);
    },
  });
}

describe("a DNS name that does not exist is permanent", () => {
  it("is reported gone on the first attempt and never refetched", async () => {
    const counter = { calls: 0 };
    const api = await mock({
      sources: [{ id: "src-dead", kind: "site", domain: DEAD_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" }],
    });

    const first = await runFixtureCrawl(fx.site, api, {
      hosts: PERMANENT_FAILURE_HOSTS, // dead.test is deliberately absent: ENOTFOUND
      env: { FETCH_ATTEMPTS: "3" }, // retries are allowed, so "no retry" is proven, not configured away
      wrapFetcher: countingFetch(counter),
    });
    expect(first.result.exitCode).toBe(0);

    // One robots.txt probe (the only network attempt the dead host gets) and
    // one page fetch call that fails in its pre-hop: no in-run retry.
    expect(counter.calls).toBe(2);

    // The page was reported gone straight away; the row is dead, not backed off.
    expect(api.reports).toHaveLength(1);
    expect(api.reports[0]!.statuses).toEqual({ gone: 1 });
    const row = [...api.pages.values()][0]!;
    expect(row.status).toBe("GONE");
    expect(row.failCount).toBe(0); // dead without five retries

    // The run summary counts the class and the dead home page, once.
    const summary = first.result.summary as Record<string, unknown>;
    expect(summary.errors).toEqual({ dns_not_found: 1 });
    expect(summary.failures).toEqual({ permanent: 1, temporary: 0 });
    expect(summary.homePermanentFailures).toBe(1);
    expect(summary.pagesAttempted).toBe(1);

    // No hostname, URL or fingerprint anywhere in the log.
    assertCleanLog(first.lines.join("\n"), { hostnames: [DEAD_HOST], hashes: [] });

    // A second run claims nothing: the row is dead for good, no backoff.
    const secondCounter = { calls: 0 };
    const second = await runFixtureCrawl(fx.site, api, {
      hosts: PERMANENT_FAILURE_HOSTS,
      env: { FETCH_ATTEMPTS: "3" },
      wrapFetcher: countingFetch(secondCounter),
    });
    expect(second.result.exitCode).toBe(0);
    expect(second.result.summary.pagesAttempted).toBe(0);
    expect(secondCounter.calls).toBe(0);
  }, 30_000);
});

describe("temporary failures keep today's backoff", () => {
  it("keeps the in-run retry set and reports error, so the app backs off 1 h", async () => {
    let clock = Date.parse("2026-11-19T10:00:00Z");
    const api = await mock({
      sources: [
        { id: "src-500", kind: "site", domain: TEMP500_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" },
        { id: "src-502", kind: "site", domain: TEMP502_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" },
        { id: "src-reset", kind: "site", domain: RESET_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" },
        { id: "src-429", kind: "site", domain: RATE429_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" },
      ],
      now: () => clock,
    });

    const run = await runFixtureCrawl(fx.site, api, {
      hosts: PERMANENT_FAILURE_HOSTS,
      env: { FETCH_ATTEMPTS: "3" },
    });
    expect(run.result.exitCode).toBe(0);

    // Today's in-run retry set, untouched: a plain 500 is fetched once
    // (never retryable in-run), while 502, a connection reset and a 429 are
    // each attempted FETCH_ATTEMPTS times.
    const hits = (host: string) => fx.site.requests.filter((r) => r.host === host && r.path === "/").length;
    expect(hits(TEMP500_HOST)).toBe(1);
    expect(hits(TEMP502_HOST)).toBe(3);
    expect(hits(RESET_HOST)).toBe(3);
    expect(hits(RATE429_HOST)).toBe(3);
    // robots.txt once per host, like every fetch path.
    for (const host of PERMANENT_FAILURE_HOSTS) {
      expect(fx.site.requests.filter((r) => r.host === host && r.path === "/robots.txt").length).toBe(1);
    }

    // Every page reported error: the app keeps the 1 h / 6 h / 24 h backoff.
    const statuses = api.reports.flatMap((r) => Object.entries(r.statuses));
    expect(statuses).toContainEqual(["error", 1]);
    expect(statuses.filter(([s]) => s === "error").length).toBe(4);
    expect(statuses.some(([s]) => s === "gone" || s === "blocked")).toBe(false);
    for (const row of api.pages.values()) {
      expect(row.status).toBe("ERROR");
      expect(row.failCount).toBe(1);
      expect(row.nextDueAt).toBe(clock + HOUR); // the first error backoff
      expect(row.claimedUntil).toBeNull();
    }

    // The summary counts the class: four temporary failures, none permanent,
    // and no source's home page counted as permanently dead.
    const summary = run.result.summary as Record<string, unknown>;
    expect(summary.failures).toEqual({ permanent: 0, temporary: 4 });
    expect(summary.homePermanentFailures).toBe(0);
    expect((summary.errors as Record<string, number>).http_status).toBe(3); // 500, 502 and 429
    assertCleanLog(run.lines.join("\n"), { hostnames: [...PERMANENT_FAILURE_HOSTS], hashes: [] });

    // The error rows are still due later: an hour on, the same pages are
    // handed out again (the second backoff step is 6 h after that).
    clock += 61 * 60 * 1000;
    for (const sourceId of ["src-500", "src-502", "src-reset", "src-429"]) {
      expect(api.claimFrontier(sourceId, 10)).toHaveLength(1);
    }
  }, 30_000);
});
