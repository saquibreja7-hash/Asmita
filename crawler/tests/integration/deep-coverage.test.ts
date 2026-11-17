/**
 * Crawler v2 WP4, the "done when" fixture: a source with a sitemap index, a
 * gzipped sitemap, an Atom feed, 30 paginated listing pages and images
 * hidden in lazy attributes, inline background styles, a video poster,
 * image_src, JSON-LD, noscript and thumbnail links is fully covered within
 * its budget, every planted image is found exactly once, and a crawler-trap
 * source (infinite calendar, date archives, query-string traps) stays
 * within its caps.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newQueryGuardStore, type RunResult } from "../../src/crawler.ts";
import { loadConfig } from "../../src/config.ts";
import {
  buildDeepFixture,
  DEEP_HOST,
  fixtureEnv,
  fixtureSeedUrl,
  TEST_KEY,
  TRAP_HOST,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];

beforeAll(async () => {
  fx = await buildDeepFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      siteSource({ id: "src-deep", domain: DEEP_HOST, pageBudget: 60, delayMs: 0 }),
      siteSource({ id: "src-trap", domain: TRAP_HOST, pageBudget: 20, delayMs: 0 }),
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, { lines: logLines, env: { MAX_DEPTH: "6" } }));
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("deep coverage", () => {
  it("follows the robots sitemap, the index, the gzipped sitemap and the Atom feed", () => {
    expect(fx.site.requested(DEEP_HOST, "/sitemap-index.xml")).toBe(true); // named in robots.txt
    expect(fx.site.requested(DEEP_HOST, "/sitemap-pages.xml.gz")).toBe(true);
    expect(fx.site.requested(DEEP_HOST, "/feed.atom")).toBe(true); // linked from the home page
    const s = result.summary;
    expect(s.pagesXml).toBe(3); // index + gzipped urlset + feed
    expect(s.sitemapDocs).toBe(2);
    expect(s.sitemapUrlsTaken).toBe(32); // 30 listing pages + the gallery + the child sitemap
    expect(s.sitemapImages).toBe(1);
    expect(s.feedsParsed).toBe(1);
    expect(s.feedEntriesTaken).toBe(3);
    expect(s.docsTruncated).toBe(0);
    expect(s.robots).toEqual({ ok: 2 });
  });

  it("fetches every listing page, feed entry and sitemap page exactly once, within its budget", () => {
    for (let n = 1; n <= 30; n++) {
      expect(fx.site.requests.filter((r) => r.host === DEEP_HOST && r.path === `/listing?page=${n}`)).toHaveLength(1);
    }
    for (let n = 1; n <= 3; n++) expect(fx.site.requested(DEEP_HOST, `/post/${n}`)).toBe(true);
    expect(fx.site.requests.filter((r) => r.host === DEEP_HOST && r.path === "/gallery-deep")).toHaveLength(1);
    const s = result.summary;
    expect(s.pagesAttempted).toBe(57); // 47 deep + 10 trap, well inside both budgets
    expect(s.pagesFetched).toBe(46); // HTML pages: 38 content pages + the 8 admitted trap variants
    expect(s.pagesNonHtml).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.outcome).toBe("completed");
    expect(api.badRequests).toEqual([]);
    expect(Math.max(...api.bodySizes)).toBeLessThanOrEqual(256 * 1024);
  });

  it("finds every planted image exactly once, attributed to its page", () => {
    const port = fx.site.port;
    // Every planted image address was requested exactly once.
    for (const e of fx.expected) {
      expect(fx.site.requests.filter((r) => r.host === e.imageHost && r.path === e.imagePath), e.imagePath).toHaveLength(1);
    }
    // And produced exactly one finding per planted fingerprint, at its page.
    const got = api.posted
      .map((f) => ({ fingerprintId: f.fingerprintId, pageUrl: f.pageUrl, imageUrl: f.imageUrl, sourceId: f.sourceId }))
      .sort((a, b) => (a.fingerprintId + a.imageUrl).localeCompare(b.fingerprintId + b.imageUrl));
    const want = fx.expected
      .map((e) => ({
        fingerprintId: e.fingerprintId,
        pageUrl: `http://${DEEP_HOST}:${port}${e.pagePath}`,
        imageUrl: `http://${e.imageHost}:${port}${e.imagePath}`,
        sourceId: "src-deep",
      }))
      .sort((a, b) => (a.fingerprintId + a.imageUrl).localeCompare(b.fingerprintId + b.imageUrl));
    expect(got).toEqual(want);
    expect(api.created.size).toBe(want.length);
    expect(result.summary.matches).toBe(want.length);
    expect(result.summary.findingsUnsent).toBe(0);
    // The suppressed thumbnail and the sitemap-only image behave as designed.
    expect(fx.site.requested(DEEP_HOST, "/img/thumb-decoy.png")).toBe(false);
    expect(fx.site.requests.filter((r) => r.host === DEEP_HOST && r.path === "/img/sitemap-image.png")).toHaveLength(1);
  });

  it("never fetches non-content links on either source", () => {
    expect(fx.site.requested(DEEP_HOST, "/login")).toBe(false);
    expect(fx.site.requested(DEEP_HOST, "/search")).toBe(false);
    expect(fx.site.requested(DEEP_HOST, "/cart")).toBe(false);
    expect(fx.site.requested(DEEP_HOST, "/calendar/2026-01-01")).toBe(false);
    expect(fx.site.requested(TRAP_HOST, "/login")).toBe(false);
    // The infinite calendar and the date archive were never entered, even
    // though their links are marked rel=next with pagination classes.
    expect(fx.site.requests.some((r) => r.host === TRAP_HOST && r.path.startsWith("/cal/"))).toBe(false);
    expect(fx.site.requests.some((r) => r.host === TRAP_HOST && /^\/2026\/\d{2}/.test(r.path))).toBe(false);
    const s = result.summary;
    // 4 on the deep home page + 30 calendar-view links on the listing pages + 3 on the trap home page.
    expect(s.linksSkippedNonContent).toBe(37);
  });

  it("keeps the query-string traps inside the per-path variant cap", () => {
    const qtRows = [...api.pages.values()].filter((p) => p.sourceId === "src-deep" && p.url.includes("/qtrap-item"));
    expect(qtRows).toHaveLength(8); // MAX_QUERY_VARIANTS_PER_PATH (default 8) of 40 offered
    const tRows = [...api.pages.values()].filter((p) => p.sourceId === "src-trap" && p.url.includes("/t?"));
    expect(tRows).toHaveLength(8);
    expect(result.summary.linksSkippedQueryCap).toBe(64); // 32 + 32 refused
  });

  it("reports sitemap and feed link kinds to the app", () => {
    const kinds = new Set<string>();
    for (const req of api.requests) {
      if (req.path !== "/api/crawler/frontier/report" || req.body === undefined) continue;
      for (const page of (req.body as { pages?: Array<{ links?: Array<{ kind?: string }> }> }).pages ?? []) {
        for (const link of page.links ?? []) if (link.kind !== undefined) kinds.add(link.kind);
      }
    }
    expect(kinds.has("sitemap")).toBe(true);
    expect(kinds.has("feed")).toBe(true);
    expect(kinds.has("page")).toBe(true);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), {
      hostnames: [DEEP_HOST, TRAP_HOST],
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)],
    });
    const summary = logLines.map((l) => JSON.parse(l) as { event: string }).find((l) => l.event === "run_summary");
    expect(summary).toBeDefined();
  });
});

describe("the query-variant guard across --loop passes", () => {
  it("does not give a query-string trap a fresh allowance on the next pass", async () => {
    // A pass with the store an earlier pass of the same process left behind:
    // the trap path's allowance is already spent, so this pass reports no
    // new variant of it. (A fresh store per pass would admit 8 again.)
    const loopApi = await new MockAsmita({
      key: TEST_KEY,
      pool: fx.pool,
      sources: [siteSource({ id: "src-trap-loop", domain: TRAP_HOST, pageBudget: 20, delayMs: 0 })],
      seedUrl: fixtureSeedUrl(fx.site.port),
    }).start();
    try {
      const store = newQueryGuardStore(loadConfig(fixtureEnv(loopApi.url, TEST_KEY)));
      const earlier = store.guardFor("src-trap-loop");
      for (let i = 1; i <= 8; i++) {
        expect(earlier.admit(new URL(`http://${TRAP_HOST}:${fx.site.port}/t?u=earlier-${i}`))).toBe(true);
      }
      const { result: pass } = await runFixtureCrawl(fx.site, loopApi, { env: { MAX_DEPTH: "6" }, queryGuards: store });
      expect(pass.exitCode).toBe(0);
      const tRows = [...loopApi.pages.values()].filter((p) => p.url.includes("/t?"));
      expect(tRows).toHaveLength(0);
      expect(pass.summary.linksSkippedQueryCap).toBeGreaterThanOrEqual(40);
    } finally {
      await loopApi.stop();
    }
  }, 60_000);
});
