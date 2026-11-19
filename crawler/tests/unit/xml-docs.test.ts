/**
 * Crawler v2 WP4: sitemap and feed documents — sniffing (root element, gzip
 * magic), bounded parsing of urlsets, sitemap indexes and image sitemap
 * entries, RSS and Atom entry links, and robots.txt Sitemap: lines.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseRobots, robotsSitemaps, ROBOTS_SITEMAP_CAP } from "../../src/crawl/robots.ts";
import { ReportedPageSchema } from "../../src/asmita/client.ts";
import { decodeEntities, isGzipBody, parseFeed, parseSitemap, sniffXmlDoc } from "../../src/crawl/xml-docs.ts";

const base = new URL("https://deep.example/sitemap.xml");
const loc = (u: string) => ({ loc: new URL(u), images: [] as URL[], lastmod: null });

describe("sniffXmlDoc", () => {
  it("recognises the four document kinds by root element, whatever the prologue", () => {
    expect(sniffXmlDoc(Buffer.from(`<?xml version="1.0"?>\n<!-- c --><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`))).toBe("urlset");
    expect(sniffXmlDoc(Buffer.from(`<sitemapindex xmlns="x"/>`))).toBe("sitemapindex");
    expect(sniffXmlDoc(Buffer.from(`<?xml version="1.0"?><rss version="2.0"><channel/></rss>`))).toBe("rss");
    expect(sniffXmlDoc(Buffer.from(`<feed xmlns="http://www.w3.org/2005/Atom"/>`))).toBe("atom");
  });
  it("returns null for HTML, text and gzip bodies", () => {
    expect(sniffXmlDoc(Buffer.from("<!doctype html><html><body></body></html>"))).toBeNull();
    expect(sniffXmlDoc(Buffer.from("<html xmlns='http://www.w3.org/1999/xhtml'><body/></html>"))).toBeNull();
    expect(sniffXmlDoc(Buffer.from("just some text"))).toBeNull();
    expect(sniffXmlDoc(gzipSync(Buffer.from("<urlset/>")))).toBeNull(); // caller inflates first
    expect(isGzipBody(gzipSync(Buffer.from("<urlset/>")))).toBe(true);
    expect(isGzipBody(Buffer.from("<urlset/>"))).toBe(false);
  });
});

describe("decodeEntities", () => {
  it("decodes the five XML entities and numeric ones, leaves the rest", () => {
    expect(decodeEntities("a&amp;b")).toBe("a&b");
    expect(decodeEntities("&#65;&#x42;")).toBe("AB");
    expect(decodeEntities("&quot;&apos;&lt;&gt;")).toBe('"\'<>');
    expect(decodeEntities("&nbsp;&fake;")).toBe("&nbsp;&fake;");
  });
});

describe("parseSitemap", () => {
  const urlset = (entries: string) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  it("collects pages, image entries and entities", () => {
    const xml = urlset(`
  <url><loc>https://deep.example/a</loc></url>
  <url><loc>https://deep.example/b?x=1&amp;y=2</loc>
       <image:image><image:loc>https://cdn.example/b-full.jpg</image:loc></image:image>
       <image:image><image:loc>/b-second.png</image:loc></image:image>
  </url>
  <url><loc> <![CDATA[https://deep.example/c?a=1&b=2]]> </loc></url>
  <url><lastmod>2026-01-01</lastmod><loc>https://deep.example/d</loc></url>`);
    const parsed = parseSitemap(Buffer.from(xml), base, "urlset", 100);
    expect(parsed.children).toEqual([]);
    expect(parsed.pages.map((p) => p.loc.href)).toEqual([
      "https://deep.example/a",
      "https://deep.example/b?x=1&y=2",
      "https://deep.example/c?a=1&b=2",
      "https://deep.example/d",
    ]);
    expect(parsed.pages[1]!.images.map((i) => i.href)).toEqual(["https://cdn.example/b-full.jpg", "https://deep.example/b-second.png"]);
    expect(parsed.truncated).toBe(false);
  });

  it("skips entries with unusable locs but keeps their siblings", () => {
    const xml = urlset(`
  <url><loc>javascript:void(0)</loc></url>
  <url><loc>mailto:someone@example.invalid</loc></url>
  <url><loc>https://deep.example/ok</loc></url>
  <url><loc>   </loc></url>`);
    const parsed = parseSitemap(Buffer.from(xml), base, "urlset", 100);
    expect(parsed.pages).toEqual([loc("https://deep.example/ok")]);
  });

  it("parses a sitemap index into child sitemaps", () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://deep.example/sitemap-1.xml.gz</loc></sitemap>
  <sitemap><loc>/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;
    const parsed = parseSitemap(Buffer.from(xml), base, "sitemapindex", 100);
    expect(parsed.pages).toEqual([]);
    expect(parsed.children.map((c) => c.loc.href)).toEqual(["https://deep.example/sitemap-1.xml.gz", "https://deep.example/sitemap-2.xml"]);
    expect(parsed.children.map((c) => c.lastmod)).toEqual([null, null]);
  });

  it("collects <lastmod> as strict ISO, dropping what is not one (WP11)", () => {
    const xml = urlset(`
  <url><loc>https://deep.example/full</loc><lastmod>2026-11-19T12:00:00+05:30</lastmod></url>
  <url><lastmod>2026-11-19</lastmod><loc>https://deep.example/date-only</loc></url>
  <url><loc>https://deep.example/zulu</loc><lastmod>2026-11-19T10:00:00Z</lastmod></url>
  <url><loc>https://deep.example/bogus</loc><lastmod>19 Nov 2026</lastmod></url>
  <url><loc>https://deep.example/partial</loc><lastmod>2026-11</lastmod></url>
  <url><loc>https://deep.example/none</loc></url>`);
    const parsed = parseSitemap(Buffer.from(xml), base, "urlset", 100);
    const lastmod = (u: string) => parsed.pages.find((p) => p.loc.href === u)!.lastmod;
    expect(lastmod("https://deep.example/full")).toBe("2026-11-19T06:30:00.000Z"); // offset normalised to UTC
    expect(lastmod("https://deep.example/date-only")).toBe("2026-11-19T00:00:00.000Z"); // the spec's date form
    expect(lastmod("https://deep.example/zulu")).toBe("2026-11-19T10:00:00.000Z");
    expect(lastmod("https://deep.example/bogus")).toBeNull(); // never guessed
    expect(lastmod("https://deep.example/partial")).toBeNull(); // a partial date is not an ISO date
    expect(lastmod("https://deep.example/none")).toBeNull();
    // An index child's own <lastmod> is collected the same way.
    const index = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://deep.example/child.xml</loc><lastmod>2026-11-19T10:00:00Z</lastmod></sitemap>
</sitemapindex>`;
    const kids = parseSitemap(Buffer.from(index), base, "sitemapindex", 100);
    expect(kids.children[0]!.lastmod).toBe("2026-11-19T10:00:00.000Z");
    // Whatever the parser produces passes the report contract's ISO rule.
    for (const entry of [...parsed.pages, ...kids.children]) {
      if (entry.lastmod === null) continue;
      const link = { url: entry.loc.href, kind: "page", lastmod: entry.lastmod };
      expect(ReportedPageSchema.safeParse({ id: "p1", status: "fetched", links: [link] }).success).toBe(true);
    }
  });

  it("stops taking URLs at the cap and reports truncation", () => {
    const xml = urlset(Array.from({ length: 5 }, (_, i) => `  <url><loc>https://deep.example/p${i}</loc></url>`).join("\n"));
    const parsed = parseSitemap(Buffer.from(xml), base, "urlset", 3);
    expect(parsed.pages).toHaveLength(3);
    expect(parsed.truncated).toBe(true);
    // Images count against the same cap.
    const withImages = urlset(
      Array.from({ length: 3 }, (_, i) => `  <url><loc>https://deep.example/p${i}</loc><image:image><image:loc>/i${i}.png</image:loc></image:image></url>`).join("\n"),
    );
    const capped = parseSitemap(Buffer.from(withImages), base, "urlset", 4);
    expect(capped.pages).toHaveLength(2); // 2 locs + 2 images = the cap
    expect(capped.truncated).toBe(true);
  });

  it("survives malformed and hostile documents without throwing", () => {
    // Truncated file: no closing tags at all.
    const cut = parseSitemap(Buffer.from("<urlset><url><loc>https://deep.example/a"), base, "urlset", 10);
    expect(cut.pages).toEqual([]); // nothing completed
    expect(cut.truncated).toBe(false);
    // A tag bomb: bounded events, quick return.
    const bomb = parseSitemap(Buffer.from("<urlset>" + "<x>".repeat(200_000)), base, "urlset", 10);
    expect(bomb.truncated).toBe(true);
    // An index with urlset children and vice versa: kind rules what counts.
    const mixed = parseSitemap(Buffer.from(urlset("<sitemap><loc>https://deep.example/child</loc></sitemap>")), base, "urlset", 10);
    expect(mixed.children).toEqual([]);
  });
});

describe("parseFeed", () => {
  it("collects RSS item links, not the channel link", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>t</title><link>https://deep.example/</link>
  <item><title>a</title><link>https://deep.example/posts/a</link></item>
  <item><title>b</title><link>https://deep.example/posts/b?x=1&amp;y=2</link></item>
</channel></rss>`;
    const parsed = parseFeed(Buffer.from(xml), new URL("https://deep.example/feed.rss"), "rss", 100);
    expect(parsed.entries.map((e) => e.href)).toEqual(["https://deep.example/posts/a", "https://deep.example/posts/b?x=1&y=2"]);
    expect(parsed.truncated).toBe(false);
  });

  it("collects Atom entries, preferring rel=alternate and skipping rel=self", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="https://deep.example/feed.atom"/>
  <entry><title>a</title><link rel="self" href="https://deep.example/feed.atom"/><link rel="alternate" href="https://deep.example/posts/a"/></entry>
  <entry><title>b</title><link href="/posts/b"/></entry>
  <entry><title>c</title><link rel="enclosure" href="https://cdn.example/c.mp3" type="audio/mpeg"/></entry>
</feed>`;
    const parsed = parseFeed(Buffer.from(xml), new URL("https://deep.example/feed.atom"), "atom", 100);
    expect(parsed.entries.map((e) => e.href)).toEqual(["https://deep.example/posts/a", "https://deep.example/posts/b"]);
  });

  it("caps entries and reports truncation", () => {
    const xml = `<rss version="2.0"><channel>${Array.from({ length: 5 }, (_, i) => `<item><link>https://deep.example/p${i}</link></item>`).join("")}</channel></rss>`;
    const parsed = parseFeed(Buffer.from(xml), base, "rss", 3);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.truncated).toBe(true);
  });
});

describe("robots.txt Sitemap lines", () => {
  it("collects them, case-insensitively, ignoring non-sitemap lines", () => {
    const text = ["User-agent: *", "Disallow: /x", "SITEMAP: https://a.example/s.xml", "sitemap: https://b.example/s.xml", "sitemap: ", "Sitemap: relative-ok.xml"].join("\n");
    expect(robotsSitemaps(text)).toEqual(["https://a.example/s.xml", "https://b.example/s.xml", "relative-ok.xml"]);
    expect(robotsSitemaps("no sitemap here")).toEqual([]);
  });
  it("is capped and surfaces on the parsed rules", () => {
    const many = Array.from({ length: 80 }, (_, i) => `Sitemap: https://x.example/s${i}.xml`).join("\n");
    expect(robotsSitemaps(many)).toHaveLength(ROBOTS_SITEMAP_CAP);
    const rules = parseRobots("https://x.example/robots.txt", "User-agent: *\nAllow: /\nSitemap: https://x.example/sitemap.xml\n", "AsmitaCrawler");
    expect(rules.sitemaps).toEqual(["https://x.example/sitemap.xml"]);
    expect(rules.isAllowed(new URL("https://x.example/a"))).toBe(true);
  });
});
