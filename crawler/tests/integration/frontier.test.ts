/**
 * Bounded frontier: a hostile approved site whose pages are ~1.6 MB of links
 * cannot grow the queue, the seen set or per-page link lists beyond the
 * budgets, and findings are still delivered.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

let fx: Fixture;
let api: MockAsmita;
const FLOOD = `flood.${SOURCE_DOMAIN}`;
const BUDGET = 15;

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-flood", kind: "site", domain: FLOOD, pageBudget: BUDGET, delayMs: 0 }],
  }).start();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("link flood", () => {
  it("keeps queue, seen set and per-page links bounded and still flushes findings", async () => {
    const { result } = await runFixtureCrawl(fx.site, api, { env: { MAX_LINKS_PER_PAGE: "300", MAX_DEPTH: "10" } });
    const s = result.summary;
    expect(s.pagesAttempted).toBe(BUDGET);
    // The queue never holds more than the pages still allowed...
    expect(s.queuePeak as number).toBeLessThanOrEqual(BUDGET);
    // ...and seen URLs are only ever the queued ones plus the seed.
    expect(s.seenPeak as number).toBeLessThanOrEqual(BUDGET + 1);
    // Each page offered 40,000 links; at most 300 per page were even considered.
    expect(s.linksDropped as number).toBeGreaterThanOrEqual(BUDGET * (40_000 - 300) - 40_000);
    expect(s.linksNotQueued as number).toBeGreaterThan(0);
    // The real image on the flood site was still found and delivered.
    expect(api.posted.map((f) => f.fingerprintId)).toEqual(["fp-flood"]);
    expect(s.findingsUnsent).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(fx.site.requests.filter((r) => r.host === FLOOD && r.path !== "/robots.txt" && !r.path.startsWith("/img/")).length).toBe(BUDGET);
  }, 60_000);
});
