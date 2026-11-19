/**
 * The lighter browser (crawler v3 WP15), with the real Chromium and a local
 * fixture site (light.fixture.test, render BROWSER):
 *   - fonts, audio and video media, and requests to the built-in
 *     advertising/analytics hosts are aborted before routing, so the fixture
 *     server never sees one of them — the tracker hosts are mapped into the
 *     test DNS, so an unblocked tracker (or its parent-side robots.txt
 *     fetch) would land in the fixture's request log;
 *   - image requests still are made: every planted image is fetched exactly
 *     once by the browser and every match is posted;
 *   - the request cap leaves room for more images: BROWSER_MAX_REQUESTS_
 *     PER_PAGE is 8 while the home page asks for 12 fonts, two media files
 *     and two tracker scripts before its images — had the blocked kinds
 *     consumed the cap, the images would have been aborted;
 *   - a slow, chained lazy-loader is waited for by the network-quiet wait:
 *     each image of the /slow gallery is inserted only by the onload of the
 *     previous one, and the first two answers are delayed by 800 ms, so the
 *     planted third image is fetched well after the fixed waits of the
 *     scroll loop are over.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildLightBrowserFixture,
  fixtureSeedUrl,
  LIGHT_FONT_COUNT,
  LIGHT_HOST,
  LIGHT_TRACKER_HOSTS,
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

beforeAll(async () => {
  fx = await buildLightBrowserFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [siteSource({ id: "src-light", domain: LIGHT_HOST, pageBudget: 20, delayMs: 0, render: "browser" })],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, {
    lines: logLines,
    // The tracker hosts of the fixture page, mapped to the fixture server:
    // with the block working nothing ever resolves them; with it broken, the
    // scripts and the robots.txt fetches the verdict would trigger both end
    // up in the fixture's request log.
    extraDns: Object.fromEntries(LIGHT_TRACKER_HOSTS.map((host) => [host, ["127.0.0.1"]])),
    env: {
      BROWSER_MAX_REQUESTS_PER_PAGE: "8",
      BROWSER_SCROLLS: "2",
      BROWSER_SCROLL_WAIT_MS: "300",
    },
  }));
}, 180_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

const port = () => fx.site.port;
const requestsTo = (host: string, path?: string) =>
  fx.site.requests.filter((r) => r.host === host && (path === undefined || r.path === path)).length;

describe("the lighter browser (crawler v3 WP15)", () => {
  it("completes the run", () => {
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
    const browser = result.summary.browser as { renders: number; failed: number; images: number };
    expect(browser.renders).toBeGreaterThanOrEqual(2);
    expect(browser.failed).toBe(0);
    // Six intercepted images: the three home-page matches plus the three
    // links of the slow chain (two decoys, one match).
    expect(browser.images).toBe(6);
  });

  it("never requests the page's fonts, audio or video", () => {
    // Headless Chromium does fetch web fonts it renders text with, and the
    // preload="auto" media elements (verified for this fixture's markup) —
    // the worker aborting them before routing is what keeps them unseen.
    for (let i = 1; i <= LIGHT_FONT_COUNT; i++) {
      expect(requestsTo(LIGHT_HOST, `/fonts/f${i}.woff2`), `font ${i}`).toBe(0);
    }
    expect(requestsTo(LIGHT_HOST, "/media/clip.mp4")).toBe(0);
    expect(requestsTo(LIGHT_HOST, "/media/tone.mp3")).toBe(0);
  });

  it("never requests the advertising/analytics hosts, not even their robots.txt", () => {
    for (const host of LIGHT_TRACKER_HOSTS) {
      expect(requestsTo(host), host).toBe(0);
    }
  });

  it("still requests and finds every image within the tight request cap", () => {
    // The cap is 8 requests; the page asks for 12 fonts, two media files and
    // two tracker scripts before its three images. Blocked kinds do not
    // count against the cap, so all three images fit; had they counted, the
    // cap would have been spent long before the images were added.
    for (const n of [1, 2, 3]) {
      expect(requestsTo(LIGHT_HOST, `/img/light-${n}.png`)).toBe(1);
      const finding = api.posted.find((f) => f.fingerprintId === `fp-light-${n}`);
      expect(finding, `fp-light-${n}`).toBeDefined();
      expect(finding!.pageUrl).toBe(`http://${LIGHT_HOST}:${port()}/`);
      expect(finding!.imageUrl).toBe(`http://${LIGHT_HOST}:${port()}/img/light-${n}.png`);
    }
  });

  it("waits for a slow chained lazy-loader", () => {
    const finding = api.posted.find((f) => f.fingerprintId === "fp-slow-lazy");
    expect(finding).toBeDefined();
    expect(finding!.pageUrl).toBe(`http://${LIGHT_HOST}:${port()}/slow`);
    expect(finding!.imageUrl).toBe(`http://${LIGHT_HOST}:${port()}/img/slow-3.png`);
    // The chain ran to its end: each image was requested once (its onload
    // inserts the next), the first two answering 800 ms late — the third is
    // fetched only after the scroll loop's own waits are long over, so the
    // network-quiet wait is what let it through.
    expect(requestsTo(LIGHT_HOST, "/img/slow-1.png")).toBe(1);
    expect(requestsTo(LIGHT_HOST, "/img/slow-2.png")).toBe(1);
    expect(requestsTo(LIGHT_HOST, "/img/slow-3.png")).toBe(1);
  });

  it("posts exactly the planted findings", () => {
    const ids = api.posted.map((f) => f.fingerprintId).sort();
    expect(ids).toEqual(["fp-light-1", "fp-light-2", "fp-light-3", "fp-slow-lazy"]);
    expect(api.badRequests).toEqual([]);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    assertCleanLog(logLines.join("\n"), {
      hostnames: [LIGHT_HOST, ...LIGHT_TRACKER_HOSTS],
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)],
      secrets: [TEST_KEY],
    });
  });
});
