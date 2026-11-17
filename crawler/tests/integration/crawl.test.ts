/**
 * Full fixture crawl: a local site with planted synthetic images whose
 * fingerprints are in the mock pool. Asserts exactly the expected findings
 * are posted, that nothing off-domain, robots-disallowed or nofollow was
 * requested, that crawled hosts never saw the service key or cookies, and
 * that the log contains no URL, hostname or fingerprint.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import { buildFixture, CDN_HOST, fixtureSeedUrl, FIXTURE_HOSTS, OFFSITE_HOST, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-fixture", kind: "site", domain: SOURCE_DOMAIN, pageBudget: 50, delayMs: 0 }],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, { lines: logLines }));
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("fixture crawl", () => {
  it("posts exactly the expected findings", () => {
    const port = fx.site.port;
    const got = api.posted
      .map((f) => ({ fingerprintId: f.fingerprintId, pageUrl: f.pageUrl, imageUrl: f.imageUrl, sourceId: f.sourceId }))
      .sort((a, b) => (a.fingerprintId + a.imageUrl).localeCompare(b.fingerprintId + b.imageUrl));
    const want = fx.expected
      .map((e) => ({
        fingerprintId: e.fingerprintId,
        pageUrl: `http://${e.pagePath === "/sub" ? `www.${SOURCE_DOMAIN}` : SOURCE_DOMAIN}:${port}${e.pagePath}`,
        imageUrl: `http://${e.imageHost}:${port}${e.imagePath}`,
        sourceId: "src-fixture",
      }))
      .sort((a, b) => (a.fingerprintId + a.imageUrl).localeCompare(b.fingerprintId + b.imageUrl));
    expect(got).toEqual(want);
    expect(api.created.size).toBe(want.length);
    // Every request met the server's strict contract (no 400s, no 413s).
    expect(api.badRequests).toEqual([]);
    expect(Math.max(...api.bodySizes)).toBeLessThanOrEqual(256 * 1024);
  });

  it("reports distances and quality within contract", () => {
    for (const f of api.posted) {
      expect(f.distance).toBeGreaterThanOrEqual(0);
      expect(f.distance).toBeLessThanOrEqual(31);
      expect(f.quality).toBeGreaterThanOrEqual(50);
      expect(Number.isNaN(Date.parse(f.observedAt))).toBe(false);
    }
    expect(api.posted.find((f) => f.fingerprintId === "fp-a")?.distance).toBe(6);
    expect(api.posted.find((f) => f.fingerprintId === "fp-two-2")?.distance).toBe(12);
  });

  it("never requests off-domain pages, robots-disallowed or nofollow targets", () => {
    expect(fx.site.requested(OFFSITE_HOST)).toBe(false);
    expect(fx.site.requested(SOURCE_DOMAIN, "/private/secret")).toBe(false);
    expect(fx.site.requested(SOURCE_DOMAIN, "/hidden")).toBe(false);
    expect(fx.site.requested(SOURCE_DOMAIN, "/rel-nofollow")).toBe(false);
    expect(fx.site.requested(SOURCE_DOMAIN, "/level3")).toBe(false); // beyond max depth
    expect(fx.site.requested(SOURCE_DOMAIN, "/img/icon.png")).toBe(false); // declared tiny
    expect(fx.site.requested(SOURCE_DOMAIN, "/img/logo.svg")).toBe(false);
    expect(fx.site.requested(CDN_HOST, "/creds.png")).toBe(false);
    // The tracking-param duplicate was deduplicated.
    expect(fx.site.requests.filter((r) => r.host === SOURCE_DOMAIN && r.path.startsWith("/gallery")).length).toBe(1);
    // The off-domain image CDN is allowed.
    expect(fx.site.requested(CDN_HOST, "/c.png")).toBe(true);
  });

  it("never sends credentials or cookies to crawled hosts", () => {
    expect(fx.site.requests.length).toBeGreaterThan(10);
    for (const r of fx.site.requests) {
      expect(r.headers.authorization).toBeUndefined();
      expect(r.headers.cookie).toBeUndefined();
      expect(JSON.stringify(r.headers)).not.toContain(TEST_KEY);
      expect(r.headers["user-agent"]).toBe("AsmitaCrawler/0.1 (test)");
    }
    // ...while every Asmita call carried it.
    expect(api.requests.every((r) => r.authorization === `Bearer ${TEST_KEY}`)).toBe(true);
  });

  it("counts skips and errors by reason in the summary", () => {
    const s = result.summary;
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(s.problems).toEqual({ unauthorized: 0, contractErrors: 0, scopeErrors: 0, findingsUnsent: 0, poolStale: 0 });
    const skipped = s.imagesSkipped as Record<string, number>;
    const errors = s.errors as Record<string, number>;
    expect(skipped.low_quality).toBe(1);
    expect(skipped.too_small).toBe(2); // 40x40 image + 8x8 lazy-load placeholder
    expect(skipped.too_many_pixels).toBe(1);
    expect(skipped.not_image).toBe(1);
    // failOn "none": cut.jpg (97%) matches, cut-heavy.jpg (40%) hashes far away; neither is skipped.
    expect(skipped.truncated ?? 0).toBe(0);
    expect(skipped.svg).toBeGreaterThanOrEqual(2);
    expect(skipped.data_uri).toBe(1);
    expect(skipped.tiny_declared).toBe(1);
    expect(errors.body_too_large).toBe(2);
    expect(errors.body_timeout).toBe(1); // slow drip stopped by the request deadline
    expect(errors.blocked_address).toBe(2);
    expect(errors.blocked_port).toBe(1);
    expect(errors.url_credentials).toBe(1);
    expect(errors.too_many_redirects).toBe(1);
    expect(errors.out_of_scope).toBe(1);
    expect(errors.robots_disallowed).toBe(1);
    expect(s.robots).toEqual({ ok: 2, absent: 1 });
    expect(s.pagesNonHtml).toBe(1);
    expect(s.findingsAccepted).toBe(fx.expected.length);
    expect(s.findingsUnsent).toBe(0);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), { hostnames: FIXTURE_HOSTS, hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)] });
    const summary = logLines.map((l) => JSON.parse(l) as { event: string }).find((l) => l.event === "run_summary");
    expect(summary).toBeDefined();
  });
});
