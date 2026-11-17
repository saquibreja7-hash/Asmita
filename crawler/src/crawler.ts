/**
 * One crawl run: load sources and pool, claim page batches from the app's
 * frontier per source (crawler v2 WP3), fetch each page — with
 * If-None-Match / If-Modified-Since when the app has validators — hash
 * image candidates in memory, match, post findings, report each batch's
 * outcomes and links back to the app, and return a summary.
 *
 * The crawler keeps no frontier of its own: the queue, the seen set and the
 * scheduling live in the app (CrawlPage rows). The only page state here is
 * the claimed batch (at most FRONTIER_CLAIM_LIMIT entries) and the report
 * built from it, so a second run resumes where the last one stopped, and a
 * killed run loses at most its claimed batch, which the app hands out again
 * after the 30-minute claim window.
 *
 * Stopping: `stop` (SIGTERM/SIGINT, wall-clock limit, crawler switched off,
 * stale pool) means "start no new work". In-flight requests and decodes are
 * allowed to finish for up to shutdownGraceMs, after which they are aborted.
 * Findings are then flushed and the summary returned.
 */
import { randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import { userAgentToken } from "./config.ts";
import { CrawlError, toCrawlError, type ErrorCode } from "./errors.ts";
import { FindingsSink } from "./findings.ts";
import type { Logger } from "./log.ts";
import { MIN_QUALITY, Matcher } from "./match/matcher.ts";
import { RunMetrics, type SkipReason } from "./metrics.ts";
import type { ClaimedPage, Finding, FindingResult, Pool, ReportedPage, Source } from "./asmita/client.ts";
import { extract } from "./crawl/extract.ts";
import { HostScheduler, Semaphore } from "./crawl/limits.ts";
import { ROBOTS_MAX_BYTES, RobotsCache } from "./crawl/robots.ts";
import { inScope, normalizeUrl, sourceHost, urlKey } from "./crawl/url.ts";
import { BrowserRenderer, type BrowserImage } from "./browser/browser-renderer.ts";
import type { ImageDecoder } from "./image/decoder-pool.ts";
import type { FetchOptions, FetchResult, SafeFetcher } from "./net/safe-fetch.ts";
import { checkUrl, type NetPolicy } from "./net/policy.ts";
import { exitCodeFor } from "./exit-codes.ts";
import { withRetry } from "./retry.ts";

/** Pool older than this is never matched against (withdrawn ids must stop matching). */
export const POOL_MAX_AGE_MS = 60 * 60 * 1000;
/** Queued findings are posted at least this often. */
export const FLUSH_INTERVAL_MS = 15_000;

export type AsmitaApi = {
  getPool(signal?: AbortSignal): Promise<Pool>;
  getSources(signal?: AbortSignal): Promise<Source[]>;
  postFindings(runId: string, findings: Finding[], signal?: AbortSignal): Promise<FindingResult[]>;
  /** The app-backed frontier (WP3). */
  claimFrontier(sourceId: string, limit: number, signal?: AbortSignal): Promise<ClaimedPage[]>;
  reportFrontier(sourceId: string, runId: string, pages: ReportedPage[], signal?: AbortSignal): Promise<number>;
};

export type CrawlDeps = {
  config: Config;
  api: AsmitaApi;
  fetcher: Pick<SafeFetcher, "fetch">;
  /** Isolated image decoder (child processes). The caller owns its lifecycle. */
  decoder: Pick<ImageDecoder, "hash" | "stats">;
  log: Logger;
  /** External stop request (signals). */
  stopSignal?: AbortSignal;
  now?: () => number;
  runId?: string;
  /** Overrides POOL_RESYNC_MINUTES (tests only need sub-minute intervals). */
  poolResyncMs?: number;
  /**
   * The network policy, shared with safe-fetch. Needed only for browser
   * rendering (WP7), whose in-process proxy applies the same address rules;
   * without it a source that needs a browser fails its renders (fail closed:
   * no render is ever done outside the policy-checked proxy).
   */
  policy?: NetPolicy;
  /** Where Playwright's Chromium is installed (WP7); default is ~/.cache/ms-playwright. */
  browsersPath?: string;
};

type SourceCtx = {
  source: Source;
  /** Approved host; pages must equal it or be a subdomain (inScope). */
  scopeHost: string;
  /**
   * Distinct off-scope hosts that have returned an image, for the per-source
   * cap (MAX_OFFSITE_IMAGE_HOSTS). A host counts only once it has answered
   * with an image, so hosts that fail cannot use up the cap.
   */
  offHosts: Set<string>;
  /**
   * Distinct off-scope hosts tried that have not (yet) returned an image,
   * capped at MAX_OFFSITE_HOST_FAILURES so junk hosts cannot cause unbounded
   * requests either. A host leaves this set when it later returns an image.
   */
  failedOffHosts: Set<string>;
};

export type RunOutcome = "completed" | "disabled" | "stopped" | "time_limit" | "pool_stale" | "budget" | "unauthorized";

export type RunResult = {
  runId: string;
  outcome: RunOutcome;
  /** Process exit code for this run (see src/exit-codes.ts). */
  exitCode: number;
  summary: ReturnType<RunMetrics["summary"]> & { exitCode: number; problems: Record<string, number> };
};

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const IMAGE_ACCEPT = "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1";
const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1";

export async function runCrawl(deps: CrawlDeps): Promise<RunResult> {
  const { config, api, fetcher } = deps;
  const now = deps.now ?? Date.now;
  const runId = deps.runId ?? randomUUID();
  const log = deps.log.child({ runId });
  const metrics = new RunMetrics(now());
  let outcome: RunOutcome = "completed";
  /** Set when the API rejected the key after the initial load. */
  let unauthorized = false;

  // stop = no new work; hard = abort in-flight (after the grace period).
  const stop = new AbortController();
  const hard = new AbortController();
  // Assigned once the run is loaded; a stop flushes it straight away so
  // findings reach Asmita inside the shutdown window.
  const sinkRef: { current?: FindingsSink } = {};
  const requestStop = (why: RunOutcome) => {
    if (stop.signal.aborted) return;
    outcome = why;
    log.info("run_stopping", { reason: why });
    stop.abort();
    void sinkRef.current?.flush(true, AbortSignal.timeout(config.SHUTDOWN_GRACE_MS + 3_000));
    const t = setTimeout(() => hard.abort(), config.SHUTDOWN_GRACE_MS);
    t.unref();
  };
  const onExternalStop = () => requestStop("stopped");
  if (deps.stopSignal?.aborted) onExternalStop();
  deps.stopSignal?.addEventListener("abort", onExternalStop, { once: true });
  const wallClock = setTimeout(() => requestStop("time_limit"), config.MAX_RUN_MINUTES * 60_000);
  wallClock.unref();

  const summarize = (): RunResult => {
    const base = metrics.summary({
      now: now(),
      budgetPages: config.MAX_PAGES,
      budgetImages: config.MAX_IMAGES,
      outcome,
    });
    const problems = {
      unauthorized,
      contractErrors: metrics.findingsFailed,
      scopeErrors: metrics.rejectedByReason.page_not_in_source ?? 0,
      findingsUnsent: metrics.findingsUnsent,
      poolStale: outcome === "pool_stale",
      disabled: outcome === "disabled",
    };
    const exitCode = exitCodeFor(problems);
    const summary = {
      ...base,
      decoder: { ...deps.decoder.stats },
      exitCode,
      problems: {
        unauthorized: Number(problems.unauthorized),
        contractErrors: problems.contractErrors,
        scopeErrors: problems.scopeErrors,
        findingsUnsent: problems.findingsUnsent,
        poolStale: Number(problems.poolStale),
      },
    };
    log.info("run_summary", { summary: summary as never });
    return { runId, outcome, exitCode, summary };
  };

  log.info("run_start", {});

  // --- initial load -------------------------------------------------------
  let sources: Source[];
  let pool: Pool;
  try {
    sources = await api.getSources(hard.signal);
    pool = await api.getPool(hard.signal);
  } catch (raw) {
    const err = toCrawlError(raw);
    metrics.error(err.code);
    cleanup();
    if (err.code === "api_disabled") {
      outcome = "disabled";
      log.info("crawler_disabled", { phase: "load" });
      return summarize();
    }
    log.error("load_failed", { code: err.code });
    throw err;
  }

  let matcher = new Matcher(pool.fingerprints, pool.threshold);
  let poolSyncedAt = now();
  metrics.poolSyncs++;
  log.info("pool_loaded", { poolSize: matcher.size, count: sources.length });

  // Fingerprints the server stopped accepting during this run stay excluded
  // even if a later pool re-sync still lists them.
  const withdrawnIds = new Set<string>();
  const sink = new FindingsSink(runId, (r, f, s) => api.postFindings(r, f, s), metrics, log, (id) => {
    withdrawnIds.add(id);
    matcher.withdraw(id);
    log.info("fingerprint_withdrawn", { poolSize: matcher.size });
  });
  sinkRef.current = sink;
  // Post whatever is queued every FLUSH_INTERVAL_MS, not only when 50 have
  // accumulated: a typical run has few matches, and a crash must not lose them.
  const flushTimer = setInterval(() => void sink.flush(true, AbortSignal.timeout(config.API_TIMEOUT_MS * 2)), FLUSH_INTERVAL_MS);
  flushTimer.unref();

  // --- pool re-sync ---------------------------------------------------------
  let resyncing = false;
  const resync = async () => {
    if (resyncing || stop.signal.aborted) return;
    resyncing = true;
    try {
      const next = await api.getPool(hard.signal);
      const fresh = new Matcher(next.fingerprints, next.threshold);
      for (const id of withdrawnIds) fresh.withdraw(id);
      const dropped = [...matcher.idSetView()].filter((id) => !fresh.has(id)).length;
      matcher = fresh;
      poolSyncedAt = now();
      metrics.poolSyncs++;
      sink.purge((id) => fresh.has(id));
      log.info("pool_resynced", { poolSize: fresh.size, dropped });
    } catch (raw) {
      const err = toCrawlError(raw);
      metrics.poolSyncFailures++;
      metrics.error(err.code);
      log.warn("pool_resync_failed", { code: err.code });
      if (err.code === "api_disabled") requestStop("disabled");
      else if (err.code === "api_unauthorized") {
        unauthorized = true;
        requestStop("unauthorized");
      }
    } finally {
      resyncing = false;
    }
  };
  const resyncTimer = setInterval(() => void resync(), deps.poolResyncMs ?? config.POOL_RESYNC_MINUTES * 60_000);
  resyncTimer.unref();

  /** The matcher, or null once the pool is too old to trust. */
  const currentMatcher = (): Matcher | null => {
    if (now() - poolSyncedAt > POOL_MAX_AGE_MS) {
      requestStop("pool_stale");
      return null;
    }
    return matcher;
  };

  // --- shared crawl state -------------------------------------------------
  const globalGate = new Semaphore(config.GLOBAL_CONCURRENCY);
  const hosts = new HostScheduler(now);
  const seenImages = new Set<string>();
  const reported = new Set<string>();
  let budgetHit = false;
  const gate = <T>(fn: () => Promise<T>) => globalGate.use(fn);

  const robots = new RobotsCache(
    (url) =>
      fetcher.fetch(url, {
        kind: "robots",
        maxBytes: ROBOTS_MAX_BYTES,
        accept: "text/plain,*/*;q=0.1",
        signal: hard.signal,
        gate,
        beforeHop: (u) => hosts.wait(u.host, config.OFFSITE_HOST_DELAY_MS, hard.signal),
      }),
    userAgentToken(config.CRAWLER_USER_AGENT),
    (o) => {
      metrics.robots[o] = (metrics.robots[o] ?? 0) + 1;
    },
  );

  const politeHop =
    (delayMs: number, extra?: (u: URL) => void): NonNullable<FetchOptions["beforeHop"]> =>
    async (u) => {
      extra?.(u);
      const rules = await robots.rulesFor(u);
      if (!rules.isAllowed(u)) throw new CrawlError("robots_disallowed");
      const delay = Math.max(delayMs, Math.min(rules.crawlDelayMs ?? 0, config.MAX_CRAWL_DELAY_MS));
      await hosts.wait(u.host, delay, hard.signal);
    };

  const fetchWithRetry = (url: URL, opts: FetchOptions): Promise<FetchResult> =>
    withRetry(() => fetcher.fetch(url, opts), {
      attempts: config.FETCH_ATTEMPTS,
      baseDelayMs: 500,
      maxDelayMs: 30_000,
      signal: hard.signal,
      onRetry: (err) => {
        if (err.code === "http_status" && (err.status === 429 || err.status === 503)) {
          hosts.penalize(url.host, Math.min(err.retryAfterMs ?? 5_000, 60_000));
        }
      },
    });

  const record = (code: ErrorCode) => metrics.error(code);

  // --- browser rendering (WP7) ------------------------------------------------
  /**
   * Renders pages that need Chromium: sources with render = BROWSER, or
   * AUTO pages whose HTML has scripts and no image candidates. One worker
   * child process, one page at a time; its traffic goes through the
   * in-process proxy built from the same policy safe-fetch uses. Without a
   * policy no renderer exists and every render fails closed.
   */
  const crawlPolicy = deps.policy;
  const browser = crawlPolicy
    ? new BrowserRenderer({
        policy: crawlPolicy,
        browsersPath: deps.browsersPath,
        log,
        metrics,
        config: {
          userAgent: config.CRAWLER_USER_AGENT,
          tmpDir: config.BROWSER_TMP_DIR,
          pageTimeoutMs: config.BROWSER_PAGE_TIMEOUT_MS,
          scrolls: config.BROWSER_SCROLLS,
          scrollWaitMs: config.BROWSER_SCROLL_WAIT_MS,
          maxRequests: config.BROWSER_MAX_REQUESTS_PER_PAGE,
          maxPageBytes: config.BROWSER_MAX_PAGE_BYTES,
          maxImages: config.MAX_IMAGES_PER_PAGE,
          maxImageBytes: config.MAX_IMAGE_BYTES,
          maxHtmlBytes: config.MAX_HTML_BYTES,
          connectTimeoutMs: config.CONNECT_TIMEOUT_MS,
        },
        // The parent owns robots.txt; every request the page wants to make
        // waits for this verdict before it may leave the browser. A URL the
        // network policy itself would refuse (blocked scheme, port or
        // literal address) is denied without a robots.txt fetch.
        checkRequest: async (u) => {
          try {
            checkUrl(u, crawlPolicy);
            return (await robots.rulesFor(u)).isAllowed(u);
          } catch {
            return false;
          }
        },
      })
    : null;

  /**
   * The shared tail of both image paths: decode in the isolated child
   * process, match, and queue a finding for every pool hit. `imageUrl` is
   * the address after redirects; `pageUrl` is the page as claimed.
   */
  const decodeMatchReport = async (bytes: Buffer, imageUrl: string, pageUrl: URL, source: Source): Promise<boolean> => {
    let hashed;
    try {
      // Decoding runs in an isolated child process (decoder-pool.ts) that
      // receives only these bytes and returns only { pdq, quality }. The
      // pool and matcher never leave this process. The buffer passed in is
      // the only copy of the bytes here and is dropped when this returns.
      hashed = await deps.decoder.hash(bytes);
    } catch (raw) {
      const err = toCrawlError(raw);
      record(err.code);
      const reason: SkipReason =
        err.code === "image_sniff_failed"
          ? "not_image"
          : err.code === "image_too_small"
            ? "too_small"
            : err.code === "image_too_many_pixels"
              ? "too_many_pixels"
              : err.code === "image_format"
                ? "format"
                : err.code === "image_truncated"
                  ? "truncated"
                  : err.code === "image_decode_timeout"
                    ? "decoder_timeout"
                    : err.code === "image_decoder_crashed"
                      ? "decoder_crashed"
                      : "decode_failed";
      metrics.skip(reason);
      return false;
    }
    metrics.imagesHashed++;
    if (hashed.quality < MIN_QUALITY) {
      metrics.skip("low_quality");
      return false;
    }
    const m = currentMatcher();
    if (!m) {
      metrics.skip("pool_stale");
      return false;
    }
    const observedAt = new Date(now()).toISOString();
    for (const hit of m.match(hashed.pdq)) {
      const key = `${hit.fingerprintId}\n${imageUrl}`;
      if (reported.has(key)) continue;
      reported.add(key);
      metrics.matches++;
      sink.add({
        fingerprintId: hit.fingerprintId,
        pageUrl: pageUrl.href,
        imageUrl,
        distance: hit.distance,
        quality: hashed.quality,
        observedAt,
        sourceId: source.id,
      });
    }
    return true;
  };

  /**
   * One image taken from an intercepted browser response, in memory, already
   * size-capped by the worker (re-checked by the renderer). The browser has
   * already fetched it through the policy proxy; robots and the off-site
   * host caps decide whether it is processed, and the bytes go through the
   * same decoder path as every other image.
   */
  const processBrowserImage = async (img: BrowserImage, pageUrl: URL, ctx: SourceCtx): Promise<boolean> => {
    const { source, scopeHost, offHosts, failedOffHosts } = ctx;
    if (!inScope(pageUrl, scopeHost)) {
      record("out_of_scope");
      return true;
    }
    if (seenImages.has(urlKey(img.url))) {
      metrics.skip("duplicate_url");
      return true;
    }
    if (metrics.imagesSeen >= config.MAX_IMAGES) {
      budgetHit = true;
      metrics.skip("budget");
      return false;
    }
    let allowed: boolean;
    try {
      allowed = (await robots.rulesFor(img.url)).isAllowed(img.url);
    } catch {
      allowed = false;
    }
    if (!allowed) {
      record("robots_disallowed");
      metrics.skip("robots");
      return true;
    }
    if (!img.contentType.startsWith("image/")) {
      record("content_type");
      metrics.skip("content_type");
      return true;
    }
    const host = img.url.hostname;
    const offScope = !inScope(img.url, scopeHost);
    if (offScope) {
      if (!offHosts.has(host)) {
        if (offHosts.size >= config.MAX_OFFSITE_IMAGE_HOSTS) {
          metrics.imageHostsCapped++;
          metrics.skip("image_hosts_capped");
          return true;
        }
        if (!failedOffHosts.has(host) && failedOffHosts.size >= config.MAX_OFFSITE_HOST_FAILURES) {
          metrics.imageHostFailuresCapped++;
          metrics.skip("image_host_failures_capped");
          return true;
        }
      }
    }
    seenImages.add(urlKey(img.url));
    metrics.imagesSeen++;
    if (offScope) metrics.imagesOffHost++;
    const ok = await decodeMatchReport(img.bytes, img.url.href, pageUrl, source);
    if (offScope) {
      if (ok) {
        failedOffHosts.delete(host);
        offHosts.add(host);
      } else if (!offHosts.has(host)) {
        failedOffHosts.add(host);
      }
    }
    return true;
  };

  // --- per image ------------------------------------------------------------
  /**
   * Fetch, hash and match one image candidate. Only called with candidates
   * extracted from an in-scope page (crawlSource), never with URLs found any
   * other way. The image may live on another public host (sites serve images
   * from CDNs); every hop still passes the safe fetcher. Per source, distinct
   * off-scope hosts that returned an image are capped (MAX_OFFSITE_IMAGE_HOSTS)
   * and, separately, distinct off-scope hosts that did not
   * (MAX_OFFSITE_HOST_FAILURES). Images of one source are processed one at a
   * time (crawlSource awaits each), so these sets need no reservation.
   */
  const processImage = async (img: URL, pageUrl: URL, ctx: SourceCtx): Promise<void> => {
    const { source, scopeHost, offHosts, failedOffHosts } = ctx;
    if (!inScope(pageUrl, scopeHost)) {
      // Unreachable by construction; refuse rather than fetch on a bug.
      record("out_of_scope");
      return;
    }
    if (seenImages.has(urlKey(img))) return metrics.skip("duplicate_url");
    // Budget first, so seenImages only ever holds images we actually tried
    // (at most two keys each: as linked and after redirects).
    if (metrics.imagesSeen >= config.MAX_IMAGES) {
      budgetHit = true;
      return metrics.skip("budget");
    }
    seenImages.add(urlKey(img));
    metrics.imagesSeen++;
    const delay = inScope(img, scopeHost) ? source.delayMs : Math.max(source.delayMs, config.OFFSITE_HOST_DELAY_MS);
    let touchedOffHost = false;
    /** Off-scope hosts this image's fetch has tried that had not yet returned an image. */
    const tried = new Set<string>();
    /** Runs on every hop (and retry) before robots.txt or the request itself. */
    const admitHost = (u: URL) => {
      if (inScope(u, scopeHost)) return;
      touchedOffHost = true;
      const host = u.hostname;
      if (offHosts.has(host) || tried.has(host)) return;
      // No room for another image host even if this one succeeds.
      if (offHosts.size >= config.MAX_OFFSITE_IMAGE_HOSTS) throw new CrawlError("image_host_cap");
      // A host that already failed may be tried again (it adds no new host);
      // a new one only while the failed set has room.
      if (!failedOffHosts.has(host) && failedOffHosts.size >= config.MAX_OFFSITE_HOST_FAILURES) {
        throw new CrawlError("image_host_failures");
      }
      tried.add(host);
    };
    /** Every tried host that did not end up returning an image counts as failed. */
    const settleHosts = (imageHost: string | null) => {
      for (const host of tried) {
        if (host === imageHost) {
          failedOffHosts.delete(host);
          offHosts.add(host);
        } else if (!offHosts.has(host)) {
          failedOffHosts.add(host);
        }
      }
    };
    let res: FetchResult;
    try {
      res = await fetchWithRetry(img, {
        kind: "image",
        maxBytes: config.MAX_IMAGE_BYTES,
        accept: IMAGE_ACCEPT,
        signal: hard.signal,
        gate,
        beforeHop: politeHop(delay, admitHost),
      });
    } catch (raw) {
      const err = toCrawlError(raw);
      settleHosts(null);
      if (err.code === "image_host_cap") {
        metrics.imageHostsCapped++;
        return metrics.skip("image_hosts_capped");
      }
      if (err.code === "image_host_failures") {
        metrics.imageHostFailuresCapped++;
        return metrics.skip("image_host_failures_capped");
      }
      if (touchedOffHost) metrics.imagesOffHost++;
      record(err.code);
      return metrics.skip(err.code === "robots_disallowed" ? "robots" : "fetch_failed");
    }
    if (touchedOffHost) metrics.imagesOffHost++;
    // The image is reported at the address it was actually fetched from
    // (after redirects); mark that address seen too.
    seenImages.add(urlKey(res.url));
    if (res.contentType !== "" && !res.contentType.startsWith("image/") && res.contentType !== "application/octet-stream") {
      settleHosts(null);
      record("content_type");
      return metrics.skip("content_type");
    }
    // The host that served the image now counts against the cap.
    settleHosts(res.url.hostname);
    // The image is reported at the address it was actually fetched from
    // (after redirects); mark that address seen too (already done above) and
    // run the shared decode -> match -> report tail.
    await decodeMatchReport(res.body, res.url.href, pageUrl, source);
  };

  // --- per source -----------------------------------------------------------
  /**
   * Report body cap with headroom under the server's 256 KiB limit: a batch
   * of pages with many links each is split into several reports.
   */
  const MAX_REPORT_BODY_BYTES = 240 * 1024;
  const REPORT_ENVELOPE_BYTES = 128;
  /** The frontier contract caps a page's reported links at 500. */
  const MAX_REPORT_LINKS_PER_PAGE = 500;
  /** A page "has scripts" when its HTML carries a script tag (AUTO rule). */
  const HAS_SCRIPT = /<script[\s>]/i;

  /** Links for the frontier report, from whichever extraction is in force. */
  const collectLinks = (ex: ReturnType<typeof extract>, page: ClaimedPage, ctx: SourceCtx): ReportedPage["links"] => {
    const links: ReportedPage["links"] = [];
    if (page.depth < config.MAX_DEPTH) {
      // Per-page dedup only: cross-page dedup is the app's, on the digest.
      const seenOnPage = new Set<string>();
      for (const link of ex.links) {
        if (links.length >= Math.min(config.MAX_LINKS_PER_PAGE, MAX_REPORT_LINKS_PER_PAGE)) break;
        if (!inScope(link, ctx.scopeHost)) continue;
        const key = urlKey(link);
        if (seenOnPage.has(key)) continue;
        seenOnPage.add(key);
        links.push({ url: link.href, kind: "page" });
      }
    }
    return links;
  };

  /** Static-extraction skip counters, recorded only when its images are used. */
  const recordExtraction = (ex: ReturnType<typeof extract>): void => {
    metrics.linksDropped += ex.dropped.links;
    metrics.skip("per_page_cap", ex.dropped.images);
    metrics.skip("data_uri", ex.skipped.data_uri);
    metrics.skip("svg", ex.skipped.svg);
    metrics.skip("tiny_declared", ex.skipped.tiny);
    metrics.skip("invalid_url", ex.skipped.invalid);
  };

  /**
   * Render one page in the browser (WP7). The in-scope check ran on the
   * claimed URL and every redirect hop of the HTTP pre-fetch; the render
   * itself keeps documents in scope in the worker, and every request of the
   * page waits for the robots verdict. Intercepted image bytes are processed
   * as they arrive. Returns "dropped" when the run stopped mid-render (the
   * page entry is dropped so the row is redone whole), the rendered document
   * on success, or the failure code (the caller decides what that means for
   * BROWSER versus AUTO sources).
   */
  const renderPageInBrowser = async (
    page: ClaimedPage,
    url: URL,
    ctx: SourceCtx,
  ): Promise<"dropped" | { ok: true; html: string; url: URL; imagesSkipped: number } | { ok: false; code: ErrorCode }> => {
    if (!browser) return { ok: false, code: "browser_launch_failed" };
    // Politeness for the browser's own document request: the host slot the
    // HTTP pre-fetch used has moved on, so this waits out the source delay
    // (robots is already cached for this origin). Subresource bursts are
    // bounded by the per-page request cap and the page deadline instead.
    try {
      await politeHop(ctx.source.delayMs)(url, 0);
    } catch (raw) {
      return { ok: false, code: toCrawlError(raw).code };
    }
    const outcome = await browser.render(
      url,
      ctx.scopeHost,
      (img) => processBrowserImage(img, url, ctx),
      hard.signal,
    );
    if (outcome.ok) return { ok: true, html: outcome.html, url: outcome.url, imagesSkipped: outcome.imagesSkipped };
    if (outcome.code === "browser_aborted" && stop.signal.aborted) return "dropped";
    return { ok: false, code: outcome.code };
  };

  /**
   * Fetches one claimed page and builds its report entry. The in-scope check
   * runs on the claimed URL (the app's data, never trusted blindly) and on
   * every redirect hop (beforeHop). A 304 becomes "not_modified"; 404/410
   * "gone"; a robots block or a 401/403 answer "blocked"; anything else that
   * fails "error" (the app backs off and eventually marks the page dead).
   * Links are reported only under MAX_DEPTH, deduplicated per page, in scope.
   *
   * Pages that need a browser (render = BROWSER, or AUTO with scripts and no
   * image candidates) are then rendered in Chromium: their images are the
   * responses the browser intercepted, their links come from the rendered
   * DOM, and they are reported without validators (a render is never
   * conditional-GET-suppressed). An AUTO page whose render fails falls back
   * to its static result; a BROWSER page reports "error" instead.
   */
  const processPage = async (page: ClaimedPage, ctx: SourceCtx): Promise<ReportedPage | null> => {
    const { source, scopeHost } = ctx;
    const url = normalizeUrl(page.url);
    if (!url || !inScope(url, scopeHost)) {
      // The app handed us an address outside the approved host: never fetch
      // it; report an error so the row backs off instead of sticking.
      record("out_of_scope");
      metrics.pagesOutOfScope++;
      return { id: page.id, status: "error", links: [] };
    }
    const headers: Record<string, string> = {};
    if (page.etag) headers["if-none-match"] = page.etag;
    if (page.lastModified) headers["if-modified-since"] = page.lastModified;
    let result: FetchResult;
    try {
      result = await fetchWithRetry(url, {
        kind: "html",
        maxBytes: config.MAX_HTML_BYTES,
        accept: HTML_ACCEPT,
        headers,
        signal: hard.signal,
        gate,
        beforeHop: politeHop(source.delayMs, (u) => {
          // A redirect may not take a page fetch off the source's domain.
          if (!inScope(u, scopeHost)) throw new CrawlError("out_of_scope");
        }),
      });
    } catch (raw) {
      const err = toCrawlError(raw);
      record(err.code);
      if (err.code === "out_of_scope") metrics.pagesOutOfScope++;
      const status: ReportedPage["status"] =
        err.code === "http_status" && (err.status === 404 || err.status === 410)
          ? "gone"
          : err.code === "http_status" && (err.status === 401 || err.status === 403)
            ? "blocked"
            : err.code === "robots_disallowed"
              ? "blocked"
              : "error";
      return { id: page.id, status, links: [] };
    }
    const validators = {
      ...(result.etag !== null ? { etag: result.etag } : {}),
      ...(result.lastModified !== null ? { lastModified: result.lastModified } : {}),
    };
    if (result.status === 304) {
      metrics.pagesNotModified++;
      return { id: page.id, status: "not_modified", ...validators, links: [] };
    }
    if (!HTML_TYPES.has(result.contentType)) {
      metrics.pagesNonHtml++;
      return { id: page.id, status: "fetched", ...validators, links: [] };
    }
    if (!inScope(result.url, scopeHost)) {
      // Redirect hops are already checked in beforeHop; belt and braces.
      record("out_of_scope");
      metrics.pagesOutOfScope++;
      return { id: page.id, status: "error", links: [] };
    }
    metrics.pagesFetched++;
    const html = result.body.toString("utf8");
    const ex = extract(html, result.url, result.xRobotsTag, {
      maxLinks: config.MAX_LINKS_PER_PAGE,
      maxImages: config.MAX_IMAGES_PER_PAGE,
    });

    // Does this page need a browser? (WP7)
    const wantBrowser =
      source.render === "browser" ||
      (source.render === "auto" && ex.images.length === 0 && HAS_SCRIPT.test(html));
    if (wantBrowser) {
      const rendered = await renderPageInBrowser(page, url, ctx);
      if (rendered === "dropped") return null; // stopped mid-render: redo whole
      if (rendered.ok) {
        // Belt and braces on the final rendered URL.
        if (!inScope(rendered.url, scopeHost)) {
          record("out_of_scope");
          metrics.pagesOutOfScope++;
          return { id: page.id, status: "error", links: [] };
        }
        metrics.skip("browser", rendered.imagesSkipped);
        if (stop.signal.aborted) return null;
        const ex2 = extract(rendered.html, rendered.url, result.xRobotsTag, {
          maxLinks: config.MAX_LINKS_PER_PAGE,
          maxImages: config.MAX_IMAGES_PER_PAGE,
        });
        metrics.linksDropped += ex2.dropped.links;
        return { id: page.id, status: "fetched", links: collectLinks(ex2, page, ctx) };
      }
      record(rendered.code);
      if (source.render === "browser") return { id: page.id, status: "error", links: [] };
      // AUTO: the render was an enhancement; report the static result.
      if (stop.signal.aborted) return null;
      recordExtraction(ex);
      return { id: page.id, status: "fetched", ...validators, links: collectLinks(ex, page, ctx) };
    }

    // Static path: images from the HTML, links from the HTML.
    recordExtraction(ex);
    for (const img of ex.images) {
      if (stop.signal.aborted) break;
      // pageUrl is the page address as claimed (before any redirect).
      await processImage(img, url, ctx);
    }
    if (stop.signal.aborted) {
      // The run stopped mid-page (its remaining images were skipped): drop
      // the entry so the row stays claimed and is redone whole after the
      // 30-minute window. A killed run loses at most its claimed batch.
      return null;
    }
    return { id: page.id, status: "fetched", ...validators, links: collectLinks(ex, page, ctx) };
  };

  const crawlSource = async (source: Source): Promise<void> => {
    const slog = log.child({ sourceId: source.id });
    // Pages are limited to this exact host and its subdomains (see inScope).
    const scopeHost = sourceHost(source.domain);
    if (!scopeHost) {
      metrics.sourcesInvalid++;
      slog.warn("source_invalid", { code: "invalid_url" });
      return;
    }
    metrics.sourcesCrawled++;
    const started = now();
    const ctx: SourceCtx = { source, scopeHost, offHosts: new Set<string>(), failedOffHosts: new Set<string>() };
    let pages = 0;

    // Results are reported in body-bounded chunks, so a batch of link-heavy
    // pages never builds one oversized request.
    let pending: ReportedPage[] = [];
    let pendingBytes = REPORT_ENVELOPE_BYTES;
    let reportBroken = false;
    const flushReport = async () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      pendingBytes = REPORT_ENVELOPE_BYTES;
      try {
        const accepted = await api.reportFrontier(source.id, runId, batch, hard.signal);
        slog.info("frontier_reported", { count: batch.length, accepted });
      } catch (raw) {
        const err = toCrawlError(raw);
        record(err.code);
        if (err.code === "api_disabled") requestStop("disabled");
        else if (err.code === "api_unauthorized") {
          unauthorized = true;
          requestStop("unauthorized");
        }
        // The claimed pages stay claimed; they become due again on their own
        // after the 30-minute window, so nothing is lost by giving up here.
        slog.warn("frontier_report_failed", { code: err.code, count: batch.length });
        reportBroken = true;
      }
    };

    while (!stop.signal.aborted && !reportBroken) {
      if (sink.disabled || sink.unauthorized) {
        if (sink.unauthorized) unauthorized = true;
        requestStop(sink.disabled ? "disabled" : "unauthorized");
        break;
      }
      if (metrics.pagesAttempted >= config.MAX_PAGES) {
        budgetHit = true;
        break;
      }
      if (pages >= source.pageBudget) break; // the app enforces the same budget per day
      const limit = Math.max(
        1,
        Math.min(config.FRONTIER_CLAIM_LIMIT, source.pageBudget - pages, config.MAX_PAGES - metrics.pagesAttempted),
      );
      let batch: ClaimedPage[];
      try {
        batch = await api.claimFrontier(source.id, limit, hard.signal);
      } catch (raw) {
        const err = toCrawlError(raw);
        record(err.code);
        if (err.code === "api_disabled") requestStop("disabled");
        else if (err.code === "api_unauthorized") {
          unauthorized = true;
          requestStop("unauthorized");
        }
        slog.warn("frontier_claim_failed", { code: err.code });
        break;
      }
      if (batch.length === 0) break; // nothing due: the source is done for now
      metrics.batchPeak = Math.max(metrics.batchPeak, batch.length);
      for (const page of batch) {
        if (stop.signal.aborted || reportBroken) break;
        if (sink.disabled || sink.unauthorized) break;
        if (metrics.pagesAttempted >= config.MAX_PAGES) {
          budgetHit = true;
          break;
        }
        if (pages >= source.pageBudget) break;
        pages++;
        metrics.pagesAttempted++;
        const entry = await processPage(page, ctx);
        if (entry !== null) {
          const bytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
          if (pendingBytes + bytes > MAX_REPORT_BODY_BYTES) await flushReport();
          pending.push(entry);
          pendingBytes += bytes;
        }
      }
      await flushReport();
    }
    await flushReport();
    slog.info("source_done", { pages, durationMs: now() - started });
  };

  // Sources run in parallel up to the global cap; each source is sequential.
  const workers = Math.min(config.GLOBAL_CONCURRENCY, sources.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < sources.length && !stop.signal.aborted) {
        const source = sources[next++]!;
        try {
          await crawlSource(source);
        } catch (raw) {
          const err = toCrawlError(raw);
          record(err.code);
          log.error("source_failed", { sourceId: source.id, code: err.code });
        }
      }
    }),
  );

  if (budgetHit && outcome === "completed") outcome = "budget";
  clearInterval(resyncTimer);
  clearInterval(flushTimer);
  // The browser worker and its proxy are no longer needed; this also aborts
  // any render still pending (none should be: sources have all finished).
  await browser?.close();
  // Final flush deadline: short after a signal (the platform kills the
  // process soon after SIGTERM), longer for a normal end of run.
  const flushDeadline = AbortSignal.timeout((outcome as RunOutcome) === "stopped" ? 3_000 : config.API_TIMEOUT_MS * 2);
  await sink.flush(true, flushDeadline);
  sink.finish();
  cleanup();
  // The final flush may be what discovers a switch-off or a revoked key.
  if (sink.disabled) outcome = "disabled";
  if (sink.unauthorized) {
    unauthorized = true;
    outcome = "unauthorized";
  }
  return summarize();

  function cleanup() {
    clearTimeout(wallClock);
    deps.stopSignal?.removeEventListener("abort", onExternalStop);
  }
}
