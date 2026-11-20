/**
 * Process-level wiring: config, logger, signals, exit codes.
 *
 * `run` performs one crawl; `run --loop` (crawler v2 WP6) repeats it until
 * stopped: pass after pass across all enabled sources, sleeping
 * LOOP_IDLE_SECONDS whenever a pass finds nothing due, picking up sources
 * enabled in the app mid-flight on the next pass's GET /sources. SIGTERM
 * ends the current pass cleanly (exit 0); any non-zero run exit code ends
 * the loop with that code, so the restart policy of an always-on deployment
 * decides the retry cadence. Without --loop the one-shot behaviour is
 * unchanged.
 *
 * Exit codes: see src/exit-codes.ts (0 clean or switched off, 1 config or
 * unexpected failure, 2 key rejected, 3 findings undelivered, 4 contract
 * error, 5 pool stale, 64 bad command line).
 *
 * Everything this process prints goes through the sanitising Logger,
 * including uncaught errors and Node warnings, so stdout/stderr never carry a
 * URL, hostname, fingerprint or message text.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { AsmitaClient } from "./asmita/client.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { newQueryGuardStore, runCrawl } from "./crawler.ts";
import { toCrawlError } from "./errors.ts";
import { EXIT } from "./exit-codes.ts";
import { Logger, type LogSink } from "./log.ts";
import { productionPolicy, type NetPolicy } from "./net/policy.ts";
import { DecoderPool } from "./image/decoder-pool.ts";
import { SscdPool } from "./image/sscd-pool.ts";
import { SafeFetcher } from "./net/safe-fetch.ts";
import { takeSecrets } from "./secrets.ts";

export type MainOptions = {
  argv: string[];
  env: Record<string, string | undefined>;
  sink?: LogSink;
  /** Production passes nothing; only tests inject a loopback-capable policy. */
  policy?: NetPolicy;
  /**
   * Reads CRAWLER_SERVICE_KEY_FILE. Only main.ts passes one (src/ has no other
   * filesystem access); without it the key-file method is refused.
   */
  readFile?: (path: string) => string;
  /** Process signals are wired when true (the real binary). */
  handleSignals?: boolean;
  stopSignal?: AbortSignal;
};

export async function runMain(opts: MainOptions): Promise<number> {
  const bootLog = new Logger({ sink: opts.sink });
  const command = opts.argv[0];
  const loop = opts.argv.length === 2 && opts.argv[1] === "--loop";
  if (command !== "run" || opts.argv.length > 2 || (opts.argv.length === 2 && !loop)) {
    bootLog.error("usage", { reason: "expected_command_run", exitCode: EXIT.USAGE });
    return EXIT.USAGE;
  }

  let config;
  try {
    // Takes the key out of opts.env (the real environment in production) before any
    // decoder child can exist; see src/secrets.ts for what that does not do.
    config = loadConfig(takeSecrets(opts.env, opts.readFile));
  } catch (err) {
    const keys = err instanceof ConfigError ? Object.fromEntries(err.keys.map((k) => [k, 1])) : {};
    bootLog.error("config_invalid", { invalidKeys: keys, exitCode: EXIT.FAILURE });
    return EXIT.FAILURE;
  }
  const log = new Logger({ sink: opts.sink, level: config.LOG_LEVEL });

  const stop = new AbortController();
  if (opts.stopSignal) opts.stopSignal.addEventListener("abort", () => stop.abort(), { once: true });
  const cleanupSignals = opts.handleSignals ? installProcessHandlers(log, stop) : () => undefined;

  const fetcher = new SafeFetcher(opts.policy ?? productionPolicy(), {
    userAgent: config.CRAWLER_USER_AGENT,
    connectTimeoutMs: config.CONNECT_TIMEOUT_MS,
    headersTimeoutMs: config.HEADERS_TIMEOUT_MS,
    bodyTimeoutMs: config.BODY_TIMEOUT_MS,
    totalTimeoutMs: config.REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
  });
  const api = new AsmitaClient({
    baseUrl: config.ASMITA_API_URL,
    serviceKey: config.CRAWLER_SERVICE_KEY,
    userAgent: config.CRAWLER_USER_AGENT,
    timeoutMs: config.API_TIMEOUT_MS,
    attempts: config.API_ATTEMPTS,
    baseDelayMs: 500,
    maxDelayMs: 20_000,
  });

  // Image decoding runs in isolated child processes that never see the pool,
  // the service key or URLs (src/image/decoder-pool.ts).
  const decoder = new DecoderPool({
    size: config.DECODE_CONCURRENCY,
    taskTimeoutMs: config.DECODE_TIMEOUT_MS,
    minSide: config.MIN_IMAGE_SIDE,
  });
  // The SSCD embedder (WP28): a second isolated child, started only when
  // the second layer is switched on. A missing model file is not a config
  // error (the config validated the path exists syntactically); the child
  // reports sscd_model_missing per image and the run counts it, exactly
  // like a decoder that cannot load sharp.
  const sscd = config.ENABLE_SSCD
    ? new SscdPool({
        size: 1,
        taskTimeoutMs: config.SSCD_TIMEOUT_MS,
        minSide: config.MIN_IMAGE_SIDE,
        modelPath: config.SSCD_MODEL_FILE,
        expectedDim: config.SSCD_EMBED_DIM,
      })
    : undefined;

  try {
    // One store of query-variant guards for every pass of --loop, so a
    // query-string trap is not handed a fresh allowance each pass (bounded).
    const queryGuards = newQueryGuardStore(config);
    const crawl = () =>
      runCrawl({
        queryGuards,
        config,
        api,
        fetcher,
        decoder,
        // WP28: the isolated SSCD embedder, only when the layer is on.
        ...(sscd ? { sscd } : {}),
        log,
        stopSignal: stop.signal,
        // The same policy object safe-fetch uses; the browser proxy (WP7)
        // applies it to all browser traffic. Chromium's location is configured
        // by PLAYWRIGHT_BROWSERS_PATH when set.
        policy: opts.policy ?? productionPolicy(),
        browsersPath: opts.env.PLAYWRIGHT_BROWSERS_PATH,
      });
    if (!loop) {
      const result = await crawl();
      return result.exitCode;
    }
    // `run --loop` (WP6): keep claiming work across all enabled sources.
    for (;;) {
      const result = await crawl();
      // Exit 0 covers a clean pass, SIGTERM, the wall-clock limit, the
      // budgets and the crawler being switched off. Any other code is an
      // operator signal (src/exit-codes.ts): end the loop with it and let
      // the deployment's restart policy decide the retry.
      if (result.exitCode !== EXIT.OK) return result.exitCode;
      if (stop.signal.aborted) return EXIT.OK;
      // A pass that claimed nothing means nothing is due anywhere: sleep
      // before listing sources and claiming again. An interrupted sleep is
      // a SIGTERM: exit cleanly.
      if ((result.summary.pagesClaimed as number) === 0) {
        log.info("loop_idle", { durationMs: config.LOOP_IDLE_SECONDS * 1000 });
        try {
          await sleep(config.LOOP_IDLE_SECONDS * 1000, undefined, { signal: stop.signal });
        } catch {
          // aborted
        }
        if (stop.signal.aborted) return EXIT.OK;
      }
    }
  } catch (raw) {
    // Only the initial load throws (the run itself reports via exitCode).
    const err = toCrawlError(raw);
    const exitCode =
      err.code === "api_unauthorized" ? EXIT.UNAUTHORIZED : err.code === "api_bad_request" ? EXIT.CONTRACT_ERROR : EXIT.FAILURE;
    log.error("run_failed", { code: err.code, exitCode });
    return exitCode;
  } finally {
    cleanupSignals();
    await Promise.all([fetcher.close(), api.close(), decoder.close(), sscd?.close() ?? Promise.resolve()]);
  }
}

function installProcessHandlers(log: Logger, stop: AbortController): () => void {
  let signals = 0;
  const onSignal = (sig: NodeJS.Signals) => {
    signals++;
    log.info("signal", { reason: sig, count: signals });
    if (signals > 1) process.exit(130);
    stop.abort();
  };
  const onFatal = (err: unknown) => {
    log.error("fatal", { code: toCrawlError(err).code, exitCode: 1 });
    process.exit(1);
  };
  const onWarning = (w: Error) => log.warn("node_warning", { reason: w.name });
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  process.on("uncaughtException", onFatal);
  process.on("unhandledRejection", onFatal);
  // Replace Node's default warning printer (it prints free text to stderr).
  process.removeAllListeners("warning");
  process.on("warning", onWarning);
  return () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
  };
}
