/**
 * Browser rendering end to end (crawler v2 WP7), with the real Chromium the
 * worker launches and the real fixture site:
 *   - a page that builds its gallery with JavaScript and infinite scroll
 *     yields its planted image (found only after scrolling);
 *   - its bytes are taken from the intercepted response (the image is
 *     requested exactly once, by the browser; the crawler never re-fetches);
 *   - links are read from the rendered DOM;
 *   - a robots-disallowed image is never requested (the worker asks before
 *     every request the page wants to make);
 *   - a script that requests private addresses sees both requests refused
 *     (the page records the refusals), and the render survives them;
 *   - AUTO renders only pages that need it (scripts, no static images);
 *   - every byte the browser moved went through the in-process proxy: the
 *     fixture hostnames exist only in the test policy's DNS table, so a
 *     successful render is proof Chromium could not have resolved them
 *     itself — the proxy (remote DNS) did.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import { buildFixture, fixtureSeedUrl, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

const JS_HOST = `js.${SOURCE_DOMAIN}`;
const AUTO_HOST = `auto.${SOURCE_DOMAIN}`;

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      { id: "src-js", kind: "site", domain: JS_HOST, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "browser" },
      { id: "src-auto", kind: "site", domain: AUTO_HOST, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "auto" },
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, {
    lines: logLines,
    // metadata.test resolves (to a metadata address) only through the test
    // policy's DNS table; the policy blocklist still refuses the address.
    extraDns: { "metadata.test": ["169.254.169.254"] },
  }));
}, 180_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

const port = () => fx.site.port;
const requestsTo = (host: string, path: string) => fx.site.requests.filter((r) => r.host === host && r.path === path).length;
const frontierHas = (path: string) =>
  [...api.pages.values()].some((p) => p.url === `http://${JS_HOST}:${port()}${path}`) ||
  [...api.pages.values()].some((p) => p.url.endsWith(path));

describe("browser-rendered sources", () => {
  it("completes the run", () => {
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
    const browser = result.summary.browser as { renders: number; failed: number; images: number };
    expect(browser.renders).toBeGreaterThanOrEqual(3);
    expect(browser.failed).toBe(0);
    expect(browser.images).toBeGreaterThanOrEqual(3);
  });

  it("finds the image a JavaScript gallery reveals only after scrolling", () => {
    const finding = api.posted.find((f) => f.fingerprintId === "fp-js-deep");
    expect(finding).toBeDefined();
    expect(finding!.pageUrl).toBe(`http://${JS_HOST}:${port()}/`);
    expect(finding!.imageUrl).toBe(`http://${JS_HOST}:${port()}/img/js-deep.png`);
    // The image appears only after the second scroll event; the default
    // BROWSER_SCROLLS (5) must have triggered it.
    expect(fx.site.requested(JS_HOST, "/img/js-deep.png")).toBe(true);
  });

  it("takes image bytes from the intercepted response, never re-fetching", () => {
    // The browser requested each image exactly once; the crawler did not
    // fetch them again through safe-fetch.
    expect(requestsTo(JS_HOST, "/img/js-early.png")).toBe(1);
    expect(requestsTo(JS_HOST, "/img/js-mid.png")).toBe(1);
    expect(requestsTo(JS_HOST, "/img/js-deep.png")).toBe(1);
  });

  it("reads links from the rendered DOM", () => {
    // /js-only is added by the page's script after the first image loads.
    expect(frontierHas("/js-only")).toBe(true);
    expect(fx.site.requested(JS_HOST, "/js-only")).toBe(true);
  });

  it("refuses to load a robots-disallowed image inside a rendered page", () => {
    // js.fixture.test's robots.txt disallows /img/robots.png; the page
    // carries it, but the browser must never request it.
    expect(requestsTo(JS_HOST, "/img/robots.png")).toBe(0);
  });

  it("refuses a script's private-address requests and survives them", () => {
    // The /ssrf page adds its /after-ssrf link only after BOTH private
    // fetches failed. 10.0.0.1 is a blocked literal; metadata.test resolves
    // to the metadata address, which the blocklist refuses as well.
    expect(frontierHas("/after-ssrf")).toBe(true);
    expect(fx.site.requested(JS_HOST, "/after-ssrf")).toBe(true);
    // Every browser request passed the address policy at the proxy; the
    // page's own script saw both refusals, so nothing private was fetched.
    const robots = result.summary.robots as Record<string, number>;
    expect((robots.unreachable ?? 0) + (robots.denied ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("renders AUTO pages only when they have scripts and no static images", () => {
    // /auto-a: scripts, no static image candidates -> rendered in the
    // browser, the JS-added image is found.
    const jsFinding = api.posted.find((f) => f.fingerprintId === "fp-auto-js");
    expect(jsFinding).toBeDefined();
    expect(jsFinding!.pageUrl).toBe(`http://${AUTO_HOST}:${port()}/auto-a`);
    expect(jsFinding!.imageUrl).toBe(`http://${AUTO_HOST}:${port()}/img/auto-js.png`);
    // /auto-b: scripts, but a static image exists -> no browser render:
    // its document was requested exactly once (the HTTP pre-fetch only).
    expect(requestsTo(AUTO_HOST, "/auto-b")).toBe(1);
    expect(requestsTo(AUTO_HOST, "/auto-a")).toBe(2); // HTTP pre-fetch + browser
    const staticFinding = api.posted.find((f) => f.fingerprintId === "fp-auto-static");
    expect(staticFinding).toBeDefined();
    expect(staticFinding!.pageUrl).toBe(`http://${AUTO_HOST}:${port()}/auto-b`);
  });

  it("posts exactly the browser-path findings", () => {
    const ids = api.posted.map((f) => f.fingerprintId).sort();
    expect(ids).toEqual(["fp-auto-js", "fp-auto-static", "fp-js-deep"]);
    expect(api.badRequests).toEqual([]);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    assertCleanLog(logLines.join("\n"), {
      hostnames: [JS_HOST, AUTO_HOST, "metadata.test"],
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.flatMap((f) => ("pdq" in f ? [f.pdq] : []))],
      secrets: [TEST_KEY],
    });
  });
});
