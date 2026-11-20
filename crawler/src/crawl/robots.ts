/**
 * robots.txt, fetched once per origin per run and cached in memory.
 *
 * Failure handling (conservative by design):
 *   2xx                -> parse and obey (our User-Agent token, else "*").
 *   404 / 410 / other 4xx except 401, 403, 429
 *                      -> no robots.txt: everything allowed (RFC 9309 2.3.1.3).
 *   401 / 403          -> treated as "disallow all". RFC 9309 allows crawling
 *                         here, but a host that refuses us its robots.txt is
 *                         one we prefer not to crawl.
 *   429, 5xx, network error, timeout, too large, redirect loop
 *                      -> "disallow all" for the rest of this run
 *                        (RFC 9309 2.3.1.4 "unreachable" -> complete disallow).
 *   DNS name not found / TLS certificate failure (WP13)
 *                      -> rethrown: the host looks dead, so the fetch that
 *                         asked reports a permanent failure (`error` with the
 *                         permanent hint) instead of a robots block; no
 *                         request is ever made to it. NOT cached (review
 *                         fix): the next request to the origin asks again, so
 *                         one bad resolver answer cannot condemn every page
 *                         of the origin for the rest of the run.
 *   Body over the cap (500 KiB) -> disallow all.
 * The cache never outlives the process.
 */
import robotsParserModule from "robots-parser";
import { CrawlError, fetchFailureClass, toCrawlError } from "../errors.ts";
import type { FetchResult } from "../net/safe-fetch.ts";

type Robot = {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
};
// robots-parser is CommonJS (module.exports = fn); its typings misdescribe that
// under NodeNext, so pin the call signature we use.
const robotsParser = robotsParserModule as unknown as (url: string, text: string) => Robot;

export const ROBOTS_MAX_BYTES = 500 * 1024;

/** At most this many Sitemap: lines are taken from one robots.txt (WP4). */
export const ROBOTS_SITEMAP_CAP = 50;

export type RobotsRules = {
  isAllowed(url: URL): boolean;
  /** Crawl-delay in ms, if the file sets one for us. */
  crawlDelayMs: number | undefined;
  /**
   * Absolute URLs from the file's Sitemap: lines (WP4), raw as written;
   * the caller resolves and scope-checks them. Capped, never logged.
   */
  sitemaps: string[];
};

const DISALLOW_ALL: RobotsRules = { isAllowed: () => false, crawlDelayMs: undefined, sitemaps: [] };
const ALLOW_ALL: RobotsRules = { isAllowed: () => true, crawlDelayMs: undefined, sitemaps: [] };

export type RobotsFetch = (url: URL) => Promise<FetchResult>;

/** The Sitemap: lines of a robots.txt (RFC 9309), parsed independently of robots-parser. */
export function robotsSitemaps(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line);
    if (m === null) continue;
    out.push(m[1]!);
    if (out.length >= ROBOTS_SITEMAP_CAP) break;
  }
  return out;
}

export function parseRobots(robotsUrl: string, text: string, uaToken: string): RobotsRules {
  const robot = robotsParser(robotsUrl, text);
  return {
    isAllowed: (url) => robot.isAllowed(url.href, uaToken) !== false,
    crawlDelayMs: (() => {
      const d = robot.getCrawlDelay(uaToken);
      return typeof d === "number" && Number.isFinite(d) && d > 0 ? d * 1000 : undefined;
    })(),
    sitemaps: robotsSitemaps(text),
  };
}

export class RobotsCache {
  private readonly cache = new Map<string, Promise<RobotsRules>>();

  constructor(
    private readonly fetchRobots: RobotsFetch,
    /** Product token matched against User-agent lines, e.g. "AsmitaCrawler". */
    private readonly uaToken: string,
    private readonly onOutcome?: (outcome: "ok" | "absent" | "denied" | "unreachable") => void,
  ) {}

  rulesFor(url: URL): Promise<RobotsRules> {
    const origin = url.origin;
    let p = this.cache.get(origin);
    if (!p) {
      const loading = this.load(origin);
      p = loading;
      this.cache.set(origin, loading);
      // A permanent failure is rethrown by load(); drop it from the cache
      // once settled, so it is never served for the rest of the run.
      // Concurrent callers of the same load still share its one answer.
      loading.catch(() => {
        if (this.cache.get(origin) === loading) this.cache.delete(origin);
      });
    }
    return p;
  }

  async isAllowed(url: URL): Promise<boolean> {
    return (await this.rulesFor(url)).isAllowed(url);
  }

  private async load(origin: string): Promise<RobotsRules> {
    const robotsUrl = new URL("/robots.txt", origin);
    try {
      // Redirects are followed (max 5 hops), each hop re-validated by the
      // safe fetcher like any other request.
      const res = await this.fetchRobots(robotsUrl);
      this.onOutcome?.("ok");
      return parseRobots(robotsUrl.href, res.body.toString("utf8"), this.uaToken);
    } catch (raw) {
      const err = toCrawlError(raw);
      // WP13: a host whose name does not resolve or whose certificate fails
      // is dead, not "robots unreachable". The robots.txt fetch shares the
      // page's origin, so whatever killed it kills the page fetch too;
      // rethrow so the caller reports the permanent failure (the page goes
      // `error` with the permanent hint) instead of a robots block that
      // would be rechecked every 24 h forever.
      if (fetchFailureClass(err) === "permanent") throw err;
      if (err instanceof CrawlError && err.code === "http_status" && err.status !== undefined) {
        if (err.status === 401 || err.status === 403) {
          this.onOutcome?.("denied");
          return DISALLOW_ALL;
        }
        if (err.status >= 400 && err.status < 500 && err.status !== 429) {
          this.onOutcome?.("absent");
          return ALLOW_ALL;
        }
      }
      this.onOutcome?.("unreachable");
      return DISALLOW_ALL;
    }
  }
}
