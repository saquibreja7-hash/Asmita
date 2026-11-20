/**
 * In-page redirects (crawler v3 WP12), unit level:
 *  - parseMetaRefresh: the content-value grammar (delay, separators,
 *    url=, quotes, entities, attribute order), the 10-second cap, the
 *    first qualifying meta, and everything that is page content instead
 *    (self-refresh, too slow, malformed, missing);
 *  - the script-only stub rule (visible text under 2 KiB, a script, an
 *    empty static extraction);
 *  - the fetcher's end: a qualifying meta refresh is one more hop of the
 *    same redirect loop — followed only when the caller opts in and the
 *    answer is HTML, policy-checked by checkUrl, offered to beforeHop
 *    before the request, and counted in the shared maxRedirects budget
 *    together with HTTP redirects.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { SafeFetcher } from "../../src/net/safe-fetch.ts";
import {
  htmlMetaRefreshTarget,
  isScriptOnlyStub,
  MAX_META_REFRESH_DELAY_S,
  parseMetaRefresh,
  STUB_VISIBLE_TEXT_LIMIT,
  visibleTextBytes,
} from "../../src/crawl/page-redirects.ts";
import { loopbackTestPolicy } from "../support/test-policy.ts";

const page = (head: string, body = "<p>hello</p>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("parseMetaRefresh", () => {
  const meta = (content: string) => page(`<meta http-equiv="refresh" content="${content}">`);

  it.each([
    [`<meta http-equiv="refresh" content="0; url=/next">`, { delaySeconds: 0, url: "/next" }],
    [`<meta http-equiv="Refresh" CONTENT="5;url=/next">`, { delaySeconds: 5, url: "/next" }],
    [`<meta content="10; URL='/next'" http-equiv="refresh">`, { delaySeconds: 10, url: "/next" }],
    [`<meta http-equiv=refresh content=0;url=/next>`, { delaySeconds: 0, url: "/next" }],
    [`<meta http-equiv="refresh" content="2, url=/next">`, { delaySeconds: 2, url: "/next" }],
    [`<meta http-equiv="refresh" content="0;url=&quot;/a?x=1&amp;y=2&quot;">`, { delaySeconds: 0, url: "/a?x=1&y=2" }],
    [`<meta http-equiv="refresh" content="0; url=/next?x=a>b">`, { delaySeconds: 0, url: "/next?x=a>b" }],
    [`<meta http-equiv="refresh" content="-3; url=/next">`, { delaySeconds: 0, url: "/next" }],
  ])("follows %s", (html, want) => {
    expect(parseMetaRefresh(html)).toEqual(want);
  });

  it.each([
    "no meta at all",
    `<meta name="refresh" content="0; url=/next">`,
    `<meta http-equiv="content-type" content="text/html">`,
    `<meta http-equiv="refresh">`,
    `<meta http-equiv="refresh" content="">`,
    `<meta http-equiv="refresh" content="url=/next">`,
    `<meta http-equiv="refresh" content="abc; url=/next">`,
    `<meta http-equiv="refresh" content="0">`,
    `<meta http-equiv="refresh" content="0; refresh">`,
    `<meta http-equiv="refresh" content="0; url=">`,
    `<meta http-equiv="refresh" content="0; url=''">`,
    `<meta http-equiv="refresh" content="11; url=/next">`,
    `<meta http-equiv="refresh" content="999999999999; url=/next">`,
  ])("is page content, not a redirect: %s", (html) => {
    expect(parseMetaRefresh(html)).toBeNull();
  });

  it("takes the first qualifying refresh and keeps scanning past non-qualifying ones", () => {
    const two = page(`<meta http-equiv="refresh" content="0; url=/first"><meta http-equiv="refresh" content="0; url=/second">`);
    expect(parseMetaRefresh(two)?.url).toBe("/first");
    const slowThenFast = page(`<meta http-equiv="refresh" content="30; url=/later"><meta http-equiv="refresh" content="0; url=/now">`);
    expect(parseMetaRefresh(slowThenFast)?.url).toBe("/now");
  });

  it("ignores a refresh inside an HTML comment or <noscript> (review fix)", () => {
    expect(parseMetaRefresh(page(`<!-- <meta http-equiv="refresh" content="0; url=/old"> -->`))).toBeNull();
    expect(parseMetaRefresh(page(`<noscript><meta http-equiv="refresh" content="0; url=/nojs"></noscript>`))).toBeNull();
    expect(parseMetaRefresh(page(`<NOSCRIPT class="x"><meta http-equiv="refresh" content="0; url=/nojs"></NOSCRIPT>`))).toBeNull();
    // An unterminated comment hides the rest of the document, as in a browser.
    expect(parseMetaRefresh(`<!-- open <meta http-equiv="refresh" content="0; url=/hidden">`)).toBeNull();
    // A real refresh after a commented-out one is still found.
    const both = page(`<!-- <meta http-equiv="refresh" content="0; url=/old"> --><noscript><meta http-equiv="refresh" content="0; url=/nojs"></noscript><meta http-equiv="refresh" content="0; url=/real">`);
    expect(parseMetaRefresh(both)?.url).toBe("/real");
  });

  it("ignores lookalike tag names and honours the cap as a constant", () => {
    expect(parseMetaRefresh(page("<metalFan>fan page</metalFan>"))).toBeNull();
    expect(MAX_META_REFRESH_DELAY_S).toBe(10);
    expect(STUB_VISIBLE_TEXT_LIMIT).toBe(2048);
  });

  it("does not treat a non-HTML body as carrying a refresh", () => {
    expect(htmlMetaRefreshTarget("image/png", Buffer.from(meta("0; url=/next")))).toBeNull();
    expect(htmlMetaRefreshTarget("", Buffer.from(meta("0; url=/next")))).toBeNull();
    expect(htmlMetaRefreshTarget("text/html; charset=utf-8", Buffer.from(meta("0; url=/next")))).toBe("/next");
    expect(htmlMetaRefreshTarget("application/xhtml+xml", Buffer.from(meta("0; url=/next")))).toBe("/next");
  });
});

describe("the script-only stub rule", () => {
  const empty = { images: [], links: [], feeds: [] };

  it("marks a location.replace stub", () => {
    const stub = `<!doctype html><html><head><script>location.replace("/real");</script></head><body><p>Loading…</p></body></html>`;
    expect(isScriptOnlyStub(stub, empty)).toBe(true);
    expect(visibleTextBytes(stub)).toBeLessThan(STUB_VISIBLE_TEXT_LIMIT);
  });

  it("counts only visible text: script, style and comment bodies are not text", () => {
    const noisy = page("", `<script>${"var x = 1;".repeat(400)}</script><style>.a{color:red}</style><!-- a hidden note --><p>tiny</p>`);
    expect(visibleTextBytes(noisy)).toBeLessThan(100);
  });

  it("is not a stub when the visible text is large, or there is no script, or extraction found something", () => {
    const bigText = page("", `<p>${"lorem ipsum dolor sit amet ".repeat(120)}</p><script>var x=1;</script>`);
    expect(isScriptOnlyStub(bigText, empty)).toBe(false);
    expect(visibleTextBytes(bigText)).toBeGreaterThan(STUB_VISIBLE_TEXT_LIMIT);
    const noScript = page("", "<p>small page</p>");
    expect(isScriptOnlyStub(noScript, empty)).toBe(false);
    const withLinks = page("", `<a href="/x">x</a><script>var y=2;</script>`);
    expect(isScriptOnlyStub(withLinks, { images: [], links: [new URL("http://h.test/x")], feeds: [] })).toBe(false);
    const withImages = page("", `<img src="/i.png"><script>var z=3;</script>`);
    expect(isScriptOnlyStub(withImages, { images: [new URL("http://h.test/i.png")], links: [], feeds: [] })).toBe(false);
  });

  it("treats exactly the 2 KiB boundary as not under it", () => {
    expect(isScriptOnlyStub(page("", `<script>var q=1;</script><p>${"a".repeat(STUB_VISIBLE_TEXT_LIMIT - 30)}</p>`), empty)).toBe(true);
    expect(isScriptOnlyStub(page("", `<script>var q=1;</script><p>${"a".repeat(STUB_VISIBLE_TEXT_LIMIT)}</p>`), empty)).toBe(false);
  });
});

describe("SafeFetcher follows a meta refresh as one more hop", () => {
  let server: Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? "/";
      hits.push(url);
      const send = (body: string, type = "text/html; charset=utf-8") => {
        res.writeHead(200, { "content-type": type });
        res.end(body);
      };
      if (url === "/robots.txt") return send("User-agent: *\nAllow: /\n", "text/plain");
      if (url === "/redirector") return send(page(`<meta http-equiv="refresh" content="0; url=/final">`));
      if (url === "/final") return send(page("", "<p>the target page</p>"));
      if (url === "/self") return send(page(`<meta http-equiv="refresh" content="0; url=/self">`));
      if (url === "/loop-a") return send(page(`<meta http-equiv="refresh" content="0; url=/loop-b">`));
      if (url === "/loop-b") return send(page(`<meta http-equiv="refresh" content="0; url=/loop-a#again">`));
      // /m0 -> /m1 -> ...: an endless chain of distinct meta refresh targets.
      if (/^\/m\d+$/.test(url)) return send(page(`<meta http-equiv="refresh" content="0; url=/m${Number(url.slice(2)) + 1}">`));
      if (url === "/slow") return send(page(`<meta http-equiv="refresh" content="11; url=/final">`));
      if (url === "/no-url") return send(page(`<meta http-equiv="refresh" content="5">`));
      if (url === "/meta-as-image") return send(page(`<meta http-equiv="refresh" content="0; url=/final">`), "image/png");
      if (url === "/meta-js") return send(page(`<meta http-equiv="refresh" content="0; url=javascript:alert(1)">`));
      if (url === "/meta-literal") return send(page(`<meta http-equiv="refresh" content="0; url=http://10.0.0.1/x">`));
      if (url === "/meta-broken") return send(page(`<meta http-equiv="refresh" content="0; url=http://[">`));
      if (url === "/meta-404") return send(page(`<meta http-equiv="refresh" content="0; url=/missing">`));
      if (url === "/meta-base")
        return send(`<base href="http://elsewhere.example/"><meta http-equiv="refresh" content="0; url=/final">`);
      if (url === "/hop302") {
        res.writeHead(302, { location: "/redirector" });
        return res.end();
      }
      // /r0 -> /r1 -> ... -> /r5: five HTTP redirect hops, then a meta refresh.
      if (url.startsWith("/r")) {
        const n = Number(url.slice(2));
        if (n >= 0 && n < 5) {
          res.writeHead(302, { location: `/r${n + 1}` });
          return res.end();
        }
        if (n === 5) return send(page(`<meta http-equiv="refresh" content="0; url=/final">`));
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.closeAllConnections();
    return new Promise<void>((r) => server.close(() => r()));
  });

  const fetcher = () =>
    new SafeFetcher(loopbackTestPolicy(["hop.test"], port), {
      userAgent: "AsmitaCrawler/0.1 (test)",
      connectTimeoutMs: 1000,
      headersTimeoutMs: 1000,
      bodyTimeoutMs: 1000,
      totalTimeoutMs: 3000,
      maxRedirects: 5,
    });
  const url = (path: string) => `http://hop.test:${port}${path}`;
  const htmlOpts = { kind: "html" as const, maxBytes: 2 * 1024 * 1024, accept: "text/html", followMetaRefresh: true };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return "ok";
    } catch (raw) {
      return raw instanceof CrawlError ? raw.code : "other";
    }
  };

  it("follows the target and reports the final URL", async () => {
    const f = fetcher();
    const hops: number[] = [];
    const result = await f.fetch(url("/redirector"), {
      ...htmlOpts,
      beforeHop: async (_u, hop) => void hops.push(hop),
    });
    expect(result.url.pathname).toBe("/final");
    expect(result.body.toString("utf8")).toContain("the target page");
    expect(hops).toEqual([0, 1]); // one more hop, offered to beforeHop
    await f.close();
  });

  it("never follows without the opt-in, for non-HTML answers, or without a target", async () => {
    const f = fetcher();
    const plain = await f.fetch(url("/redirector"), { kind: "html", maxBytes: 1024 * 1024, accept: "text/html" });
    expect(plain.url.pathname).toBe("/redirector");
    const image = await f.fetch(url("/meta-as-image"), { ...htmlOpts, kind: "image", maxBytes: 1024 * 1024 });
    expect(image.url.pathname).toBe("/meta-as-image");
    const slow = await f.fetch(url("/slow"), htmlOpts);
    expect(slow.url.pathname).toBe("/slow");
    const noUrl = await f.fetch(url("/no-url"), htmlOpts);
    expect(noUrl.url.pathname).toBe("/no-url");
    await f.close();
  });

  it("policy-checks the target, and keeps the page when the policy refuses it (review fix)", async () => {
    // Review fix: the refresh page is content in its own right, so a target
    // the address policy refuses is simply not followed (nothing is sent to
    // it) and the page itself is the answer, instead of failing the page.
    const f = fetcher();
    const before = hits.length;
    const js = await f.fetch(url("/meta-js"), htmlOpts);
    expect(js.url.pathname).toBe("/meta-js");
    const literal = await f.fetch(url("/meta-literal"), htmlOpts);
    expect(literal.url.pathname).toBe("/meta-literal");
    expect(hits.slice(before)).toEqual(["/meta-js", "/meta-literal"]);
    await f.close();
  });

  it("keeps the page when the target does not parse", async () => {
    const f = fetcher();
    const result = await f.fetch(url("/meta-broken"), htmlOpts);
    expect(result.url.pathname).toBe("/meta-broken");
    await f.close();
  });

  it("runs beforeHop before the meta hop's request, so a scope or robots refusal needs no fetch", async () => {
    // Review fix: a refused refresh target no longer fails the page — the
    // page that carries the refresh is returned instead.
    const f = fetcher();
    for (const refusal of ["robots_disallowed", "out_of_scope"] as const) {
      const before = hits.length;
      const result = await f.fetch(url("/redirector"), {
        ...htmlOpts,
        beforeHop: async (u) => {
          if (u.pathname === "/final") throw new CrawlError(refusal);
        },
      });
      expect(result.url.pathname).toBe("/redirector");
      expect(result.body.toString("utf8")).toContain("url=/final");
      expect(hits.slice(before).filter((h) => h === "/final")).toEqual([]);
    }
    // An aborted politeness wait still aborts the fetch.
    expect(
      await code(
        f.fetch(url("/redirector"), {
          ...htmlOpts,
          beforeHop: async (u) => {
            if (u.pathname === "/final") throw new CrawlError("aborted");
          },
        }),
      ),
    ).toBe("aborted");
    await f.close();
  });

  it("never loops: a self-refresh or a refresh back to a visited page returns the page (review fix)", async () => {
    const f = fetcher();
    const selfBefore = hits.length;
    const self = await f.fetch(url("/self"), htmlOpts);
    expect(self.url.pathname).toBe("/self");
    expect(hits.slice(selfBefore)).toEqual(["/self"]);
    // /loop-a -> /loop-b -> /loop-a: the second page is the answer, each fetched once.
    const loopBefore = hits.length;
    const loop = await f.fetch(url("/loop-a"), htmlOpts);
    expect(loop.url.pathname).toBe("/loop-b");
    expect(hits.slice(loopBefore)).toEqual(["/loop-a", "/loop-b"]);
    await f.close();
  });

  it("counts meta hops and HTTP redirects in one shared budget", async () => {
    const f = fetcher();
    const before = hits.length;
    // Five HTTP redirect hops to reach the meta page: no room left for it.
    expect(await code(f.fetch(url("/r0"), htmlOpts))).toBe("too_many_redirects");
    expect(hits.slice(before).filter((h) => h === "/final")).toEqual([]);
    // A chain of distinct refresh targets burns the budget exactly like a
    // redirect chain (review fix: a self-refresh no longer does — it is
    // caught as a loop, see the test above — so the chain is /m0 -> /m1 ...).
    const chainBefore = hits.length;
    expect(await code(f.fetch(url("/m0"), htmlOpts))).toBe("too_many_redirects");
    expect(hits.slice(chainBefore).filter((h) => h.startsWith("/m")).length).toBe(6); // hop 0..5
    // An HTTP redirect plus one meta hop is well inside it.
    const mixed = await f.fetch(url("/hop302"), htmlOpts);
    expect(mixed.url.pathname).toBe("/final");
    await f.close();
  });

  it("maps the meta target's answer like any hop's", async () => {
    const f = fetcher();
    expect(await code(f.fetch(url("/meta-404"), htmlOpts))).toBe("http_status");
    await f.close();
  });

  it("resolves the target against the current URL, not a base href", async () => {
    const f = fetcher();
    const result = await f.fetch(url("/meta-base"), htmlOpts);
    expect(result.url.origin).toBe(`http://hop.test:${port}`);
    expect(result.url.pathname).toBe("/final");
    await f.close();
  });
});
