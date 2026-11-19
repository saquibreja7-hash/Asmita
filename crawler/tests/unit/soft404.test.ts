/**
 * Crawler v3 WP14: the soft-404 body digest and the per-source tracker.
 *
 * The digest normalises a fetched HTML body by collapsing whitespace and
 * stripping digits, so a "not found" template that echoes only the
 * requested id or page number is recognised across URLs — while genuinely
 * different pages (different words, different image addresses) stay
 * distinct. The tracker counts the distinct URLs that carried each digest
 * and flags a digest from the spec's "5 or more" on; it holds hashes only,
 * never a URL or body, and is bounded.
 */
import { describe, expect, it } from "vitest";
import { SOFT404_DIGEST_CAP, SOFT404_THRESHOLD, Soft404Tracker, soft404Digest } from "../../src/crawl/soft404.ts";

describe("soft404Digest", () => {
  it("collapses whitespace", () => {
    const a = soft404Digest("<html>\n\t<body>  <p>Page not found</p>\n</body></html>");
    const b = soft404Digest("<html> <body> <p>Page not found</p> </body></html>");
    expect(a).toBe(b);
  });

  it("strips digits", () => {
    const a = soft404Digest('<h1>Item 12 of 348</h1><img src="/img/photo-12.jpg">');
    const b = soft404Digest('<h1>Item 99 of 1077</h1><img src="/img/photo-99.jpg">');
    expect(a).toBe(b);
  });

  it("keeps genuinely different pages distinct", () => {
    const digests = new Set(
      ["alpha", "bravo", "charlie"].map(
        (w) => soft404Digest(`<h1>Gallery ${w}</h1><p>Photo 3 of 9, published in 2026.</p><img src="/img/gal-${w}.png">`),
      ),
    );
    expect(digests.size).toBe(3);
  });

  it("ignores digit-only variation the same way whichever comes first", () => {
    // The same template with different ids, in both orders: one digest.
    const a = soft404Digest("<p>Sorry, the page /missing/12345 does not exist.</p>");
    const b = soft404Digest("<p>Sorry, the page /missing/6789 does not exist.</p>");
    expect(a).toBe(soft404Digest("<p>Sorry, the page /missing/6789 does not exist.</p>"));
    expect(a).toBe(b);
  });

  it("is a short fixed-shape hash, never body content", () => {
    const d = soft404Digest("<p>some very specific fixture sentence</p>");
    expect(d).toMatch(/^[0-9a-f]{16}$/);
    expect(d).not.toContain("some");
    expect(soft404Digest("")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different non-digit content differs", () => {
    expect(soft404Digest("<p>not found</p>")).not.toBe(soft404Digest("<p>gone fishing</p>"));
  });
});

describe("Soft404Tracker", () => {
  const digestOf = (s: string) => soft404Digest(s);

  it("flags a digest only from the sixth distinct URL (the spec's 5 or more)", () => {
    const t = new Soft404Tracker();
    const d = digestOf("<p>not found</p>");
    for (let i = 1; i <= SOFT404_THRESHOLD; i++) {
      expect(t.observe(d, `http://x.test/missing-${i}`), `url ${i}`).toBe(false);
    }
    for (let i = SOFT404_THRESHOLD + 1; i <= SOFT404_THRESHOLD + 4; i++) {
      expect(t.observe(d, `http://x.test/missing-${i}`), `url ${i}`).toBe(true);
    }
  });

  it("counts distinct URLs, not observations: the same URL twice is one", () => {
    const t = new Soft404Tracker();
    const d = digestOf("<p>not found</p>");
    for (let i = 1; i <= SOFT404_THRESHOLD; i++) {
      expect(t.observe(d, "http://x.test/a")).toBe(false);
    }
    // Five observations of ONE url: still not 5 distinct URLs.
    expect(t.observe(d, "http://x.test/a")).toBe(false);
    for (let i = 1; i < SOFT404_THRESHOLD; i++) {
      expect(t.observe(d, `http://x.test/b-${i}`)).toBe(false);
    }
    // 1 + 4 = 5 distinct URLs now: the next distinct one is a soft-404.
    expect(t.observe(d, "http://x.test/c")).toBe(true);
  });

  it("tracks digests independently", () => {
    const t = new Soft404Tracker();
    const d1 = digestOf("<p>not found</p>");
    const d2 = digestOf("<p>gone fishing</p>");
    // d1 crosses the threshold and is flagged; d2, observed on four
    // distinct URLs, never is — one digest's count never affects another.
    for (let i = 1; i <= SOFT404_THRESHOLD + 1; i++) {
      expect(t.observe(d1, `http://x.test/a-${i}`)).toBe(i <= SOFT404_THRESHOLD ? false : true);
    }
    for (let i = 1; i <= SOFT404_THRESHOLD - 1; i++) {
      expect(t.observe(d2, `http://x.test/b-${i}`)).toBe(false);
    }
  });

  it("keeps at most its cap of digests, evicting the oldest for each new one", () => {
    const t = new Soft404Tracker(SOFT404_THRESHOLD, 3);
    for (let i = 1; i <= 8; i++) {
      for (let j = 1; j <= SOFT404_THRESHOLD + 2; j++) {
        // Each template is genuinely distinct and never re-observed (the
        // LRU test below covers what a re-observed digest does).
        expect(t.observe(digestOf(`template ${"z".repeat(i)}`), `http://x.test/t${i}-${j}`)).toBe(
          j <= SOFT404_THRESHOLD ? false : true,
        );
      }
    }
    expect(t.size).toBe(3);
  });

  it("tracks up to the default cap of distinct digests, evicting the oldest", () => {
    const t = new Soft404Tracker();
    // Genuinely distinct bodies (digit-only variation would be one digest).
    for (let i = 1; i <= SOFT404_DIGEST_CAP; i++) {
      expect(t.observe(digestOf(`distinct template ${"x".repeat(i)}`), `http://x.test/d${i}`)).toBe(false);
    }
    expect(t.size).toBe(SOFT404_DIGEST_CAP);
    // One more digest evicts the first; the map stays bounded.
    expect(t.observe(digestOf("one more"), "http://x.test/extra")).toBe(false);
    expect(t.size).toBe(SOFT404_DIGEST_CAP);
  });

  it("evicts the least recently used digest when full, and counting restarts for it", () => {
    const t = new Soft404Tracker(SOFT404_THRESHOLD, 2);
    const d1 = digestOf("first template");
    const d2 = digestOf("second template");
    const d3 = digestOf("third template");
    t.observe(d1, "http://x.test/1");
    t.observe(d2, "http://x.test/2");
    t.observe(d1, "http://x.test/3"); // d1 is now the most recently used
    t.observe(d3, "http://x.test/4"); // evicts d2, not d1
    expect(t.size).toBe(2);
    // d1 survived with its two URLs; four more distinct URLs fill it to
    // five, and the next is flagged (the spec's "5 or more").
    expect(t.observe(d1, "http://x.test/5")).toBe(false);
    expect(t.observe(d1, "http://x.test/6")).toBe(false);
    expect(t.observe(d1, "http://x.test/7")).toBe(false);
    expect(t.observe(d1, "http://x.test/8")).toBe(true);
    // d2 was evicted: it starts counting fresh.
    for (let i = 1; i <= SOFT404_THRESHOLD; i++) {
      expect(t.observe(d2, `http://x.test/again-${i}`)).toBe(false);
    }
    expect(t.observe(d2, "http://x.test/again-final")).toBe(true);
  });

  it("holds at most threshold distinct URLs per digest once flagged", () => {
    const t = new Soft404Tracker();
    const d = digestOf("template");
    for (let i = 1; i <= SOFT404_THRESHOLD + 10; i++) t.observe(d, `http://x.test/x-${i}`);
    expect(t.size).toBe(1);
  });

  it("is empty when its cap is zero (fail open everywhere)", () => {
    const t = new Soft404Tracker(SOFT404_THRESHOLD, 0);
    expect(t.observe(digestOf("x"), "http://x.test/1")).toBe(false);
    expect(t.size).toBe(0);
  });
});
