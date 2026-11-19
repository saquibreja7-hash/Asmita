/**
 * The page-URL key shared by the app and the crawler (crawler v3 WP10).
 *
 * One page, one key: `http`/`https`, `www.`/bare host, a trailing slash on
 * non-root paths and a final `/index.html`/`/index.htm`/`/index.php` are the
 * same page, so the frontier stores and the crawler reports it once. This
 * module is dependency-free on purpose: the crawler imports it read-only
 * (like asmita/src/lib/pdq/pdq.ts, inlined at build) and the app's
 * `crawlPageKey` (crawl-pages.ts) delegates to it, so both sides compute the
 * key by running the same code. The crawler's `tests/unit/page-key-contract.test.ts`
 * and the app's frontier tests fail if the two drift apart.
 *
 * A key is only ever a dedup identity. It is never an address that is
 * fetched, reported, stored or logged: the query string survives exactly as
 * the site wrote it except that tracking parameters are dropped and the rest
 * sorted (the rule both sides already shared), so signed or order-sensitive
 * URLs keep working as addresses.
 *
 * Rows stored before this rule keep their stored digest (the digest is
 * computed once, at insert); they are not re-digested, and duplicates
 * between an old row and a new link are accepted until the old row ages out.
 */

/** Query parameters stripped everywhere (tracking noise, never content). */
export const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;

/** A final directory-index document (`/foo/index.html` names `/foo/`). */
const INDEX_DOC = /\/index\.(?:html|htm|php)\/?$/i;

/**
 * The canonical host: one leading `www.` label dropped (`www.example.com` ->
 * `example.com`). Only that: `www.www.example.com` -> `www.example.com`, and
 * every other label is kept. Merging `www.` and bare host is safe here
 * because both sides apply the scope check first: an address outside the
 * source's host (or subdomains) is refused before its key is ever computed.
 */
export function canonicalHostname(hostname: string): string {
  return hostname.replace(/^www\./i, "");
}

/**
 * The canonical path: a final `/index.html`, `/index.htm` or `/index.php`
 * names its directory (`/foo/index.html` -> `/foo`, `/index.html` -> `/`),
 * and a trailing slash on a non-root path is dropped (`/foo/` -> `/foo`).
 * The root path stays `/`.
 */
export function canonicalPathname(pathname: string): string {
  // An index document names the directory it sits in.
  let path = INDEX_DOC.test(pathname) ? pathname.replace(INDEX_DOC, "/") : pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/**
 * The tracking-stripped, sorted query of a URL: the varying part of the key.
 * The URL's own query string is never touched.
 */
export function queryKey(search: string): string {
  if (!search) return "";
  const params = [...new URLSearchParams(search).entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  return new URLSearchParams(params).toString();
}

/**
 * The canonical form of a parsed page URL: `https`, one leading `www.`
 * dropped, directory-index and non-root trailing slash dropped. The query
 * string and any port are kept as written (a non-default port is a
 * different server, so `https://h:8443/x` stays distinct from `https://h/x`).
 * Returns null for anything that is not http(s).
 */
export function pageKeyOf(url: URL): string | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const copy = new URL(url.href);
  copy.protocol = "https:";
  copy.hash = "";
  copy.hostname = canonicalHostname(copy.hostname);
  copy.pathname = canonicalPathname(copy.pathname);
  if (copy.pathname === "") copy.pathname = "/";
  copy.search = queryKey(copy.search);
  return copy.toString();
}

/**
 * The page key of a raw URL string, or null when it does not parse or is
 * not http(s). This is what the app digests (`crawlPageDigest`) and what
 * the crawler's `urlKey` computes for a URL it already parsed.
 */
export function pageKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  return pageKeyOf(url);
}
