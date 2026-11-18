/**
 * Crawler v3 WP9, the "done when" fixture: three sources whose robots.txt
 * names no sitemap are probed at the conventional paths — /sitemap.xml
 * first, then /sitemap_index.xml when the first answered nothing usable,
 * plus the registrable parent domain's /sitemap.xml for a subdomain
 * source — through safe-fetch, robots-checked, counted against the page
 * budget, at most two probes (plus one parent probe) per source per run.
 * Pages found by a probe are reported through the frontier and fetched;
 * out-of-scope entries of the parent sitemap are dropped; a 404 or
 * non-XML answer is quietly ignored (no error code, no discovery).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildSitemapProbeFixture,
  fixtureSeedUrl,
  PROBE_HOSTS,
  PROBE_INDEX_HOST,
  PROBE_PARENT_HOST,
  PROBE_PLAIN_HOST,
  PROBE_SIB_HOST,
  PROBE_SUB_HOST,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];
const servers: MockAsmita[] = [];

const count = (host: string, path: string) => fx.site.requests.filter((r) => r.host === host && r.path === path).length;

beforeAll(async () => {
  fx = await buildSitemapProbeFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      siteSource({ id: "src-probe-plain", domain: PROBE_PLAIN_HOST, pageBudget: 12, delayMs: 0 }),
      siteSource({ id: "src-probe-index", domain: PROBE_INDEX_HOST, pageBudget: 12, delayMs: 0 }),
      siteSource({ id: "src-probe-sub", domain: PROBE_SUB_HOST, pageBudget: 12, delayMs: 0 }),
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  servers.push(api);
  ({ result } = await runFixtureCrawl(fx.site, api, { hosts: PROBE_HOSTS, lines: logLines }));
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

describe("sitemap probing (WP9)", () => {
  it("probes /sitemap.xml first, /sitemap_index.xml only on a miss, and the parent's /sitemap.xml once per source", () => {
    const s = result.summary;
    // (a) plain: the first probe hit a urlset, so the second path is never probed.
    expect(count(PROBE_PLAIN_HOST, "/sitemap.xml")).toBe(1);
    expect(count(PROBE_PLAIN_HOST, "/sitemap_index.xml")).toBe(0);
    // (b) index: /sitemap.xml 404s quietly, then /sitemap_index.xml answers.
    expect(count(PROBE_INDEX_HOST, "/sitemap.xml")).toBe(1);
    expect(count(PROBE_INDEX_HOST, "/sitemap_index.xml")).toBe(1);
    // (c) sub: a non-XML answer, then a 404 — both quietly ignored.
    expect(count(PROBE_SUB_HOST, "/sitemap.xml")).toBe(1);
    expect(count(PROBE_SUB_HOST, "/sitemap_index.xml")).toBe(1);
    // Every source is on a subdomain of probe.test: one parent probe each,
    // its robots.txt fetched once for the run (cached per origin).
    expect(count(PROBE_PARENT_HOST, "/sitemap.xml")).toBe(3);
    expect(count(PROBE_PARENT_HOST, "/robots.txt")).toBe(1);
    // At most two probes plus one parent probe per source: 2 + 3 + 3 = 8.
    expect(s.sitemapProbes).toBe(8);
    expect(s.robots).toEqual({ ok: 4 });
    expect(result.exitCode).toBe(0);
    expect(result.outcome).toBe("completed");
  });

  it("reports the probed pages, follows the index child, and finds every planted image", () => {
    // Every page the probes discovered was fetched exactly once, through the
    // frontier like any page (the index child is a claimed sitemap row).
    expect(count(PROBE_PLAIN_HOST, "/")).toBe(1);
    expect(count(PROBE_PLAIN_HOST, "/alpha")).toBe(1);
    expect(count(PROBE_PLAIN_HOST, "/beta")).toBe(1);
    expect(count(PROBE_INDEX_HOST, "/sitemap-child.xml")).toBe(1);
    expect(count(PROBE_INDEX_HOST, "/gamma")).toBe(1);
    expect(count(PROBE_SUB_HOST, "/kept")).toBe(1);
    for (const e of fx.expected) {
      expect(fx.site.requests.filter((r) => r.host === e.imageHost && r.path === e.imagePath), e.imagePath).toHaveLength(1);
    }
    const port = fx.site.port;
    // Every planted page and image lives on its own source host here.
    const sourceOf = (host: string) =>
      host === PROBE_PLAIN_HOST ? "src-probe-plain" : host === PROBE_INDEX_HOST ? "src-probe-index" : "src-probe-sub";
    const got = api.posted
      .map((f) => ({ fingerprintId: f.fingerprintId, pageUrl: f.pageUrl, imageUrl: f.imageUrl, sourceId: f.sourceId }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    const want = fx.expected
      .map((e) => ({
        fingerprintId: e.fingerprintId,
        pageUrl: `http://${e.imageHost}:${port}${e.pagePath}`,
        imageUrl: `http://${e.imageHost}:${port}${e.imagePath}`,
        sourceId: sourceOf(e.imageHost),
      }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    expect(got).toEqual(want);
    expect(api.created.size).toBe(want.length);
    expect(result.summary.matches).toBe(want.length);
    expect(result.summary.findingsUnsent).toBe(0);
    // The probed documents reuse the WP4 parse: counted like any sitemap
    // (six parsed docs — the plain urlset, the index, its child and the
    // parent urlset three times — of which only the child was a claimed page).
    const s = result.summary;
    expect(s.sitemapDocs).toBe(6);
    expect(s.pagesXml).toBe(1);
    expect(s.sitemapUrlsTaken).toBe(13); // 2 + 1 + 1 + 3x3 page and child addresses (the <image:loc> counts under sitemapImages)
    expect(s.sitemapImages).toBe(1); // beta's <image:loc>, hashed for its page
    expect(s.docsTruncated).toBe(0);
    expect(api.badRequests).toEqual([]);
    expect(Math.max(...api.bodySizes)).toBeLessThanOrEqual(256 * 1024);
  });

  it("keeps only the parent sitemap's in-scope entries and never fetches the rest", () => {
    // The parent sitemap listed a sibling's page and the apex's own page;
    // both are outside sub.probe.test's scope and were dropped.
    expect(fx.site.requests.filter((r) => r.host === PROBE_SIB_HOST)).toHaveLength(0);
    expect(fx.site.requested(PROBE_PARENT_HOST, "/apex-dropped")).toBe(false);
    // The parent host saw only its robots.txt and the three probes.
    const parentPaths = new Set(fx.site.requests.filter((r) => r.host === PROBE_PARENT_HOST).map((r) => r.path));
    expect([...parentPaths].sort()).toEqual(["/robots.txt", "/sitemap.xml"]);
    // The in-scope entry became a frontier page and was fetched.
    expect(count(PROBE_SUB_HOST, "/kept")).toBe(1);
    // Off-scope sitemap entries are not discoveries either: no host was reported.
    expect(api.discoveryReports).toEqual([]);
  });

  it("records no error code for the missed probes (404 and non-XML are quiet)", () => {
    expect(result.summary.errors).toEqual({});
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), {
      hostnames: PROBE_HOSTS,
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)],
    });
    const summary = logLines.map((l) => JSON.parse(l) as { event: string }).find((l) => l.event === "run_summary");
    expect(summary).toBeDefined();
  });
});

describe("the probes count against the page budget", () => {
  it("spend the source's budget but never the slots its claimed batch needs", async () => {
    // Budget 5 against the plain source: 2 probes + the home page, /alpha
    // and /beta = exactly 5 attempts, and every content page still crawled.
    const tight = await new MockAsmita({
      key: TEST_KEY,
      pool: fx.pool,
      sources: [siteSource({ id: "src-tight", domain: PROBE_PLAIN_HOST, pageBudget: 5, delayMs: 0 })],
      seedUrl: fixtureSeedUrl(fx.site.port),
    }).start();
    servers.push(tight);
    try {
      const baseline = fx.site.requests.length;
      const { result: run } = await runFixtureCrawl(fx.site, tight, { hosts: PROBE_HOSTS });
      expect(run.exitCode).toBe(0);
      expect(run.summary.pagesAttempted).toBe(5); // 2 probes + 3 pages
      expect(run.summary.sitemapProbes).toBe(2);
      const since = () => fx.site.requests.slice(baseline).filter((r) => r.host === PROBE_PLAIN_HOST);
      expect(since().filter((r) => r.path === "/").length).toBe(1);
      expect(since().filter((r) => r.path === "/alpha").length).toBe(1);
      expect(since().filter((r) => r.path === "/beta").length).toBe(1);
      expect(tight.posted.map((f) => f.fingerprintId).sort()).toEqual(["fp-probe-alpha", "fp-probe-beta"]);
    } finally {
      await tight.stop();
    }
  }, 60_000);
});
