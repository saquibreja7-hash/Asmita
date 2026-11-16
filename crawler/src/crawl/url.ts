/** URL parsing, dedup keys and crawl scope. */
import { getDomain } from "tldts";

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;

/**
 * Parse a URL for fetching and reporting: WHATWG parsing (lower-cased scheme
 * and host, IDNA, dot segments resolved, default port dropped, IPv4 forms
 * canonicalised), fragment removed, empty path -> "/". The query string is
 * left exactly as the site wrote it, so signed or order-sensitive URLs still
 * work and findings carry the site's real address.
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
  if (url.pathname === "") url.pathname = "/";
  return url;
}

/**
 * Dedup key only (never fetched or reported): the URL with tracking
 * parameters removed and the remaining parameters sorted, so trivially
 * different links to one resource are fetched once.
 */
export function urlKey(url: URL): string {
  if (!url.search) return url.href;
  const params = [...new URLSearchParams(url.search).entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const copy = new URL(url.href);
  copy.search = new URLSearchParams(params).toString();
  return copy.href;
}

/**
 * Registrable domain (eTLD+1) with private suffixes on, so an approved
 * `someone.blogspot.com` stays limited to that blog instead of widening to
 * every blogspot.com site. Returns null for IP literals and bare suffixes.
 */
export function registrableDomain(hostname: string): string | null {
  return getDomain(hostname, { allowPrivateDomains: true, validHosts: [] }) ?? null;
}

/**
 * The canonical host of an admin-approved source domain, or null when it is
 * unusable: not a bare hostname (path, port, credentials), an IP literal, or a
 * public suffix on its own (e.g. "co.uk", "blogspot.com").
 */
export function sourceHost(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (d === "" || /[\s/:@?#[\]]/.test(d)) return null;
  let host: string;
  try {
    host = new URL(`https://${d}/`).hostname;
  } catch {
    return null;
  }
  // An ASCII domain must survive parsing unchanged (catches "\", "%", odd forms).
  if (/^[\x21-\x7e]+$/.test(d) && host !== d) return null;
  if (registrableDomain(host) === null) return null;
  return host;
}

/**
 * A page is in scope when its host EQUALS the approved source host or is a
 * SUBDOMAIN of it. Approving "example.com" covers "www.example.com";
 * approving "forum.example.com" does NOT cover "example.com" or
 * "shop.example.com". Applied to every page hop, including redirects.
 */
export function inScope(url: URL, scopeHost: string): boolean {
  const h = url.hostname.replace(/\.$/, "");
  return h === scopeHost || h.endsWith(`.${scopeHost}`);
}
