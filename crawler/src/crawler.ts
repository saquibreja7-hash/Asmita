/**
 * One crawl run: load sources and pool, crawl every source within budgets,
 * hash images in memory, match, post findings, return a summary.
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
import type { Finding, FindingResult, Pool, Source } from "./asmita/client.ts";
import { extract } from "./crawl/extract.ts";
import { HostScheduler, Semaphore } from "./crawl/limits.ts";
import { ROBOTS_MAX_BYTES, RobotsCache } from "./crawl/robots.ts";
import { inScope, normalizeUrl, sourceHost, urlKey } from "./crawl/url.ts";
import type { ImageDecoder } from "./image/decoder-pool.ts";
import type { FetchOptions, FetchResult, SafeFetcher } from "./net/safe-fetch.ts";
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
  /** Seed URL for a source. Production: https://<domain>/. Tests inject http + port. */
  seedUrl?: (source: Source) => string;
  now?: () => number;
  runId?: string;
  /** Overrides POOL_RESYNC_MINUTES (tests only need sub-minute intervals). */
  poolResyncMs?: number;
};

type SourceCtx = {
  source: Source;
  /** Approved host; pages must equal it or be a subdomain (inScope). */
  scopeHost: string;
  /** Distinct off-scope hosts images were fetched from, for the per-source cap. */
  offHosts: Set<string>;
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

  // --- per image ------------------------------------------------------------
  /**
   * Fetch, hash and match one image candidate. Only called with candidates
   * extracted from an in-scope page (crawlSource), never with URLs found any
   * other way. The image may live on another public host (sites serve images
   * from CDNs); every hop still passes the safe fetcher, and the number of
   * distinct off-scope hosts per source is capped (MAX_OFFSITE_IMAGE_HOSTS).
   */
  const processImage = async (img: URL, pageUrl: URL, ctx: SourceCtx): Promise<void> => {
    const { source, scopeHost, offHosts } = ctx;
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
    /** Runs on every hop before robots.txt or the request itself. */
    const admitHost = (u: URL) => {
      if (inScope(u, scopeHost)) return;
      touchedOffHost = true;
      if (offHosts.has(u.hostname)) return;
      if (offHosts.size >= config.MAX_OFFSITE_IMAGE_HOSTS) throw new CrawlError("image_host_cap");
      offHosts.add(u.hostname);
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
      if (err.code === "image_host_cap") {
        metrics.imageHostsCapped++;
        return metrics.skip("image_hosts_capped");
      }
      if (touchedOffHost) metrics.imagesOffHost++;
      record(err.code);
      return metrics.skip(err.code === "robots_disallowed" ? "robots" : "fetch_failed");
    }
    if (touchedOffHost) metrics.imagesOffHost++;
    // The image is reported at the address it was actually fetched from
    // (after redirects); mark that address seen too.
    const imageUrl = res.url.href;
    seenImages.add(urlKey(res.url));
    if (res.contentType !== "" && !res.contentType.startsWith("image/") && res.contentType !== "application/octet-stream") {
      record("content_type");
      return metrics.skip("content_type");
    }
    let hashed;
    try {
      // Decoding runs in an isolated child process (decoder-pool.ts) that
      // receives only these bytes and returns only { pdq, quality }. The pool
      // and matcher never leave this process. res.body is the only copy of
      // the bytes here and is dropped when this function returns.
      hashed = await deps.decoder.hash(res.body);
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
      return metrics.skip(reason);
    }
    metrics.imagesHashed++;
    if (hashed.quality < MIN_QUALITY) return metrics.skip("low_quality");
    const m = currentMatcher();
    if (!m) return metrics.skip("pool_stale");
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
  };

  // --- per source -----------------------------------------------------------
  const crawlSource = async (source: Source): Promise<void> => {
    const slog = log.child({ sourceId: source.id });
    // Pages are limited to this exact host and its subdomains (see inScope).
    const scopeHost = sourceHost(source.domain);
    const seed = scopeHost ? normalizeUrl(deps.seedUrl ? deps.seedUrl(source) : `https://${scopeHost}/`) : null;
    if (!scopeHost || !seed || !inScope(seed, scopeHost)) {
      metrics.sourcesInvalid++;
      slog.warn("source_invalid", { code: "invalid_url" });
      return;
    }
    metrics.sourcesCrawled++;
    const started = now();
    const queue: { url: URL; depth: number }[] = [{ url: seed, depth: 0 }];
    const seen = new Set<string>([urlKey(seed)]);
    const ctx: SourceCtx = { source, scopeHost, offHosts: new Set<string>() };
    let pages = 0;

    while (queue.length > 0 && pages < source.pageBudget && !stop.signal.aborted) {
      if (sink.disabled || sink.unauthorized) {
        if (sink.unauthorized) unauthorized = true;
        requestStop(sink.disabled ? "disabled" : "unauthorized");
        break;
      }
      if (metrics.pagesAttempted >= config.MAX_PAGES) {
        budgetHit = true;
        break;
      }
      const { url, depth } = queue.shift()!;
      pages++;
      metrics.pagesAttempted++;
      let page: FetchResult;
      try {
        page = await fetchWithRetry(url, {
          kind: "html",
          maxBytes: config.MAX_HTML_BYTES,
          accept: HTML_ACCEPT,
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
        continue;
      }
      if (!HTML_TYPES.has(page.contentType)) {
        metrics.pagesNonHtml++;
        continue;
      }
      if (!inScope(page.url, scopeHost)) {
        // Redirect hops are already checked in beforeHop; belt and braces.
        record("out_of_scope");
        continue;
      }
      metrics.pagesFetched++;
      const ex = extract(page.body.toString("utf8"), page.url, page.xRobotsTag, {
        maxLinks: config.MAX_LINKS_PER_PAGE,
        maxImages: config.MAX_IMAGES_PER_PAGE,
      });
      metrics.linksDropped += ex.dropped.links;
      metrics.skip("per_page_cap", ex.dropped.images);
      metrics.skip("data_uri", ex.skipped.data_uri);
      metrics.skip("svg", ex.skipped.svg);
      metrics.skip("tiny_declared", ex.skipped.tiny);
      metrics.skip("invalid_url", ex.skipped.invalid);
      if (depth < config.MAX_DEPTH) {
        for (const link of ex.links) {
          // Bounded frontier: never queue more pages than this source (and
          // the run) can still fetch. Every queued page is also the only way
          // into `seen`, so seen <= pageBudget + 1.
          const remaining = Math.min(source.pageBudget - pages, config.MAX_PAGES - metrics.pagesAttempted);
          if (queue.length >= remaining) {
            metrics.linksNotQueued++;
            continue;
          }
          if (seen.has(urlKey(link)) || !inScope(link, scopeHost)) continue;
          seen.add(urlKey(link));
          queue.push({ url: link, depth: depth + 1 });
        }
        metrics.queuePeak = Math.max(metrics.queuePeak, queue.length);
        metrics.seenPeak = Math.max(metrics.seenPeak, seen.size);
      }
      for (const img of ex.images) {
        if (stop.signal.aborted) break;
        // pageUrl is the page address as crawled (before any redirect).
        await processImage(img, url, ctx);
      }
    }
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
