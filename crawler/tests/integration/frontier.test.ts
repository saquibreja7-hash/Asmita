/**
 * Bounded frontier (crawler v2 WP3): a hostile approved site whose pages are
 * ~1.6 MB of links cannot grow the crawler's frontier state beyond one
 * claimed batch, the link caps hold on both sides (the crawler extracts at
 * most MAX_LINKS_PER_PAGE per page; the app stores at most those, on the
 * per-source digest, within the daily page budget), and findings are still
 * delivered.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, fixtureSeedUrl, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

let fx: Fixture;
let api: MockAsmita;
const FLOOD = `flood.${SOURCE_DOMAIN}`;
const BUDGET = 15;
const CLAIM_LIMIT = 5;
const LINKS_PER_PAGE = 300;

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-flood", kind: "site", domain: FLOOD, pageBudget: BUDGET, delayMs: 0 }],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("link flood", () => {
  it("keeps the crawler's frontier at one batch, the app's frontier within its caps, and still flushes findings", async () => {
    const { result } = await runFixtureCrawl(fx.site, api, {
      env: { MAX_LINKS_PER_PAGE: String(LINKS_PER_PAGE), MAX_DEPTH: "10", FRONTIER_CLAIM_LIMIT: String(CLAIM_LIMIT) },
    });
    const s = result.summary;
    expect(s.pagesAttempted).toBe(BUDGET);
    // The crawler's only frontier state is the claimed batch: never larger
    // than FRONTIER_CLAIM_LIMIT.
    expect(s.batchPeak as number).toBeLessThanOrEqual(CLAIM_LIMIT);
    expect(s.batchPeak as number).toBeGreaterThan(0);
    // Each page offered 40,000 links; at most 300 per page were even considered.
    expect(s.linksDropped as number).toBeGreaterThanOrEqual(BUDGET * (40_000 - LINKS_PER_PAGE) - 40_000);
    // The app's side of the cap: every report held at most a batch of pages,
    // and the stored frontier grew by at most LINKS_PER_PAGE per fetched
    // page (plus the seed).
    expect(api.reports.length).toBeGreaterThan(0);
    for (const report of api.reports) expect(report.count).toBeLessThanOrEqual(CLAIM_LIMIT);
    expect(api.pages.size).toBeLessThanOrEqual(1 + BUDGET * LINKS_PER_PAGE);
    // The daily budget stopped the source for the day.
    expect(api.claims.map((c) => c.limit).every((limit) => limit <= CLAIM_LIMIT)).toBe(true);
    expect(api.claimFrontier("src-flood", CLAIM_LIMIT)).toEqual([]);
    // The real image on the flood site was still found and delivered.
    expect(api.posted.map((f) => f.fingerprintId)).toEqual(["fp-flood"]);
    expect(s.findingsUnsent).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(fx.site.requests.filter((r) => r.host === FLOOD && r.path !== "/robots.txt" && !r.path.startsWith("/img/")).length).toBe(BUDGET);
  }, 60_000);
});
