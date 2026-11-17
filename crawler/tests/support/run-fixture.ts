/** Wire a crawl against the fixture site and mock API (test policy injected in code). */
import { homedir } from "node:os";
import { join } from "node:path";
import { AsmitaClient } from "../../src/asmita/client.ts";
import { loadConfig } from "../../src/config.ts";
import { runCrawl, type RunResult } from "../../src/crawler.ts";
import { Logger } from "../../src/log.ts";
import { DecoderPool } from "../../src/image/decoder-pool.ts";
import { SafeFetcher } from "../../src/net/safe-fetch.ts";
import { fixtureEnv, FIXTURE_HOSTS, TEST_KEY, type FixtureSite } from "./fixture-site.ts";
import type { MockAsmita } from "./mock-asmita.ts";
import { loopbackTestPolicy } from "./test-policy.ts";

export async function runFixtureCrawl(
  site: FixtureSite,
  api: MockAsmita,
  opts: {
    env?: Record<string, string>;
    stopSignal?: AbortSignal;
    now?: () => number;
    lines?: string[];
    poolResyncMs?: number;
    hosts?: string[];
    /** Extra fake DNS entries for the test policy (e.g. metadata hostnames). */
    extraDns?: Record<string, string[]>;
  } = {},
): Promise<{ result: RunResult; lines: string[] }> {
  const lines = opts.lines ?? [];
  // BROWSER_TMP_DIR from the environment lets the browser tests run where
  // /dev/shm does not exist (a developer laptop); CI uses the default.
  const tmpDir: Record<string, string> = process.env.BROWSER_TMP_DIR ? { BROWSER_TMP_DIR: process.env.BROWSER_TMP_DIR } : {};
  const config = loadConfig(fixtureEnv(api.url, TEST_KEY, { ...tmpDir, ...opts.env }));
  const policy = loopbackTestPolicy(opts.hosts ?? FIXTURE_HOSTS, site.port, opts.extraDns ?? {});
  const fetcher = new SafeFetcher(policy, {
    userAgent: config.CRAWLER_USER_AGENT,
    connectTimeoutMs: config.CONNECT_TIMEOUT_MS,
    headersTimeoutMs: config.HEADERS_TIMEOUT_MS,
    bodyTimeoutMs: config.BODY_TIMEOUT_MS,
    totalTimeoutMs: config.REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
  });
  const client = new AsmitaClient({
    baseUrl: config.ASMITA_API_URL,
    serviceKey: config.CRAWLER_SERVICE_KEY,
    userAgent: config.CRAWLER_USER_AGENT,
    timeoutMs: 5000,
    attempts: config.API_ATTEMPTS,
    baseDelayMs: 10,
    maxDelayMs: 50,
  });
  // The real isolated decoder (dist/decoder-worker.js, built in global setup).
  const decoder = new DecoderPool({ size: config.DECODE_CONCURRENCY, taskTimeoutMs: config.DECODE_TIMEOUT_MS, minSide: config.MIN_IMAGE_SIDE });
  try {
    const result = await runCrawl({
      config,
      api: client,
      fetcher,
      decoder,
      log: new Logger({ sink: (l) => lines.push(l), level: "debug" }),
      stopSignal: opts.stopSignal,
      now: opts.now,
      poolResyncMs: opts.poolResyncMs,
      // The same test policy drives the browser proxy (WP7); Chromium is the
      // one Playwright installed for this Node.
      policy,
      browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache", "ms-playwright"),
    });
    return { result, lines };
  } finally {
    await fetcher.close();
    await client.close();
    await decoder.close();
  }
}
