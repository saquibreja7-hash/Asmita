/**
 * Crawler v3 review fix for WP15, with the real Chromium: a page that never
 * goes quiet (it polls /ping every 100 ms forever) must still render. The
 * network-quiet wait gives up before the page deadline, leaving room for
 * page.content(), so the render succeeds and its image is hashed — before
 * the fix the wait could only end at the deadline and the render failed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import { buildNeverQuietFixture, fixtureSeedUrl, POLL_HOST, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;

beforeAll(async () => {
  fx = await buildNeverQuietFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [siteSource({ id: "src-poll", domain: POLL_HOST, pageBudget: 10, delayMs: 0, render: "browser" })],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, {
    env: { BROWSER_PAGE_TIMEOUT_MS: "5000", BROWSER_SCROLLS: "2", BROWSER_SCROLL_WAIT_MS: "300" },
  }));
}, 120_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("a page that never goes quiet", () => {
  it("renders before its deadline instead of failing", () => {
    const browser = result.summary.browser as { renders: number; failed: number };
    expect(browser.renders).toBe(1);
    expect(browser.failed).toBe(0);
    // The page really kept polling while it was rendered.
    expect(fx.site.requests.filter((r) => r.host === POLL_HOST && r.path.startsWith("/ping")).length).toBeGreaterThan(5);
  });

  it("hashes the page's image and reports the page fetched", () => {
    expect(api.posted.map((f) => f.fingerprintId)).toEqual(["fp-poll"]);
    const home = [...api.pages.values()].find((p) => p.sourceId === "src-poll" && p.depth === 0);
    expect(home?.status).toBe("FETCHED");
    expect(result.exitCode).toBe(0);
  });
});
