/**
 * Process-level wiring: config, logger, signals, exit codes.
 *
 * Exit codes: 0 run finished (including "crawler switched off" and graceful
 * stops), 1 configuration error or unexpected failure, 2 the Asmita API
 * rejected the service key, 64 bad command line.
 *
 * Everything this process prints goes through the sanitising Logger,
 * including uncaught errors and Node warnings, so stdout/stderr never carry a
 * URL, hostname, fingerprint or message text.
 */
import { AsmitaClient } from "./asmita/client.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { runCrawl, type CrawlDeps } from "./crawler.ts";
import { toCrawlError } from "./errors.ts";
import { Logger, type LogSink } from "./log.ts";
import { productionPolicy, type NetPolicy } from "./net/policy.ts";
import { SafeFetcher } from "./net/safe-fetch.ts";

export type MainOptions = {
  argv: string[];
  env: Record<string, string | undefined>;
  sink?: LogSink;
  /** Production passes nothing; only tests inject a loopback-capable policy. */
  policy?: NetPolicy;
  seedUrl?: CrawlDeps["seedUrl"];
  /** Process signals are wired when true (the real binary). */
  handleSignals?: boolean;
  stopSignal?: AbortSignal;
};

export async function runMain(opts: MainOptions): Promise<number> {
  const bootLog = new Logger({ sink: opts.sink });
  const command = opts.argv[0];
  if (command !== "run") {
    bootLog.error("usage", { reason: "expected_command_run", exitCode: 64 });
    return 64;
  }

  let config;
  try {
    config = loadConfig(opts.env);
  } catch (err) {
    const keys = err instanceof ConfigError ? Object.fromEntries(err.keys.map((k) => [k, 1])) : {};
    bootLog.error("config_invalid", { invalidKeys: keys, exitCode: 1 });
    return 1;
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

  try {
    await runCrawl({ config, api, fetcher, log, stopSignal: stop.signal, seedUrl: opts.seedUrl });
    return 0;
  } catch (raw) {
    const err = toCrawlError(raw);
    const exitCode = err.code === "api_unauthorized" ? 2 : 1;
    log.error("run_failed", { code: err.code, exitCode });
    return exitCode;
  } finally {
    cleanupSignals();
    await Promise.all([fetcher.close(), api.close()]);
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
