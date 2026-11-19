/**
 * Galleries in frames and components (crawler v3 WP16), end to end against
 * a local fixture site and the real Chromium:
 *   - static: an in-scope <iframe src> becomes a page link, the frame's own
 *     address is claimed and its gallery hashed; a <frameset><frame src> is
 *     followed the same way; the off-scope iframe is never fetched, and its
 *     host is reported as a discovery like any out-of-scope link; about:blank
 *     and empty-src iframes never become links;
 *   - browser: the render gathers image candidates from every frame
 *     (page.frames(), the about:srcdoc frame included) and from open shadow
 *     roots. The fixture's galleries exist only as data-src and their lazy
 *     loaders wait for an event nothing sends, so every planted image here
 *     proves the gather walked a frame or a shadow root the page's own
 *     scripts never load. The off-scope iframe is not rendered: its host is
 *     never contacted, not even for robots.txt, and its in-pool canary image
 *     is never hashed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildFramesFixture,
  fixtureSeedUrl,
  FRAMES_HOST,
  FRAMES_OFF_HOST,
  SHADOW_HOST,
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
  fx = await buildFramesFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      siteSource({ id: "src-frames", domain: FRAMES_HOST, pageBudget: 20, delayMs: 0 }),
      siteSource({ id: "src-shadow", domain: SHADOW_HOST, pageBudget: 20, delayMs: 0, render: "browser" }),
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, {
    lines: logLines,
    // The off-scope host of both sides' iframe embeds, mapped to the fixture
    // server: with the scope checks working nothing ever resolves it; with a
    // check broken, the frame's document, its image or the robots.txt fetch
    // a verdict would trigger all land in the fixture's request log.
    extraDns: { [FRAMES_OFF_HOST]: ["127.0.0.1"] },
  }));
}, 180_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

const port = () => fx.site.port;
const origin = (host: string) => `http://${host}:${port()}`;
const requestsTo = (host: string, path?: string) =>
  fx.site.requests.filter((r) => r.host === host && (path === undefined || r.path === path)).length;
const finding = (id: string) => api.posted.find((f) => f.fingerprintId === id);

describe("the static frame path (crawler v3 WP16)", () => {
  it("completes the run", () => {
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
  });

  it("follows an in-scope iframe as a page and hashes its gallery", () => {
    expect(fx.site.requested(FRAMES_HOST, "/frame-gallery")).toBe(true);
    const f = finding("fp-frames-gallery");
    expect(f).toBeDefined();
    expect(f!.pageUrl).toBe(`${origin(FRAMES_HOST)}/frame-gallery`);
    expect(f!.imageUrl).toBe(`${origin(FRAMES_HOST)}/img/frame.png`);
  });

  it("follows a frame src of a frameset page", () => {
    expect(fx.site.requested(FRAMES_HOST, "/frame-b")).toBe(true);
    const f = finding("fp-frameset");
    expect(f).toBeDefined();
    expect(f!.pageUrl).toBe(`${origin(FRAMES_HOST)}/frame-b`);
    expect(f!.imageUrl).toBe(`${origin(FRAMES_HOST)}/img/frame-b.png`);
  });

  it("keeps the source's frontier to the real pages only", () => {
    // The seed, the iframe gallery, the frameset and its frame; about:blank,
    // the empty and the missing src never became rows.
    const paths = [...api.pages.values()]
      .filter((p) => p.sourceId === "src-frames")
      .map((p) => new URL(p.url).pathname)
      .sort();
    expect(paths).toEqual(["/", "/frame-b", "/frame-gallery", "/frameset"]);
  });

  it("never follows the off-scope iframe and reports its host as a discovery", () => {
    // Nothing of outside.test is ever requested — not its frame document, not
    // its robots.txt — on either path, and its in-pool canary image is never
    // hashed. The host is reported like any out-of-scope link the page named.
    expect(requestsTo(FRAMES_OFF_HOST)).toBe(0);
    expect(api.posted.some((f) => f.fingerprintId === "fp-outside-canary")).toBe(false);
    expect(api.discoveryReports.some((r) => r.hosts.includes(FRAMES_OFF_HOST))).toBe(true);
  });
});

describe("the browser frame and shadow-root gather (crawler v3 WP16)", () => {
  it("rendered the browser source's pages", () => {
    const browser = result.summary.browser as { renders: number; failed: number; images: number };
    expect(browser.renders).toBeGreaterThanOrEqual(2);
    expect(browser.failed).toBe(0);
  });

  it("hashes the gallery inside a web component's open shadow root", () => {
    // The component's images exist only as data-src inside its open shadow
    // root and its lazy loader never runs; only the gather can have loaded
    // them. The second (decoy) image is loaded and hashed too, and matches
    // nothing — it is not in the pool.
    expect(requestsTo(SHADOW_HOST, "/img/shadow-1.png")).toBe(1);
    expect(requestsTo(SHADOW_HOST, "/img/shadow-2.png")).toBe(1);
    const f = finding("fp-shadow");
    expect(f).toBeDefined();
    expect(f!.pageUrl).toBe(`${origin(SHADOW_HOST)}/`);
    expect(f!.imageUrl).toBe(`${origin(SHADOW_HOST)}/img/shadow-1.png`);
    expect(api.posted.some((x) => x.imageUrl === `${origin(SHADOW_HOST)}/img/shadow-2.png`)).toBe(false);
  });

  it("gathers the in-scope iframe's gallery and credits it to the embedding page", () => {
    // The iframe's own document (also claimed and rendered later) would
    // credit the finding to /frame-a; the embedding page's render walking
    // the frame is what credits it to /.
    const byPage = api.posted.filter((f) => f.fingerprintId === "fp-frame-a");
    expect(byPage.length).toBeGreaterThanOrEqual(1);
    expect(byPage[0]!.pageUrl).toBe(`${origin(SHADOW_HOST)}/`);
    expect(byPage[0]!.imageUrl).toBe(`${origin(SHADOW_HOST)}/img/frame-a.png`);
    expect(requestsTo(SHADOW_HOST, "/img/frame-a.png")).toBeGreaterThanOrEqual(1);
  });

  it("gathers an about:srcdoc frame's gallery", () => {
    // A srcdoc frame has no src the static extractor could read; its
    // gallery is visible only through the frame walk.
    const f = finding("fp-srcdoc");
    expect(f).toBeDefined();
    expect(f!.pageUrl).toBe(`${origin(SHADOW_HOST)}/`);
    expect(f!.imageUrl).toBe(`${origin(SHADOW_HOST)}/img/srcdoc.png`);
    expect(requestsTo(SHADOW_HOST, "/img/srcdoc.png")).toBe(1);
  });

  it("posts exactly the planted findings", () => {
    const ids = api.posted.map((f) => f.fingerprintId).sort();
    expect(ids).toEqual(["fp-frame-a", "fp-frames-gallery", "fp-frameset", "fp-shadow", "fp-srcdoc"]);
    expect(api.badRequests).toEqual([]);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    assertCleanLog(logLines.join("\n"), {
      hostnames: [FRAMES_HOST, SHADOW_HOST, FRAMES_OFF_HOST],
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)],
      secrets: [TEST_KEY],
    });
  });
});
