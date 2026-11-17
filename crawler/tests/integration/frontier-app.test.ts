/**
 * The app-backed frontier (crawler v2 WP3), end to end against the fixture
 * site and the mock API's frontier:
 *   - a second run does not refetch unchanged pages (If-None-Match -> 304);
 *   - two crawler processes against one API never fetch the same URL in the
 *     same window (claims are exclusive);
 *   - a killed run loses at most its claimed batch, which becomes due again
 *     after the 30-minute claim window.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import { buildFixture, fixtureSeedUrl, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

const HOUR = 60 * 60 * 1000;
const ETAG_HOST = `etag.${SOURCE_DOMAIN}`;

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildFixture();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

async function mock(opts: Omit<MockAsmitaOptions, "key" | "pool">): Promise<MockAsmita> {
  const api = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, seedUrl: opts.seedUrl ?? fixtureSeedUrl(fx.site.port), ...opts }).start();
  servers.push(api);
  return api;
}

describe("conditional GET: a second run does not refetch unchanged pages", () => {
  it("claims nothing while pages are scheduled, then 304s instead of refetching", async () => {
    let clock = Date.parse("2026-11-17T10:00:00Z");
    const api = await mock({
      sources: [{ id: "src-etag", kind: "site", domain: ETAG_HOST, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "http" }],
      now: () => clock,
    });
    const site = () => fx.site.requests.filter((r) => r.host === ETAG_HOST && r.path !== "/robots.txt");

    const first = await runFixtureCrawl(fx.site, api);
    expect(first.result.exitCode).toBe(0);
    expect(first.result.summary.pagesFetched).toBe(2);
    expect(first.result.summary.pagesNotModified).toBe(0);
    expect(site().map((r) => r.path)).toEqual(["/", "/b", "/nonexistent"]);
    for (const r of site()) expect(r.headers["if-none-match"]).toBeUndefined();

    // A second run in the same window claims nothing at all: every page is
    // scheduled ahead (fetched pages 24 h out, the gone page dead).
    const before = site().length;
    const sameWindow = await runFixtureCrawl(fx.site, api);
    expect(sameWindow.result.summary.pagesAttempted).toBe(0);
    expect(site().length).toBe(before);

    // A day later the two live pages are due again: the crawler sends the
    // stored validators and the site answers 304, so nothing is refetched.
    clock += 25 * HOUR;
    const second = await runFixtureCrawl(fx.site, api);
    expect(second.result.exitCode).toBe(0);
    expect(second.result.summary.pagesAttempted).toBe(2);
    expect(second.result.summary.pagesNotModified).toBe(2);
    expect(second.result.summary.pagesFetched).toBe(0);
    const requests = site();
    expect(requests.filter((r) => r.path === "/").map((r) => r.headers["if-none-match"])).toEqual([undefined, "tag-a"]);
    expect(requests.filter((r) => r.path === "/b").map((r) => r.headers["if-none-match"])).toEqual([undefined, "tag-b"]);
    // The gone page was never requested again.
    expect(requests.filter((r) => r.path === "/nonexistent")).toHaveLength(1);
    // The frontier rows say what happened: doubling schedule, dead page.
    const rows = [...api.pages.values()];
    expect(rows.filter((r) => r.status === "NOT_MODIFIED")).toHaveLength(2);
    expect(rows.find((r) => r.url.endsWith("/nonexistent"))?.status).toBe("GONE");
  }, 30_000);
});

describe("two crawler processes, one frontier", () => {
  it("never fetch the same URL in the same window and together find everything", async () => {
    const api = await mock({ sources: [{ id: "src-two", kind: "site", domain: SOURCE_DOMAIN, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "http" }] });
    // The page set an earlier run would have reported, so both processes
    // have real work from their first claim. The depth-2 rows keep the
    // crawler's MAX_DEPTH in force (no /level3 row may be created).
    const port = fx.site.port;
    const atDepth0 = ["/", "/gallery", "/lazy", "/moved", "/doc.pdf", "/private/secret", "/nofollow-page", "/goaway"]
      .map((p) => `http://${SOURCE_DOMAIN}:${port}${p}`);
    const atDepth2 = ["/level1", "/level2"].map((p) => `http://${SOURCE_DOMAIN}:${port}${p}`);
    atDepth0.push(`http://www.${SOURCE_DOMAIN}:${port}/sub`);
    for (const url of atDepth0) api.addPage("src-two", url, 0);
    for (const url of atDepth2) api.addPage("src-two", url, 2);

    const before = fx.site.requests.length;
    const [a, b] = (await Promise.all([
      runFixtureCrawl(fx.site, api, { env: { FRONTIER_CLAIM_LIMIT: "4" } }),
      runFixtureCrawl(fx.site, api, { env: { FRONTIER_CLAIM_LIMIT: "4" } }),
    ])) as Array<{ result: RunResult; lines: string[] }>;
    expect(a.result.exitCode).toBe(0);
    expect(b.result.exitCode).toBe(0);

    // No page was handed to both processes: every page path (robots and
    // images aside) was requested at most once across the two runs.
    const crawlRequests = fx.site.requests.slice(before).filter(
      (r) => (r.host === SOURCE_DOMAIN || r.host === `www.${SOURCE_DOMAIN}`) && r.path !== "/robots.txt" && !r.path.startsWith("/img/") && !r.path.startsWith("/assets/"),
    );
    const byPath = new Map<string, number>();
    for (const r of crawlRequests) {
      const key = `${r.host}${r.path}`;
      byPath.set(key, (byPath.get(key) ?? 0) + 1);
    }
    expect(byPath.size).toBeGreaterThanOrEqual(atDepth0.length + atDepth2.length);
    expect([...byPath.values()].every((n) => n === 1)).toBe(true);
    // Every frontier row (the pre-seeded pages plus the one the runs
    // discovered: the www home page) was claimed by exactly one run.
    expect((a.result.summary.pagesAttempted as number) + (b.result.summary.pagesAttempted as number)).toBe(api.pages.size);
    // Together they found every planted image exactly once.
    expect(api.created.size).toBe(fx.expected.length);
    expect(api.posted.length).toBe(fx.expected.length);
    expect((a.result.summary.findingsAccepted as number) + (b.result.summary.findingsAccepted as number)).toBe(fx.expected.length);
  }, 60_000);
});

describe("a killed run", () => {
  it("loses at most its claimed batch, which becomes due again after 30 minutes", async () => {
    const api = await mock({ sources: [{ id: "src-kill", kind: "site", domain: SOURCE_DOMAIN, pageBudget: 50, delayMs: 150, origin: "admin", hops: 0, render: "http" }] });
    const isPage = (path: string) => path !== "/robots.txt" && !path.startsWith("/img/") && !path.startsWith("/assets/");
    const baseline = fx.site.requests.length;
    const pageRequests = () => fx.site.requests.slice(baseline).filter((r) => r.host === SOURCE_DOMAIN && isPage(r.path)).length; 

    // Stop deterministically mid-batch: after four page fetches (the seed
    // plus three of the nine-page second batch), while the fourth is still
    // being processed (each page holds its host slot for delayMs).
    const stop = new AbortController();
    const watch = setInterval(() => {
      if (pageRequests() >= 4) {
        clearInterval(watch);
        stop.abort();
      }
    }, 10);
    const killed = await runFixtureCrawl(fx.site, api, { stopSignal: stop.signal });
    clearInterval(watch);
    expect(killed.result.outcome).toBe("stopped");

    // The lost batch: claimed by the killed run, never reported.
    const reported = new Set([...api.pages.values()].filter((r) => r.lastFetchedAt !== null).map((r) => r.id));
    const lost = [...api.pages.values()].filter((r) => r.lastFetchedAt === null && r.claimedUntil !== null);
    expect(lost.length).toBeGreaterThan(0);

    // Within the 30-minute claim window nothing that was claimed (and lost)
    // is due again, and nothing already reported is either.
    const nowClaim = api.claimFrontier("src-kill", 50);
    expect(nowClaim.map((u) => u.id).filter((id) => lost.some((row) => row.id === id))).toEqual([]);
    expect(nowClaim.map((u) => u.id).filter((id) => reported.has(id))).toEqual([]);

    // 31 minutes later the lost batch is due again, whole.
    const clock = Date.now();
    api.opts.now = () => clock + 31 * 60 * 1000;
    const recovered = api.claimFrontier("src-kill", 50);
    const recoveredIds = new Set(recovered.map((u) => u.id));
    for (const row of lost) expect(recoveredIds.has(row.id)).toBe(true);

    // A fresh run an hour past the claim window finishes the source. A page
    // the killed run was mid-way through is redone whole (so it, and only
    // it, may be fetched twice); everything else is fetched exactly once.
    api.opts.now = () => clock + 62 * 60 * 1000;
    const second = await runFixtureCrawl(fx.site, api);
    expect(second.result.exitCode).toBe(0);
    const byPath = new Map<string, number>();
    for (const r of fx.site.requests.slice(baseline).filter((r) => r.host === SOURCE_DOMAIN && isPage(r.path))) {
      const key = `${r.host}${r.path}`;
      byPath.set(key, (byPath.get(key) ?? 0) + 1);
    }
    const fetchedTwice = [...byPath.entries()].filter(([, n]) => n === 2).map(([key]) => key);
    expect([...byPath.values()].every((n) => n <= 2)).toBe(true); // at most: once per run
    expect(fetchedTwice.length).toBeLessThanOrEqual(lost.length); // only lost-batch pages are redone
    // Every finding was delivered in the end.
    expect(api.created.size).toBe(fx.expected.length);
  }, 90_000);
});
