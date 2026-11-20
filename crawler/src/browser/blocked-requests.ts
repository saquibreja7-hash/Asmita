/**
 * Requests the browser worker never fetches (crawler v3 WP15), applied before
 * any routing work: a request of a blocked kind, or to a blocked host, is
 * aborted before it is counted against the per-page request cap, before the
 * parent is asked for a robots.txt verdict and before anything reaches the
 * network. The request cap therefore keeps its room for the page's images.
 *
 * Blocked kinds: fonts and audio/video media. Neither can carry a gallery
 * image (image responses are their own resource type), so skipping them
 * saves a page's budget, bytes and robots round-trips without losing
 * coverage.
 *
 * Blocked hosts: a small built-in list of advertising and analytics hosts,
 * written here in code (no configuration: these are not decisions an
 * operator should be able to switch off). The list deliberately contains
 * only hosts whose sole business is advertising or analytics; it must never
 * include an image or video CDN — a site's real pictures are sometimes
 * served from CDNs, and blocking one would silently lose matches. The unit
 * test (tests/unit/browser-blocked.test.ts) enforces that against a list of
 * well-known media CDNs. A host matches if it equals an entry or is a
 * subdomain of one (the never-crawl rule of asmita/src/lib/crawl-never.ts).
 */
/** Resource types (Chromium's own labels) the worker never fetches. */
export const BLOCKED_RESOURCE_TYPES: ReadonlySet<string> = new Set(["font", "media"]);

/** Advertising and analytics hosts the worker never fetches, subdomains included. */
export const BLOCKED_AD_HOSTS: readonly string[] = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "scorecardresearch.com",
  "hotjar.com",
  "clarity.ms",
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "mc.yandex.ru",
  "adnxs.com",
  "criteo.com",
  "pubmatic.com",
  "rubiconproject.com",
];

/** True for resource types the worker aborts before routing (fonts, media). */
export function blockedResourceType(resourceType: string): boolean {
  return BLOCKED_RESOURCE_TYPES.has(resourceType);
}

/**
 * True when the URL's host is on the built-in advertising/analytics list
 * (the host itself or any subdomain of it). An unparseable URL is not a
 * blocked host; the caller refuses it on its own rules.
 */
export function blockedRequestHost(url: string | URL): boolean {
  let hostname: string;
  try {
    hostname = typeof url === "string" ? new URL(url).hostname : url.hostname;
  } catch {
    return false;
  }
  hostname = hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "") return false;
  return BLOCKED_AD_HOSTS.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}
