/**
 * Crawler v3 WP16: what extract() takes from frames — <iframe src> and
 * <frame src> as page links, the non-links (about:, data:, javascript:,
 * empty), nofollow (meta robots and the element's own rel), the obvious
 * non-content skip, the anchor rule for a src straight to an image file,
 * <base href> resolution, dedup against an anchor, and the per-page cap.
 *
 * Scope is not extract()'s to decide: an off-scope iframe src is collected
 * like any other link, and the crawler's link admission (in-scope check,
 * discovery report) treats it exactly as an anchor — proven end to end in
 * tests/integration/frames.test.ts.
 */
import { describe, expect, it } from "vitest";
import { extract } from "../../src/crawl/extract.ts";

const page = new URL("https://example.com/page.html");
const hrefs = (urls: URL[]) => urls.map((u) => u.href);

describe("frames as page links (crawler v3 WP16)", () => {
  it("collects an in-document iframe src as a page link", () => {
    const ex = extract(`<iframe src="/gallery"></iframe>`, page);
    expect(hrefs(ex.links)).toEqual(["https://example.com/gallery"]);
  });

  it("collects a frame src of a frameset document", () => {
    const ex = extract(`<!DOCTYPE html><html><head></head><frameset><frame src="/viewer"></frameset></html>`, page);
    expect(hrefs(ex.links)).toEqual(["https://example.com/viewer"]);
  });

  it("collects an off-scope iframe src too: scope is the crawler's check", () => {
    const ex = extract(`<iframe src="https://other.example/embed"></iframe>`, page);
    expect(hrefs(ex.links)).toEqual(["https://other.example/embed"]);
  });

  it("resolves a frame src against <base href>", () => {
    const ex = extract(`<base href="/fr/"><iframe src="g"></iframe>`, page);
    expect(hrefs(ex.links)).toEqual(["https://example.com/fr/g"]);
  });

  it("drops the fragment and dedups against an anchor to the same page", () => {
    const ex = extract(`<a href="/gallery">gallery</a><iframe src="/gallery#top"></iframe>`, page);
    expect(hrefs(ex.links)).toEqual(["https://example.com/gallery"]);
  });

  it("collects nothing for about:, data:, javascript: and malformed srcs", () => {
    const ex = extract(
      `<iframe src="about:blank"></iframe>
       <iframe src="data:text/html,<p>"></iframe>
       <iframe src="javascript:void(0)"></iframe>
       <iframe src="http://exa mple.invalid/"></iframe>`,
      page,
    );
    expect(ex.links).toEqual([]);
    expect(ex.dropped.links).toBe(0);
  });

  it("collects nothing for an empty, whitespace or missing src (no self-link)", () => {
    const ex = extract(`<iframe src=""></iframe><iframe src="  "></iframe><iframe></iframe>`, page);
    expect(ex.links).toEqual([]);
  });

  it("does not collect frame srcs on a meta-nofollow page", () => {
    const ex = extract(`<iframe src="/gallery"></iframe>`, page, "nofollow");
    expect(ex.links).toEqual([]);
  });

  it("does not collect an iframe marked rel=nofollow", () => {
    const ex = extract(`<iframe src="/gallery" rel="nofollow"></iframe><iframe src="/kept"></iframe>`, page);
    expect(hrefs(ex.links)).toEqual(["https://example.com/kept"]);
  });

  it("skips an obvious non-content frame src and counts it", () => {
    const ex = extract(`<iframe src="/login"></iframe>`, page);
    expect(ex.links).toEqual([]);
    expect(ex.skippedLinks.nonContent).toBe(1);
  });

  it("treats a src straight to an image file as an image candidate, not a page", () => {
    const ex = extract(`<iframe src="/pic.JPG"></iframe>`, page);
    expect(ex.links).toEqual([]);
    expect(hrefs(ex.images)).toEqual(["https://example.com/pic.JPG"]);
  });

  it("keeps frame srcs inside the per-page link cap and counts the overflow", () => {
    const ex = extract(
      `<a href="/one">1</a><iframe src="/two"></iframe><iframe src="/three"></iframe>`,
      page,
      "",
      { maxLinks: 2, maxImages: 10 },
    );
    expect(hrefs(ex.links)).toEqual(["https://example.com/one", "https://example.com/two"]);
    expect(ex.dropped.links).toBe(1);
  });
});
