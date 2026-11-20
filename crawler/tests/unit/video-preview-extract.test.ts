/**
 * Video-fingerprints spec WP21 at the extractor: which image candidates a
 * page's video markup yields, and which of them carry the "video preview"
 * tag — a <video poster>, the og:image of a page that declares an og:video,
 * and a JSON-LD VideoObject thumbnailUrl. The tag is bookkeeping for the
 * run's counters; the candidates themselves are ordinary images.
 */
import { describe, expect, it } from "vitest";
import { extract } from "../../src/crawl/extract.ts";
import { urlKey } from "../../src/crawl/url.ts";

const page = new URL("https://example.com/watch.html");
const key = (u: string) => urlKey(new URL(u, page));
const paths = (urls: URL[]) => urls.map((u) => u.href).sort();

describe("video posters (WP21)", () => {
  it("are image candidates and carry the video preview tag", () => {
    const ex = extract(`<video poster="/img/poster.png" src="/clip.webm"></video>`, page);
    expect(paths(ex.images)).toEqual(["https://example.com/img/poster.png"]);
    expect(ex.videoPreviews).toEqual(new Set([key("/img/poster.png")]));
  });
  it("are not tagged when they are not a usable image", () => {
    const ex = extract(`<video poster="data:image/png;base64,AAAA" src="/clip.webm"></video>`, page);
    expect(ex.images).toEqual([]);
    expect(ex.videoPreviews).toEqual(new Set());
    expect(ex.skipped.data_uri).toBe(1);
  });
  it("tag one candidate however many spellings the page offers", () => {
    // The same poster as an attribute and a plain <img>: one image, tagged.
    const ex = extract(`<video poster="/img/poster.png"></video><img src="/img/poster.png">`, page);
    expect(ex.images).toHaveLength(1);
    expect(ex.videoPreviews).toEqual(new Set([key("/img/poster.png")]));
  });
});

describe("og:video preview images (WP21)", () => {
  it("og:image is tagged on a page that declares an og:video", () => {
    const ex = extract(
      `<meta property="og:video" content="https://example.com/clip.mp4">
       <meta property="og:image" content="/img/og-preview.png">`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/og-preview.png"]);
    expect(ex.videoPreviews).toEqual(new Set([key("/img/og-preview.png")]));
  });
  it("every og:video spelling marks the page, and every og:image spelling is tagged", () => {
    for (const prop of ["og:video:url", "og:video:secure_url"]) {
      const ex = extract(
        `<meta property="${prop}" content="https://example.com/clip.mp4">
         <meta property="og:image:url" content="/img/a.png">
         <meta property="og:image:secure_url" content="/img/b.png">`,
        page,
      );
      expect(ex.videoPreviews).toEqual(new Set([key("/img/a.png"), key("/img/b.png")]));
    }
  });
  it("og:image without an og:video stays an ordinary, untagged candidate", () => {
    const ex = extract(`<meta property="og:image" content="/img/plain-og.png">`, page);
    expect(paths(ex.images)).toEqual(["https://example.com/img/plain-og.png"]);
    expect(ex.videoPreviews).toEqual(new Set());
  });
  it("a video page's twitter:image is still an image, but not tagged", () => {
    // The spec names the og:video preview images; twitter:card images keep
    // their WP4 treatment whatever the page declares.
    const ex = extract(
      `<meta property="og:video" content="https://example.com/clip.mp4">
       <meta name="twitter:image" content="/img/card.png">`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/card.png"]);
    expect(ex.videoPreviews).toEqual(new Set());
  });
  it("the og:video itself is never an image candidate", () => {
    const ex = extract(
      `<meta property="og:video" content="https://example.com/clip.mp4">
       <meta property="og:video:secure_url" content="https://example.com/clip.m3u8">`,
      page,
    );
    expect(ex.images).toEqual([]);
  });
});

describe("JSON-LD VideoObject thumbnailUrl (WP21)", () => {
  it("is an image candidate tagged video preview", () => {
    const ex = extract(
      `<script type="application/ld+json">{"@type":"VideoObject","thumbnailUrl":"/img/thumb.png"}</script>`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/thumb.png"]);
    expect(ex.videoPreviews).toEqual(new Set([key("/img/thumb.png")]));
  });
  it("is found inside an @graph and as an array, any case of @type", () => {
    const ex = extract(
      `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
         {"@type":"videoobject","thumbnailUrl":["/img/t1.png","https://cdn.example/t2.jpg"]}]}
      </script>`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/t1.png", "https://cdn.example/t2.jpg"].sort());
    expect(ex.videoPreviews).toEqual(new Set([key("/img/t1.png"), key("https://cdn.example/t2.jpg")]));
  });
  it("a thumbnailUrl on a non-VideoObject node is nothing", () => {
    // The spec names the VideoObject property; other schema.org types keep
    // whatever they carried before (an Article's image is still collected,
    // its thumbnailUrl is not).
    const ex = extract(
      `<script type="application/ld+json">{"@type":"Article","thumbnailUrl":"/img/not-video.png","image":"/img/article.png"}</script>`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/article.png"]);
    expect(ex.videoPreviews).toEqual(new Set());
  });
  it("a VideoObject's image keeps its WP4 treatment: collected, untagged", () => {
    const ex = extract(
      `<script type="application/ld+json">{"@type":"VideoObject","image":"/img/frame.png","thumbnailUrl":"/img/thumb.png"}</script>`,
      page,
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/frame.png", "https://example.com/img/thumb.png"].sort());
    expect(ex.videoPreviews).toEqual(new Set([key("/img/thumb.png")]));
  });
  it("a malformed or oversized block is skipped whole, tag and all", () => {
    const ex = extract(
      `<script type="application/ld+json">{"@type":"VideoObject","thumbnailUrl":"/img/t.png"}</script>
       <script type="application/ld+json">{broken</script>`,
      page,
    );
    expect(ex.skippedDocs.jsonld).toBe(1);
    expect(ex.videoPreviews).toEqual(new Set([key("/img/t.png")]));
  });
});

describe("the tag and the per-page caps (WP21)", () => {
  it("a candidate the cap dropped is not tagged", () => {
    const ex = extract(
      `<img src="/img/first.png"><video poster="/img/poster.png"></video>`,
      page,
      "",
      { maxLinks: 10, maxImages: 1 },
    );
    expect(paths(ex.images)).toEqual(["https://example.com/img/first.png"]);
    expect(ex.dropped.images).toBe(1);
    expect(ex.videoPreviews).toEqual(new Set());
  });
  it("a sprite-named <img> is an ordinary candidate here; the crawler tags it", () => {
    // The sprite decision lives with the decoder request (crawler.ts): the
    // extractor has no reason to know an address looks like a sprite.
    const ex = extract(`<img src="/img/preview-sprite.png">`, page);
    expect(paths(ex.images)).toEqual(["https://example.com/img/preview-sprite.png"]);
    expect(ex.videoPreviews).toEqual(new Set());
  });
});
