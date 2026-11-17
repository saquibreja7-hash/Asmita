/**
 * Crawler-trap and non-content URL rules (crawler v2 WP4).
 *
 * Two protections that keep a deep crawl inside real content:
 *
 * 1. `isNonContentUrl`: links to login, cart, search-result and calendar
 *    addresses are never reported to the app, so they are never stored in
 *    the frontier and never fetched. An infinite calendar ("next day"
 *    forever) is stopped at the first link, whatever markup marks it as
 *    pagination. The patterns are deliberately narrow path SEGMENTS and
 *    query KEYS; nothing is inferred from a URL's file extensions.
 *
 * 2. `QueryVariantGuard`: a path that keeps arriving with ever-new query
 *    strings (session ids, view keys, offsets) is a trap even though every
 *    URL is distinct. Per source and run, at most `maxPerPath` distinct
 *    query variants of one path are reported (pagination links are exempted
 *    by the caller: a listing with ?page=1..N is real coverage, and depth
 *    and page budgets bound even a hostile "next" chain). The guard keeps
 *    only 16-byte hashes, never the URLs themselves, and its state is
 *    bounded (a killed run loses it; the app's per-source digest dedups any
 *    repeated report, so losing it is safe).
 */
import { createHash } from "node:crypto";
import { TRACKING_PARAM } from "./url.ts";

/**
 * Query parameters that carry a page NUMBER (not content): an ordered
 * sequence like ?page=1..N is pagination, not a trap, whether it arrives
 * with a rel=next marker or from a sitemap's bare <loc>. A variant keyed
 * on these alone is one variant, whatever the number.
 */
const PAGE_PARAM = /^(?:page|paged|pg|start|offset|from)$/i;

/** Path segments that mark login, cart, search and calendar endpoints. */
const NON_CONTENT_SEGMENTS = new Set([
  "login",
  "log-in",
  "log_in",
  "signin",
  "sign-in",
  "sign_in",
  "wp-login.php",
  "cart",
  "basket",
  "checkout",
  "search",
  "search-results",
  "find",
  "calendar",
  "calendars",
]);

/** Query keys that make any URL a search-result address. */
const SEARCH_QUERY_KEYS = new Set(["q", "query", "s", "search", "keyword", "keywords", "term", "terms"]);

/** Query keys that make any URL a calendar address (any value). */
const CALENDAR_QUERY_KEYS = new Set(["date", "day", "month", "year", "cal", "calendar"]);

/** ISO date as one path segment: /2026-11-17. */
const ISO_DATE_SEGMENT = /^\d{4}-\d{1,2}-\d{1,2}$/;
/** A 4-digit year path segment. */
const YEAR_SEGMENT = /^\d{4}$/;
/** A 1-2 digit month/day path segment. */
const MONTH_DAY_SEGMENT = /^\d{1,2}$/;
/** WordPress compact archive: ?m=YYYY[MM[DD]]. */
const WP_ARCHIVE_VALUE = /^\d{4}(?:\d{2}){0,2}$/;

const SEGMENT_SPLIT_MAX = 128; // a longer path is not inspectable segment-wise

/**
 * True when the URL is obvious non-content (login, cart, search result,
 * calendar or date archive) and must not be reported or fetched. Checked on
 * every link the crawler reports, pagination markers included.
 */
export function isNonContentUrl(url: URL): boolean {
  const segments = url.pathname.split("/").filter((s) => s !== "");
  for (let i = 0; i < segments.length && i < SEGMENT_SPLIT_MAX; i++) {
    const seg = segments[i]!.toLowerCase();
    if (NON_CONTENT_SEGMENTS.has(seg)) return true;
    // WordPress date archives: /2026/11, /2026/11/17, /2026/11/17/post.
    if (YEAR_SEGMENT.test(seg) && i + 1 < segments.length && MONTH_DAY_SEGMENT.test(segments[i + 1]!)) return true;
    if (ISO_DATE_SEGMENT.test(seg)) return true;
  }
  for (const [rawKey, value] of url.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    if (SEARCH_QUERY_KEYS.has(key)) return true;
    if (key === "add-to-cart" || key === "add_to_cart") return true;
    if (key === "m") {
      if (WP_ARCHIVE_VALUE.test(value)) return true;
      continue;
    }
    if (CALENDAR_QUERY_KEYS.has(key)) return true;
  }
  return false;
}

/** 16 hex chars of sha256: enough key space, never the URL itself. */
const hash16 = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Per-source, per-run cap on distinct query variants of one path. Bounded:
 * at most `maxPaths` paths are tracked, each with at most `maxPerPath`
 * 16-byte variant hashes; a page link whose path is not tracked yet, once
 * the map is full, is refused like an over-capped path.
 */
export class QueryVariantGuard {
  private readonly paths = new Map<string, Set<string>>();

  constructor(
    private readonly maxPerPath: number,
    private readonly maxPaths: number,
  ) {}

  /**
   * The variant of a URL: its query string with tracking parameters and the
   * page-number parameters removed and the rest sorted — dedup identity is
   * NOT this (urlKey keeps page numbers distinct); this is only the trap
   * signature, so ?page=2 and ?page=30 share one variant.
   */
  private static variantOf(url: URL): string {
    if (!url.search) return "";
    const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k) && !PAGE_PARAM.test(k));
    params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
    return new URLSearchParams(params).toString();
  }

  /**
   * May this URL be reported? A URL without a query (after tracking and
   * page-number parameters are stripped) is always admitted; the first
   * `maxPerPath` distinct variants of a path are admitted; further new
   * variants are refused. Seen variants stay admitted, so a re-claim of the
   * same page reports the same links again.
   */
  admit(url: URL): boolean {
    const variant = QueryVariantGuard.variantOf(url);
    if (variant === "") return true;
    const pathKey = hash16(`${url.host}\u0000${url.pathname}`);
    let variants = this.paths.get(pathKey);
    if (variants === undefined) {
      if (this.paths.size >= this.maxPaths) return false;
      variants = new Set<string>();
      this.paths.set(pathKey, variants);
    }
    const variantKey = hash16(variant);
    if (variants.has(variantKey)) return true;
    if (variants.size >= this.maxPerPath) return false;
    variants.add(variantKey);
    return true;
  }
}
