import { describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { extract, largestFromSrcset } from "../../src/crawl/extract.ts";
import { parseRobots, RobotsCache } from "../../src/crawl/robots.ts";
import { inScope, normalizeUrl, registrableDomain, sourceHost, urlKey } from "../../src/crawl/url.ts";
import type { FetchResult } from "../../src/net/safe-fetch.ts";

describe("normalizeUrl", () => {
  const n = (u: string, base?: string) => normalizeUrl(u, base)?.href ?? null;
  it.each([
    ["HTTP://Example.COM", "http://example.com/"],
    ["http://example.com:80/a/../b/./c", "http://example.com/b/c"],
    ["https://example.com:443/x#frag", "https://example.com/x"],
    ["http://example.com/p?b=2&a=1&utm_source=x", "http://example.com/p?b=2&a=1&utm_source=x"], // query kept as written
    ["http://bücher.example/", "http://xn--bcher-kva.example/"],
    ["http://0x7f.1/", "http://127.0.0.1/"],
  ])("%s -> %s", (input, want) => expect(n(input)).toBe(want));
  it("dedup key drops tracking params and sorts the rest, without changing the URL", () => {
    const u = new URL("http://example.com/p?b=2&a=1&utm_source=x&fbclid=y");
    expect(urlKey(u)).toBe("http://example.com/p?a=1&b=2");
    expect(urlKey(new URL("http://example.com/p?utm_medium=z"))).toBe("http://example.com/p");
    expect(u.href).toBe("http://example.com/p?b=2&a=1&utm_source=x&fbclid=y");
    const signed = new URL("https://cdn.example.net/i.jpg?sig=a%2Fb&exp=1&url=https://x/y");
    expect(normalizeUrl(signed.href)!.href).toBe(signed.href);
  });
  it("resolves relative URLs and rejects non-http schemes", () => {
    expect(n("../img/a.png", "http://example.com/x/y/page")).toBe("http://example.com/x/img/a.png");
    expect(n("//cdn.example.net/a.png", "https://example.com/")).toBe("https://cdn.example.net/a.png");
    expect(n("mailto:a@example.com")).toBeNull();
    expect(n("javascript:void(0)")).toBeNull();
    expect(n("data:image/png;base64,AA")).toBeNull();
    expect(n("http://")).toBeNull();
  });
});

describe("scope", () => {
  it("uses the registrable domain with private suffixes", () => {
    expect(registrableDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("someone.blogspot.com")).toBe("someone.blogspot.com");
    expect(registrableDomain("127.0.0.1")).toBeNull();
    expect(registrableDomain("co.uk")).toBeNull();
  });
  it("scopes pages to the approved host and its subdomains only", () => {
    const apex = sourceHost("example.com")!;
    expect(inScope(new URL("https://example.com/"), apex)).toBe(true);
    expect(inScope(new URL("https://www.example.com/"), apex)).toBe(true);
    expect(inScope(new URL("https://a.b.example.com/"), apex)).toBe(true);
    expect(inScope(new URL("https://example.com.evil.net/"), apex)).toBe(false);
    expect(inScope(new URL("https://notexample.com/"), apex)).toBe(false);
    expect(inScope(new URL("https://evilexample.com/"), apex)).toBe(false);

    const forum = sourceHost("forum.example.com")!;
    expect(inScope(new URL("https://forum.example.com/t/1"), forum)).toBe(true);
    expect(inScope(new URL("https://m.forum.example.com/"), forum)).toBe(true);
    expect(inScope(new URL("https://example.com/"), forum)).toBe(false); // parent
    expect(inScope(new URL("https://shop.example.com/"), forum)).toBe(false); // sibling
    expect(inScope(new URL("https://www.example.com/"), forum)).toBe(false);
    expect(inScope(new URL("https://xforum.example.com/"), forum)).toBe(false);

    const blog = sourceHost("someone.blogspot.com")!;
    expect(inScope(new URL("https://other.blogspot.com/"), blog)).toBe(false);
  });
  it("accepts only bare, non-suffix hostnames as source domains", () => {
    expect(sourceHost("Example.COM.")).toBe("example.com");
    expect(sourceHost("bücher.example")).toBe("xn--bcher-kva.example");
    for (const bad of ["", "co.uk", "blogspot.com", "127.0.0.1", "[::1]", "example.com/path", "example.com:8080", "user@example.com", "exa mple.com", "example.com\\x", "%65xample.com"]) {
      expect(sourceHost(bad), bad).toBeNull();
    }
  });
});

describe("robots", () => {
  const txt = [
    "User-agent: *",
    "Disallow: /private/",
    "",
    "User-agent: AsmitaCrawler",
    "Disallow: /no-asmita/",
    "Allow: /no-asmita/ok",
    "Crawl-delay: 2",
  ].join("\n");
  it("applies the group for our token, with Allow precedence and Crawl-delay", () => {
    const r = parseRobots("https://example.com/robots.txt", txt, "AsmitaCrawler");
    expect(r.isAllowed(new URL("https://example.com/no-asmita/x"))).toBe(false);
    expect(r.isAllowed(new URL("https://example.com/no-asmita/ok"))).toBe(true);
    expect(r.isAllowed(new URL("https://example.com/private/x"))).toBe(true); // our group overrides *
    expect(r.crawlDelayMs).toBe(2000);
    const other = parseRobots("https://example.com/robots.txt", txt, "OtherBot");
    expect(other.isAllowed(new URL("https://example.com/private/x"))).toBe(false);
  });

  const cacheWith = (outcome: () => Promise<FetchResult>) => {
    let calls = 0;
    const cache = new RobotsCache(async () => {
      calls++;
      return outcome();
    }, "AsmitaCrawler");
    return { cache, calls: () => calls };
  };
  const ok = (body: string): FetchResult => ({ url: new URL("https://x.example/robots.txt"), status: 200, contentType: "text/plain", body: Buffer.from(body), xRobotsTag: "" });

  it("fetches once per origin", async () => {
    const { cache, calls } = cacheWith(async () => ok("User-agent: *\nDisallow: /a"));
    expect(await cache.isAllowed(new URL("https://x.example/a"))).toBe(false);
    expect(await cache.isAllowed(new URL("https://x.example/b"))).toBe(true);
    expect(calls()).toBe(1);
    await cache.isAllowed(new URL("https://y.example/b"));
    expect(calls()).toBe(2);
  });
  it.each([
    [404, true],
    [410, true],
    [401, false],
    [403, false],
    [429, false],
    [500, false],
    [503, false],
  ])("HTTP %i -> allowed=%s", async (status, allowed) => {
    const { cache } = cacheWith(async () => {
      throw new CrawlError("http_status", { status });
    });
    expect(await cache.isAllowed(new URL("https://x.example/page"))).toBe(allowed);
  });
  it("treats network failure, timeouts and oversize robots.txt as disallow-all", async () => {
    for (const c of ["connect_failed", "body_timeout", "body_too_large", "dns_failed", "too_many_redirects"] as const) {
      const { cache } = cacheWith(async () => {
        throw new CrawlError(c);
      });
      expect(await cache.isAllowed(new URL("https://x.example/"))).toBe(false);
    }
  });
});

describe("largestFromSrcset", () => {
  it.each([
    ["a.jpg 100w, b.jpg 800w, c.jpg 400w", "b.jpg"],
    ["a.jpg 1x, b.jpg 2x", "b.jpg"],
    ["a.jpg, b.jpg 1.5x", "b.jpg"],
    ["a.jpg 2x, b.jpg 100w", "b.jpg"],
    ["/img/x,y.jpg 300w, /img/z.jpg 200w", "/img/x,y.jpg"],
    ["  single.jpg  ", "single.jpg"],
    ["a.jpg 100w,b.jpg 200w", "b.jpg"],
    ["", null],
  ])("%s -> %s", (srcset, want) => expect(largestFromSrcset(srcset)).toBe(want));
});

describe("extract", () => {
  const page = new URL("https://example.com/dir/page.html");
  const paths = (urls: URL[]) => urls.map((u) => u.href).sort();

  it("collects every image candidate kind", () => {
    const ex = extract(
      `<html><head>
        <meta property="og:image" content="https://cdn.example.net/og.jpg">
        <meta name="twitter:image" content="/tw.png">
      </head><body>
        <img src="a.png">
        <img src="ph.gif" data-src="lazy.jpg" data-srcset="lz-1.jpg 1x, lz-2.jpg 2x">
        <img srcset="s-100.jpg 100w, s-900.jpg 900w" src="s-100.jpg">
        <img data-lazy-src="lazy2.webp"><img data-original="orig.jpg">
        <picture><source srcset="p-1.webp 1x, p-2.webp 2x"><source type="image/svg+xml" srcset="v.svg"><img src="p.jpg"></picture>
        <a href="/full/photo.JPG">full</a>
        <img src="data:image/png;base64,AAAA"><img src="logo.svg"><img src="icon.png" width="16" height="16">
      </body></html>`,
      page,
    );
    expect(paths(ex.images)).toEqual(
      [
        "https://cdn.example.net/og.jpg",
        "https://example.com/tw.png",
        "https://example.com/dir/a.png",
        "https://example.com/dir/ph.gif",
        "https://example.com/dir/lazy.jpg",
        "https://example.com/dir/lz-2.jpg",
        "https://example.com/dir/s-900.jpg",
        "https://example.com/dir/lazy2.webp",
        "https://example.com/dir/orig.jpg",
        "https://example.com/dir/p-2.webp",
        "https://example.com/dir/p.jpg",
        "https://example.com/full/photo.JPG",
      ].sort(),
    );
    expect(ex.skipped).toEqual({ data_uri: 1, svg: 2, tiny: 1, invalid: 0 });
  });

  it("resolves against <base href>", () => {
    const ex = extract(`<head><base href="https://example.com/assets/"></head><img src="x.png"><a href="next">n</a>`, page);
    expect(paths(ex.images)).toEqual(["https://example.com/assets/x.png"]);
    expect(paths(ex.links)).toEqual(["https://example.com/assets/next"]);
  });

  it("honours rel=nofollow, meta robots nofollow/none and X-Robots-Tag", () => {
    const body = `<a href="/a">a</a><a rel="nofollow" href="/b">b</a><a rel="noopener NOFOLLOW" href="/c">c</a>`;
    expect(paths(extract(body, page).links)).toEqual(["https://example.com/a"]);
    expect(extract(`<meta name="robots" content="noindex, nofollow">${body}`, page).links).toEqual([]);
    expect(extract(`<meta name="ROBOTS" content="none">${body}`, page).links).toEqual([]);
    expect(extract(body, page, "noarchive, nofollow").links).toEqual([]);
    // Images are still collected on nofollow pages.
    expect(extract(`<meta name="robots" content="nofollow"><img src="/i.png">`, page).images).toHaveLength(1);
  });

  it("caps links and image candidates per page and counts the rest", () => {
    const body = Array.from({ length: 50 }, (_, i) => `<a href="/l${i}">l</a><img src="/i${i}.png">`).join("");
    const ex = extract(body, page, "", { maxLinks: 10, maxImages: 5 });
    expect(ex.links).toHaveLength(10);
    expect(ex.images).toHaveLength(5);
    expect(ex.dropped).toEqual({ links: 40, images: 45 });
  });
  it("drops fragments and dedups links", () => {
    const ex = extract(`<a href="/x#1">1</a><a href="/x#2">2</a><a href="/x?utm_campaign=q">3</a><a href="mailto:a@b.c">m</a>`, page);
    expect(paths(ex.links)).toEqual(["https://example.com/x"]); // first occurrence kept
  });
});
