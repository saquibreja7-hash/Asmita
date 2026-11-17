/**
 * Crawler v2 WP4: what extract() takes from a page — the new image
 * candidates (background-image, video poster, image_src, JSON-LD, noscript,
 * thumbnail hrefs), feed links, pagination detection and priority, and the
 * non-content skip.
 */
import { describe, expect, it } from "vitest";
import { extract } from "../../src/crawl/extract.ts";

const page = new URL("https://example.com/page.html");
const paths = (urls: URL[]) => urls.map((u) => u.href).sort();
const path = (urls: URL[]) => urls.map((u) => u.href);

describe("new image candidates", () => {
  it("takes background-image urls from inline styles", () => {
    const ex = extract(
      `<div style="background-image:url('/a.png')">x</div>
       <div style="background:#fff url('/b.jpg') no-repeat">y</div>
       <div style="background-image:url('c.webp'), url(/d.avif)">z</div>
       <div style="color:red">no</div>`,
      page,
    );
    expect(paths(ex.images)).toEqual(
      ["https://example.com/a.png", "https://example.com/b.jpg", "https://example.com/c.webp", "https://example.com/d.avif"].sort(),
    );
  });

  it("takes video posters, link rel=image_src and JSON-LD images", () => {
    const ex = extract(
      `<head>
        <link rel="IMAGE_SRC" href="/e.png">
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"ImageObject","image":["/f.png","https://cdn.example/g.jpg"]}],"mainEntity":{"image":{"contentUrl":"/h.webp"}}}</script>
        <script type="application/ld+json">{broken json</script>
      </head><body>
        <video poster="/poster.png" controls><source src="v.mp4" type="video/mp4"></video>
      </body>`,
      page,
    );
    expect(paths(ex.images)).toEqual(
      ["https://example.com/e.png", "https://example.com/f.png", "https://cdn.example/g.jpg", "https://example.com/h.webp", "https://example.com/poster.png"].sort(),
    );
    expect(ex.skippedDocs.jsonld).toBe(1);
  });

  it("skips oversized JSON-LD blocks", () => {
    const big = `{"image":"${"x".repeat(300_000)}"}`;
    const ex = extract(`<script type="application/ld+json">${big}</script>`, page);
    expect(ex.images).toEqual([]);
    expect(ex.skippedDocs.jsonld).toBe(1);
  });

  it("takes noscript fallback images", () => {
    const ex = extract(`<noscript><img src="/ns.png" data-src="/ns-lazy.png"></noscript>`, page);
    expect(paths(ex.images)).toEqual(["https://example.com/ns.png", "https://example.com/ns-lazy.png"].sort());
  });

  it("takes the href of a thumbnail link, not the thumbnail itself", () => {
    const ex = extract(
      `<a href="/full/photo.JPG"><img src="/thumb/small.jpg" data-src="/thumb/lazy.jpg"></a>
       <a href="/wrap"><img src="/page-img.png"></a>`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/full/photo.JPG", "https://example.com/page-img.png"].sort());
  });

  it("skips an oversized noscript instead of re-parsing it", () => {
    const huge = `<img src="/${"a".repeat(600_000)}.png">`;
    const ex = extract(`<noscript>${huge}</noscript>`, page);
    expect(ex.images).toEqual([]);
    expect(ex.skippedDocs.noscript).toBe(1);
  });
});

describe("feeds", () => {
  it("collects rel=alternate feeds and .rss/.atom anchors as feeds, not pages", () => {
    const ex = extract(
      `<head><link rel="alternate" type="application/atom+xml" href="/feed.atom">
      <link rel="alternate" type="application/rss+xml" href="/feed.rss">
      <link rel="alternate" type="text/html" href="/not-a-feed">
      <link rel="alternate nofollow" type="application/atom+xml" href="/nofollow.atom"></head>
      <body><a href="/posts.xml">xml page</a><a href="/posts.atom">atom feed</a></body>`,
      page,
    );
    expect(path(ex.feeds).sort()).toEqual(["https://example.com/feed.atom", "https://example.com/feed.rss", "https://example.com/posts.atom"].sort());
    expect(path(ex.links)).toEqual(["https://example.com/posts.xml"]);
  });
});

describe("pagination", () => {
  it("marks rel=next, next/older text and next/page-N classes", () => {
    const body = `
      <a href="/l1">plain</a>
      <a rel="next" href="/l2">2</a>
      <a class="next-page" href="/l3">3</a>
      <a href="/l4">Next ›</a>
      <a href="/l5">older posts</a>
      <a href="/l6">Page 7</a>
      <a class="pagination page-9" href="/l7">9</a>
      <a href="/l8">next steps</a>
      <a href="/l9">a page</a>`;
    const ex = extract(body, page);
    expect(paths(ex.links)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `https://example.com/l${n}`).sort());
    // Pagination links come first: l2..l7, then the plain pages l1, l8, l9.
    expect(ex.links.slice(0, 6).map((u) => u.href).sort()).toEqual([2, 3, 4, 5, 6, 7].map((n) => `https://example.com/l${n}`).sort());
    expect(ex.links.slice(6).map((u) => u.href).sort()).toEqual([1, 8, 9].map((n) => `https://example.com/l${n}`).sort());
    expect(ex.pagination).toEqual(new Set([2, 3, 4, 5, 6, 7].map((n) => `https://example.com/l${n}`)));
  });

  it("puts pagination first, ahead of a flood of other links", () => {
    const flood = Array.from({ length: 400 }, (_, i) => `<a href="/f${i}">f</a>`).join("");
    const ex = extract(`${flood}<a rel="next" href="/next-up">Next</a>`, page, "", { maxLinks: 100, maxImages: 10 });
    expect(ex.links[0]!.href).toBe("https://example.com/next-up");
    expect(ex.links).toHaveLength(100);
    expect(ex.dropped.links).toBe(301);
  });

  it("takes <link rel=next> in the head as a pagination link", () => {
    const ex = extract(`<head><link rel="next" href="/page-2"><link rel="prev" href="/x"></head><a href="/z">z</a>`, page);
    expect(path(ex.links)).toEqual(["https://example.com/page-2", "https://example.com/z"]);
    expect(ex.pagination.has("https://example.com/page-2")).toBe(true);
  });

  it("collects no pagination or feed links under meta robots nofollow", () => {
    const ex = extract(
      `<head><meta name="robots" content="nofollow"><link rel="next" href="/n"><link rel="alternate" type="application/rss+xml" href="/f.rss"></head><a rel="next" href="/m">Next</a>`,
      page,
    );
    expect(ex.links).toEqual([]);
    expect(ex.feeds).toEqual([]);
    expect(ex.nofollow).toBe(true);
  });
});

describe("non-content skip", () => {
  it("skips login, cart, search and calendar links before the cap and counts them", () => {
    const body = `
      <a href="/login">log in</a>
      <a href="/cart">cart</a>
      <a href="/search?q=x">search</a>
      <a rel="next" class="next-day" href="/calendar/2026-01-01">Next day</a>
      <a href="/2026/11/17">archive</a>
      <a href="/keep">content</a>`;
    const ex = extract(body, page);
    expect(path(ex.links)).toEqual(["https://example.com/keep"]);
    expect(ex.skippedLinks.nonContent).toBe(5);
    expect(ex.dropped.links).toBe(0);
  });
});
