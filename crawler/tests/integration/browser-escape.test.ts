/**
 * Ways a rendered page could leave the crawler's rules (crawler v2 WP7
 * review), with the real Chromium and a local fixture site:
 *   - a page that redirects only the browser off the source's scope (the
 *     HTTP pre-fetch saw HTML): the off-scope site is never contacted, and
 *     nothing on it is credited to the in-scope page;
 *   - an image that redirects to a robots-disallowed path: the disallowed
 *     address is never requested (every redirect hop is robots-checked);
 *   - an image that redirects within the rules: followed, and reported
 *     under the address that served it;
 *   - window.open: the popup's page is never requested;
 *   - a WebSocket: never connected (the page sees it close).
 * Chromium follows a redirect it is handed without asking the route again,
 * so each of these escaped the old per-page routing.
 */
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "../../src/asmita/client.ts";
import type { RunResult } from "../../src/crawler.ts";
import { hashImage } from "../../src/image/hash-image.ts";
import { FixtureSite, fixtureSeedUrl, OFFSITE_HOST, SOURCE_DOMAIN, TEST_KEY } from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { patternImage } from "../support/synthetic.ts";

const ESC = `esc.${SOURCE_DOMAIN}`;

let site: FixtureSite;
let api: MockAsmita;
let result: RunResult;
const upgrades: string[] = [];

const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;
const html = (body: string) => (res: import("node:http").ServerResponse) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page(body));
};
const png = (bytes: Buffer) => (res: import("node:http").ServerResponse) => {
  res.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.length) });
  res.end(bytes);
};
const redirect = (location: string) => (res: import("node:http").ServerResponse) => {
  res.writeHead(302, { location });
  res.end();
};

beforeAll(async () => {
  site = await new FixtureSite().start();
  // A WebSocket handshake never reaches the request log; record it here.
  (site as unknown as { server: Server }).server.on("upgrade", (req, socket) => {
    upgrades.push(req.url ?? "");
    socket.destroy();
  });
  const img = {
    hop: await patternImage(180, 300, 300, "png"),
    blocked: await patternImage(181, 300, 300, "png"),
    evil: await patternImage(182, 300, 300, "png"),
    popup: await patternImage(183, 300, 300, "png"),
  };
  const hash = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const pool: Pool = {
    version: "escape-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      { id: "fp-hop", pdq: await hash(img.hop), quality: 100 },
      { id: "fp-blocked", pdq: await hash(img.blocked), quality: 100 },
      { id: "fp-evil", pdq: await hash(img.evil), quality: 100 },
      { id: "fp-popup", pdq: await hash(img.popup), quality: 100 },
    ],
  };

  site.route(ESC, "/robots.txt", (res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("User-agent: *\nAllow: /\nDisallow: /img/blocked.png\n");
  });
  site.route(
    ESC,
    "/",
    html(`
      <a href="/cloak">cloak</a><a href="/popup">popup</a><a href="/ws">ws</a>
      <img src="/img/hop.png"><img src="/img/to-blocked.png">`),
  );
  site.route(ESC, "/img/hop.png", redirect("/img/hop-target.png"));
  site.route(ESC, "/img/hop-target.png", png(img.hop));
  site.route(ESC, "/img/to-blocked.png", redirect("/img/blocked.png"));
  site.route(ESC, "/img/blocked.png", png(img.blocked));

  // Cloaking: the HTTP pre-fetch gets HTML; every later request (the
  // browser's) is redirected to another site that carries a pool image.
  let cloakHits = 0;
  site.route(ESC, "/cloak", (res) => {
    cloakHits += 1;
    if (cloakHits === 1) return html(`<p>looks harmless</p><script>/* render me */</script>`)(res);
    return redirect(`http://${OFFSITE_HOST}:${site.port}/evil`)(res);
  });
  site.route(OFFSITE_HOST, "/evil", html(`<img src="/img/evil.png">`));
  site.route(OFFSITE_HOST, "/img/evil.png", png(img.evil));
  site.route(OFFSITE_HOST, "/robots.txt", (res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("User-agent: *\nAllow: /\n");
  });

  site.route(ESC, "/popup", html(`<p>popup opener</p><script>window.open("/popup-target");</script>`));
  site.route(ESC, "/popup-target", html(`<img src="/img/popup.png">`));
  site.route(ESC, "/img/popup.png", png(img.popup));

  // The page adds /ws-closed once its socket is closed, proving the attempt
  // was made and refused inside the browser.
  site.route(
    ESC,
    "/ws",
    html(`
      <script>
        var ws = new WebSocket("ws://" + location.host + "/socket");
        ws.onclose = function () {
          var a = document.createElement("a");
          a.href = "/ws-closed";
          a.textContent = "closed";
          document.body.appendChild(a);
        };
      </script>`),
  );
  site.route(ESC, "/ws-closed", html(`<p>closed</p>`));

  api = await new MockAsmita({
    key: TEST_KEY,
    pool,
    sources: [siteSource({ id: "src-esc", domain: ESC, pageBudget: 30, delayMs: 0, render: "browser" })],
    seedUrl: fixtureSeedUrl(site.port),
  }).start();
  ({ result } = await runFixtureCrawl(site, api, { env: { BROWSER_SCROLLS: "1", BROWSER_SCROLL_WAIT_MS: "300" } }));
}, 180_000);

afterAll(async () => {
  await site?.stop();
  await api?.stop();
});

const requestsTo = (host: string, path?: string) => site.requests.filter((r) => r.host === host && (path === undefined || r.path === path)).length;

describe("rendered pages cannot leave the crawler's rules", () => {
  it("completes the run", () => {
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect((result.summary.browser as { renders: number }).renders).toBeGreaterThanOrEqual(4);
  });

  it("never follows a browser-only redirect off the source's scope, and credits nothing from it", () => {
    expect(requestsTo(ESC, "/cloak")).toBeGreaterThanOrEqual(2); // the pre-fetch and the browser
    expect(requestsTo(OFFSITE_HOST)).toBe(0); // not the page, not its image, not its robots.txt
    expect(api.posted.some((f) => f.fingerprintId === "fp-evil")).toBe(false);
  });

  it("robots-checks every redirect hop of an image", () => {
    expect(requestsTo(ESC, "/img/to-blocked.png")).toBe(1);
    expect(requestsTo(ESC, "/img/blocked.png")).toBe(0);
    expect(api.posted.some((f) => f.fingerprintId === "fp-blocked")).toBe(false);
  });

  it("follows an allowed image redirect and reports the address that served it", () => {
    const finding = api.posted.find((f) => f.fingerprintId === "fp-hop");
    expect(finding).toBeDefined();
    expect(finding!.pageUrl).toBe(`http://${ESC}:${site.port}/`);
    expect(finding!.imageUrl).toBe(`http://${ESC}:${site.port}/img/hop-target.png`);
    expect(requestsTo(ESC, "/img/hop-target.png")).toBe(1);
  });

  it("never loads a popup's page", () => {
    expect(requestsTo(ESC, "/popup")).toBeGreaterThanOrEqual(2);
    expect(requestsTo(ESC, "/popup-target")).toBe(0);
    expect(api.posted.some((f) => f.fingerprintId === "fp-popup")).toBe(false);
  });

  it("never connects a page's WebSocket", () => {
    expect(upgrades).toEqual([]);
    expect([...api.pages.values()].some((p) => p.url.endsWith("/ws-closed"))).toBe(true);
  });

  it("posts only the allowed finding", () => {
    expect(api.posted.map((f) => f.fingerprintId)).toEqual(["fp-hop"]);
  });
});
