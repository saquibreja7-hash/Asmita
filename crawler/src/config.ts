/**
 * Environment configuration, validated once at startup. Anything missing or
 * malformed stops the process before any network activity (fail closed).
 *
 * There is deliberately no setting that loosens the network policy (no
 * "allow private addresses", no extra ports, no http-only crawling). Tests
 * reach their loopback fixture server through a policy object injected in
 * code; tests/unit/config.test.ts asserts no such key exists here.
 */
import { z } from "zod";

const int = (min: number, max: number, def: number) => z.coerce.number().int().min(min).max(max).default(def);

const LOOPBACK_API_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const ConfigSchema = z.object({
  ASMITA_API_URL: z
    .url()
    .refine((v) => {
      const u = new URL(v);
      if (u.username || u.password || u.search || u.hash) return false;
      // Plain http only for a local mock on loopback; production is https.
      return u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK_API_HOSTS.has(u.hostname));
    }, "must be an https origin (http allowed only for a loopback mock)"),
  CRAWLER_SERVICE_KEY: z.string().min(32).max(512).regex(/^[\x21-\x7e]+$/, "printable ASCII, no spaces"),
  CRAWLER_USER_AGENT: z
    .string()
    .min(10)
    .max(200)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*\/[\x20-\x7e]+$/, "must look like 'AsmitaCrawler/1.0 (+https://...)'"),

  MAX_RUN_MINUTES: int(1, 24 * 60, 50),
  MAX_PAGES: int(1, 1_000_000, 5_000),
  MAX_IMAGES: int(1, 5_000_000, 20_000),
  MAX_DEPTH: int(0, 50, 5),
  /** Links taken from one page (bounds memory on link-flood pages). */
  MAX_LINKS_PER_PAGE: int(1, 10_000, 500),
  /** Image candidates taken from one page. */
  MAX_IMAGES_PER_PAGE: int(1, 10_000, 200),
  GLOBAL_CONCURRENCY: int(1, 32, 4),
  /** Decoder child processes (each decodes one image at a time). */
  DECODE_CONCURRENCY: int(1, 4, 1),
  /** Per-image decode deadline; the child is killed and replaced after it. */
  DECODE_TIMEOUT_MS: int(1000, 120_000, 20_000),
  /**
   * Pages claimed from the app's frontier per request (crawler v2 WP3). The
   * crawler holds no other page state, so this bounds its frontier memory:
   * the claimed batch and the report built from it.
   */
  FRONTIER_CLAIM_LIMIT: int(1, 200, 50),
  MAX_HTML_BYTES: int(1024, 20 * 1024 * 1024, 2 * 1024 * 1024),
  MAX_IMAGE_BYTES: int(1024, 50 * 1024 * 1024, 10 * 1024 * 1024),
  MIN_IMAGE_SIDE: int(1, 4096, 64),
  /**
   * Addresses taken from one sitemap or feed document (crawler v2 WP4):
   * page <loc>, child sitemap <loc>, <image:loc> and feed entries all count.
   * Size is capped by MAX_HTML_BYTES, compressed and inflated alike.
   */
  MAX_SITEMAP_URLS: int(1, 100_000, 5000),
  /**
   * Distinct query variants reported per path (crawler v2 WP4); pagination
   * links are exempt. Bounds query-string traps (session/view keys).
   */
  MAX_QUERY_VARIANTS_PER_PATH: int(1, 1000, 8),
  /**
   * Distinct out-of-scope hosts reported as discoveries per run (crawler v2
   * WP5); 0 switches discovery off. Bounds the run-wide host set, so a
   * hostile approved page full of external links cannot grow it without
   * limit.
   */
  MAX_DISCOVERY_HOSTS: int(0, 100_000, 1000),
  /** Delay between requests to image hosts outside the source (CDNs). */
  OFFSITE_HOST_DELAY_MS: int(0, 600_000, 1_000),
  /**
   * Distinct hosts outside a source's scope that have returned an image, per
   * source per run (CDNs). A host counts only after it answers with an image;
   * once the cap is reached further new off-scope hosts are skipped.
   */
  MAX_OFFSITE_IMAGE_HOSTS: int(0, 1000, 50),
  /**
   * Distinct off-scope hosts per source per run that were tried and did not
   * return an image. Bounds requests to junk hosts a hostile page lists.
   */
  MAX_OFFSITE_HOST_FAILURES: int(1, 1000, 20),
  /** robots.txt Crawl-delay is honoured up to this cap. */
  MAX_CRAWL_DELAY_MS: int(0, 600_000, 30_000),
  POOL_RESYNC_MINUTES: int(1, 60, 30),
  CONNECT_TIMEOUT_MS: int(100, 60_000, 10_000),
  HEADERS_TIMEOUT_MS: int(100, 120_000, 15_000),
  BODY_TIMEOUT_MS: int(100, 120_000, 15_000),
  REQUEST_TIMEOUT_MS: int(100, 300_000, 30_000),
  FETCH_ATTEMPTS: int(1, 5, 3),
  API_TIMEOUT_MS: int(100, 300_000, 30_000),
  API_ATTEMPTS: int(1, 10, 4),
  SHUTDOWN_GRACE_MS: int(0, 60_000, 5_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  /** Names of the offending variables only; never their values. */
  readonly keys: string[];
  constructor(keys: string[]) {
    super("invalid_config");
    this.name = "ConfigError";
    this.keys = keys;
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "unknown")))].sort();
    throw new ConfigError(keys);
  }
  return parsed.data;
}

/** The product token robots.txt groups are matched against. */
export function userAgentToken(ua: string): string {
  return ua.split("/")[0]!;
}
