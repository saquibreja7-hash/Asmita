/**
 * The browser worker's blocked-request lists (crawler v3 WP15):
 *   - fonts and audio/video media are blocked by resource kind, images and
 *     the kinds a page needs to build its gallery are not;
 *   - the small built-in list of advertising/analytics hosts matches the
 *     host itself and its subdomains, whatever the scheme, port or path;
 *   - the list is written in code and deliberately excludes every image and
 *     video CDN: a blocked media host would silently lose matches, so the
 *     well-known ones are asserted never to match.
 */
import { describe, expect, it } from "vitest";
import { BLOCKED_AD_HOSTS, BLOCKED_RESOURCE_TYPES, blockedRequestHost, blockedResourceType } from "../../src/browser/blocked-requests.ts";

describe("blocked resource kinds", () => {
  it("blocks fonts and audio/video media", () => {
    expect([...BLOCKED_RESOURCE_TYPES].sort()).toEqual(["font", "media"]);
    expect(blockedResourceType("font")).toBe(true);
    expect(blockedResourceType("media")).toBe(true);
  });

  it("never blocks the kinds a gallery is built from", () => {
    for (const kind of ["document", "stylesheet", "image", "script", "xhr", "fetch", "websocket", "manifest", "preflight", "other"]) {
      expect(blockedResourceType(kind)).toBe(false);
    }
  });
});

describe("blocked advertising and analytics hosts", () => {
  it("blocks every listed host and its subdomains, whatever the scheme, port or path", () => {
    expect(blockedRequestHost("https://www.google-analytics.com/analytics.js")).toBe(true);
    expect(blockedRequestHost("http://google-analytics.com")).toBe(true);
    expect(blockedRequestHost("https://sb.scorecardresearch.com/b?c=1")).toBe(true);
    expect(blockedRequestHost("http://ad.doubleclick.net:8080/x?y=1")).toBe(true);
    expect(blockedRequestHost("https://static.hotjar.com/z.js")).toBe(true);
    expect(blockedRequestHost(new URL("https://mc.yandex.ru/watch/1"))).toBe(true);
    expect(blockedRequestHost("HTTPS://WWW.GOOGLETAGMANAGER.COM/GTM.JS")).toBe(true);
    expect(blockedRequestHost("https://google-analytics.com./x")).toBe(true); // trailing dot
  });

  it("does not block hosts that merely contain a listed name", () => {
    expect(blockedRequestHost("https://not-doubleclick.net/x")).toBe(false);
    expect(blockedRequestHost("https://doubleclick.net.evil.example/x")).toBe(false);
    expect(blockedRequestHost("https://evildoubleclick.net/x")).toBe(false);
  });

  it("does not block crawled content, whatever asks for it", () => {
    for (const url of [
      "https://example.com/analytics.js",
      "https://cdn.example.com/font.woff2",
      "http://forum.example.org/media/x.mp4",
      "https://sub.deep.example.net/img/a.png",
    ]) {
      expect(blockedRequestHost(url)).toBe(false);
    }
  });

  it("includes no image or video CDN, so no real media host is ever blocked", () => {
    // Hosts whose business is serving images or video (the fixture's own
    // image CDN included). Blocking any of them would silently drop
    // matches, which is exactly what the list must never do.
    const mediaHosts = [
      "imgur.com",
      "i.imgur.com",
      "i.ytimg.com",
      "img.youtube.com",
      "twimg.com",
      "pbs.twimg.com",
      "cdninstagram.com",
      "scontent.cdninstagram.com",
      "fbcdn.net",
      "cloudinary.com",
      "res.cloudinary.com",
      "imgix.net",
      "images.unsplash.com",
      "cdn.imgcdn.test", // the crawler fixtures' image CDN
      "video.example.com", // a source's own media subdomain
    ];
    for (const host of mediaHosts) {
      expect(blockedRequestHost(`https://${host}/x.png`), host).toBe(false);
    }
    // And by construction: no listed entry is itself a media CDN host.
    for (const entry of BLOCKED_AD_HOSTS) {
      expect(mediaHosts.some((m) => entry === m || entry.endsWith(`.${m}`) || m.endsWith(`.${entry}`)), entry).toBe(false);
    }
  });

  it("is a small list of bare hostnames, not URLs or IPs", () => {
    expect(BLOCKED_AD_HOSTS.length).toBeLessThanOrEqual(20);
    for (const entry of BLOCKED_AD_HOSTS) {
      expect(entry).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/);
    }
  });

  it("leaves unparseable URLs to the caller's own refusal rules", () => {
    expect(blockedRequestHost("not a url")).toBe(false);
    expect(blockedRequestHost("")).toBe(false);
  });
});
