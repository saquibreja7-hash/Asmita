/** URL normalisation (for dedup) and crawl scope. */
import { getDomain } from "tldts";

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;

/**
 * Canonical form used as the dedup key and as the request URL:
 *   - parsed by WHATWG URL (lower-cases scheme and host, IDNA to punycode,
 *     resolves dot segments, drops default ports, canonicalises IPv4 forms);
 *   - fragment removed;
 *   - tracking parameters removed, remaining query parameters sorted;
 *   - empty path becomes "/".
 * Returns null for anything that is not http(s).
 */
export function normalizeUrl(raw: string, base?: string | URL): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  if (url.search) {
    const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
    params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
    url.search = new URLSearchParams(params).toString();
  }
  if (url.pathname === "") url.pathname = "/";
  return url;
}

/**
 * Registrable domain (eTLD+1) with private suffixes on, so an approved
 * `someone.blogspot.com` stays limited to that blog instead of widening to
 * every blogspot.com site. Returns null for IP literals and bare suffixes.
 */
export function registrableDomain(hostname: string): string | null {
  return getDomain(hostname, { allowPrivateDomains: true, validHosts: [] }) ?? null;
}

/** A page is in scope when its registrable domain equals the source's. */
export function inScope(url: URL, sourceRegistrable: string): boolean {
  return registrableDomain(url.hostname) === sourceRegistrable;
}
