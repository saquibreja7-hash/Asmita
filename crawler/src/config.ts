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
  /**
   * Sources crawled concurrently (crawler v2 WP6); each source is still
   * sequential and every request still passes the GLOBAL_CONCURRENCY gate and
   * the per-host delay. A slow or failing source occupies only its own slot.
   */
  CRAWLER_SOURCE_CONCURRENCY: int(1, 32, 8),
  /**
   * `run --loop` (crawler v2 WP6): seconds to sleep after a pass that found
   * nothing due anywhere, before listing sources and claiming again.
   */
  LOOP_IDLE_SECONDS: int(1, 3600, 60),
  /** Seconds between the periodic run_progress log lines (crawler v2 WP6). */
  PROGRESS_LOG_SECONDS: int(1, 3600, 60),
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
  // --- browser rendering (crawler v2 WP7) -----------------------------------
  // Sources with render = BROWSER, or AUTO pages with scripts and no image
  // candidates, are rendered by headless Chromium in a child process whose
  // traffic goes through the in-process proxy (net/browser-proxy.ts).
  /** Overall deadline for one rendered page, including scrolls. */
  BROWSER_PAGE_TIMEOUT_MS: int(1000, 300_000, 30_000),
  /** Scroll steps per page to trigger lazy loading (infinite scroll). */
  BROWSER_SCROLLS: int(0, 20, 5),
  /** Wait after each scroll for late responses to land. */
  BROWSER_SCROLL_WAIT_MS: int(0, 30_000, 500),
  /** Requests one page may make; the rest are aborted before the network. */
  BROWSER_MAX_REQUESTS_PER_PAGE: int(1, 10_000, 300),
  /** Total bytes one page may move through the proxy (tunnels summed). */
  BROWSER_MAX_PAGE_BYTES: int(1_000_000, 2_000_000_000, 64 * 1024 * 1024),
  /**
   * Memory-backed directory for Chromium's throwaway profile and shared
   * memory. Must be a tmpfs in production (the container documents the
   * flags); the crawler itself never writes to it.
   */
  BROWSER_TMP_DIR: z.string().min(1).max(1024).default("/dev/shm"),
  /**
   * WP25: the only override around the browser-sandbox fail-closed rule.
   * When Chromium's own sandbox cannot start (the runtime grants no
   * unprivileged user namespaces), browser rendering is disabled for the
   * run — render = BROWSER pages report an error, AUTO pages fall back to
   * their static result. Setting this to "true" lets the run render with
   * `--no-sandbox` instead: FOR LOCAL DEVELOPMENT ONLY. Strict literals, so
   * a typo fails startup instead of silently enabling it. It touches nothing
   * else: the network policy, the proxy and every other guarantee are
   * unaffected.
   */
  CRAWLER_ALLOW_UNSANDBOXED_BROWSER: z
    .enum(["true", "false"])
    .default("false")
    .transform((v: string) => v === "true"),
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
  // --- SSCD second matching layer (WP28) ---------------------------------------
  // Off by default: nothing about the crawl changes while ENABLE_SSCD is not
  // exactly "true" (no inference, no embeddings route call, no new log fields).
  ENABLE_SSCD: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Where the second layer runs: only on sources the app flagged as having an
   * accepted finding (default), or everywhere. One gate covers every SSCD
   * inference on a source — the second layer, the borderline score and the
   * seeding — because a confirmed finding's own source always carries the
   * flag, so the seeding loses nothing.
   */
  SSCD_SCOPE: z.enum(["matched_sources", "all"]).default("matched_sources"),
  /** Per-run cap on SSCD inferences (second layer, borderline scores, seeding). */
  SSCD_MAX_PER_RUN: int(0, 1_000_000, 2000),
  /**
   * Cosine similarity (the vectors are L2-normalised) at which an SSCD hit
   * becomes a finding for an analyst to review. Measured on the synthetic
   * evaluation set; see asmita/docs/adr/008-sscd-second-layer.md.
   */
  SSCD_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.85),
  /**
   * The descriptor identity both sides must agree on. The app serves and
   * accepts only this model id + version pair, so vectors of different models
   * never mix. Defaults must match asmita/src/lib/crawler-flags.ts.
   */
  SSCD_MODEL_ID: z.string().min(1).max(64).default("sscd_disc_mixup"),
  SSCD_MODEL_VERSION: z.string().min(1).max(64).default("onnx-1"),
  /** Where the ONNX weights live (downloaded at image build, never in git). */
  SSCD_MODEL_FILE: z.string().min(1).max(1024).default(""),
  /** The embedding dimension the child must answer with (sscd_disc_mixup: 512). */
  SSCD_EMBED_DIM: int(16, 2048, 512),
  /** Per-image deadline for one embedding; the child is killed and replaced. */
  SSCD_TIMEOUT_MS: int(1000, 120_000, 20_000),
  CONNECT_TIMEOUT_MS: int(100, 60_000, 10_000),
  HEADERS_TIMEOUT_MS: int(100, 120_000, 15_000),
  BODY_TIMEOUT_MS: int(100, 120_000, 15_000),
  REQUEST_TIMEOUT_MS: int(100, 300_000, 30_000),
  FETCH_ATTEMPTS: int(1, 5, 3),
  API_TIMEOUT_MS: int(100, 300_000, 30_000),
  API_ATTEMPTS: int(1, 10, 4),
  SHUTDOWN_GRACE_MS: int(0, 60_000, 5_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})
  // Fail closed: the second layer cannot start without its weights. The
  // Dockerfile pins the model file (URL + sha256); a container that lost it
  // stops here, before any network activity.
  .superRefine((cfg, ctx) => {
    if (cfg.ENABLE_SSCD && !cfg.SSCD_MODEL_FILE.startsWith("/")) {
      ctx.addIssue({ code: "custom", path: ["SSCD_MODEL_FILE"], message: "an absolute model path is required when ENABLE_SSCD=true" });
    }
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
