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
 * computed once, at insert); they are not re-digested. Their digest is of
 * the LEGACY key (`legacyPageKey`: the URL as written, fragment dropped,
 * tracking parameters stripped and the rest sorted — no scheme, host, slash
 * or index folding). So that a link spelled differently from such a row does
 * not insert a duplicate live row after the deploy (review fix), the app
 * checks at insert time both the new key's digest and the legacy digest of
 * every spelling that shares the new key (`legacyPageKeys`: http/https,
 * www./bare, the path with and without a trailing slash or a final index
 * document) and skips the insert when a row exists under any of them. No
 * backfill is needed: old rows age out with the 30-day retention.
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

/**
 * The page key as both sides computed it before crawler v3 WP10 (the
 * digest of every frontier row stored before the deploy): the URL as
 * written, fragment dropped, empty path "/", tracking parameters stripped
 * and the rest sorted. Null for anything that does not parse or is not
 * http(s).
 */
export function legacyPageKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  if (url.pathname === "") url.pathname = "/";
  if (url.search) url.search = queryKey(url.search);
  return url.toString();
}

/** The directory-index documents the WP10 key folds into their directory. */
const INDEX_DOCS = ["index.html", "index.htm", "index.php"] as const;

/**
 * The legacy keys (`legacyPageKey`) of every spelling that shares this
 * URL's WP10 page key: http and https, the bare and the `www.` host, and
 * the canonical path bare, with a trailing slash (non-root) and with each
 * final index document. At most 2 x 2 x 5 = 20 keys, deduplicated; empty
 * for anything that is not http(s). The query is kept as written (the
 * legacy key sorts and strips it itself) and so is any port.
 */
export function legacyPageKeys(rawUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return [];
  const host = canonicalHostname(url.hostname);
  const path = canonicalPathname(url.pathname === "" ? "/" : url.pathname);
  const dir = path === "/" ? "/" : `${path}/`;
  const paths = path === "/" ? ["/", ...INDEX_DOCS.map((d) => `/${d}`)] : [path, dir, ...INDEX_DOCS.map((d) => `${dir}${d}`)];
  const out = new Set<string>();
  for (const protocol of ["http:", "https:"]) {
    for (const hostname of [host, `www.${host}`]) {
      for (const pathname of paths) {
        const copy = new URL(url.href);
        copy.protocol = protocol;
        copy.hostname = hostname;
        copy.pathname = pathname;
        const key = legacyPageKey(copy.toString());
        if (key !== null) out.add(key);
      }
    }
  }
  return [...out];
}
