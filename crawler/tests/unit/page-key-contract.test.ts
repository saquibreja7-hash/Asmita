/**
 * The page-key contract (crawler v3 WP10): the crawler's `urlKey`
 * (src/crawl/url.ts) and the app's digest key (`crawlPageKey` in
 * asmita/src/lib/crawl-pages.ts) must be the same function of a URL, so a
 * page the two sides spell differently is stored and fetched once. Both
 * sides delegate to one shared module (asmita/src/lib/crawl-page-key.ts,
 * imported read-only like pdq.ts); this test pins the crawler's side to
 * that module over every equivalence pair, and the app-side test
 * (asmita/tests/unit/crawl-frontier.test.ts) pins the app's side to it —
 * together they prove the two produce the same key.
 */
import { describe, expect, it } from "vitest";
import { pageKey, pageKeyOf } from "../../../asmita/src/lib/crawl-page-key.ts";
import { normalizeUrl, urlKey } from "../../src/crawl/url.ts";

/** Every equivalence pair of one page (WP10), plus the near-misses that stay distinct. */
const ONE_PAGE = [
  "https://example.com/target",
  "http://example.com/target", // scheme
  "https://example.com/target/", // trailing slash on a non-root path
  "https://example.com/target/index.html", // final index document
  "https://example.com/target/index.htm",
  "https://example.com/target/index.php",
  "https://www.example.com/target", // www host (in scope when the bare host is)
  "http://www.example.com/target/index.html", // everything at once
  "https://example.com/target?utm_source=x", // tracking noise
];

const DISTINCT_PAGES = [
  "https://example.com/", // the root is its own page
  "https://example.com/target/extra",
  "https://example.com/target?a=1", // a real query parameter is content
  "https://example.com:8443/target", // a non-default port is a different server
  "https://sub.example.com/target", // a subdomain other than www is a different host
  "https://other.example.org/target",
  "https://example.com/indexering", // "index" as a prefix, not a final document
  "https://example.com/target/index.html/x", // the index document is not final
];

describe("page-key contract", () => {
  it("urlKey and the shared app-side key agree on every form of one page", () => {
    for (const raw of ONE_PAGE) {
      const url = normalizeUrl(raw)!;
      expect(urlKey(url), raw).toBe(pageKeyOf(url));
      expect(urlKey(url), raw).toBe(pageKey(raw));
    }
    for (const raw of DISTINCT_PAGES) {
      const url = normalizeUrl(raw)!;
      expect(urlKey(url), raw).toBe(pageKeyOf(url));
      expect(urlKey(url), raw).toBe(pageKey(raw));
    }
  });

  it("treats every equivalence pair as one page", () => {
    const keys = new Set(ONE_PAGE.map((raw) => urlKey(normalizeUrl(raw)!)));
    expect(keys).toEqual(new Set(["https://example.com/target"]));
  });

  it("keeps distinct pages distinct", () => {
    const keys = new Set(DISTINCT_PAGES.map((raw) => urlKey(normalizeUrl(raw)!)));
    expect(keys.size).toBe(DISTINCT_PAGES.length);
    for (const key of keys) expect(key).not.toBe("https://example.com/target");
  });

  it("collapses the root's index document to the root itself", () => {
    expect(urlKey(normalizeUrl("https://example.com/index.html")!)).toBe("https://example.com/");
    expect(urlKey(normalizeUrl("https://example.com/index.php")!)).toBe("https://example.com/");
    expect(urlKey(normalizeUrl("https://example.com/")!)).toBe("https://example.com/");
  });

  it("keeps a real query string as part of the identity, sorted, tracking-free", () => {
    expect(urlKey(normalizeUrl("https://example.com/t?b=2&a=1&utm_source=x")!)).toBe("https://example.com/t?a=1&b=2");
    expect(urlKey(normalizeUrl("https://example.com/t?a=1&b=2")!)).toBe("https://example.com/t?a=1&b=2");
    expect(urlKey(normalizeUrl("https://example.com/t?b=2&a=1")!)).toBe("https://example.com/t?a=1&b=2");
  });

  it("applies the same normalisation to image candidates (one key, one hash)", () => {
    expect(urlKey(normalizeUrl("http://cdn.example.net/img/a.png")!)).toBe(urlKey(normalizeUrl("https://cdn.example.net/img/a.png")!));
    expect(urlKey(normalizeUrl("https://cdn.example.net/img/a.png")!)).toBe(urlKey(normalizeUrl("https://www.cdn.example.net/img/a.png")!));
  });
});
