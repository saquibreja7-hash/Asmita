/*
 * The one place CRAWLER_SHOW_FINDINGS_TO_SURVIVOR is read. A deployment
 * switch, not a dev bypass (like ENABLE_CRAWLER in crawler-auth.ts), and
 * deliberately free of imports so client-safe modules can use it.
 *
 * On unless set to "false": whether the survivor sees the websites where
 * Asmita's search found copies is an open owner decision (ADR 006). Off, the
 * survivor-facing case reads (getCaseForUser, listCasesForUser, the link
 * report echo) omit crawler-found links entirely, and her link actions
 * (mark removed, platform filed, sign, preview) answer a crawler link's id as
 * if it were not on her case (survivorMayActOnLink below). On, she may
 * mark a crawler link removed or filed; she never signs one. Admin views and her own
 * data export are not affected: the export is her right of access.
 */
export function crawlerFindingsVisibleToSurvivor(env: Record<string, string | undefined> = process.env) {
  return env.CRAWLER_SHOW_FINDINGS_TO_SURVIVOR !== "false";
}

/*
 * Crawler v2 (full-crawler spec WP1): the budget and delay a source gets when
 * it is created automatically. Read in this one place, client-safe (no
 * imports). An unset or unparseable value falls back to the default; a value
 * outside the bounds a SUPER_ADMIN could set (crawl-sources.ts) is clamped,
 * never refused — creating a reported source must not fail her link report.
 */

const PAGE_BUDGET_MAX = 10_000;
const DELAY_MIN_MS = 500;
const DELAY_MAX_MS = 60_000;

function clampedInt(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Page budget of a REPORTED source (a survivor's link or an approved finding named its host). */
export function reportedSourcePageBudget(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_REPORTED_PAGE_BUDGET", 2000, 1, PAGE_BUDGET_MAX);
}

/** Page budget of a DISCOVERED source (used from WP5 on). */
export function discoveredSourcePageBudget(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_DISCOVERED_PAGE_BUDGET", 200, 1, PAGE_BUDGET_MAX);
}

/** Delay between pages of any automatically created source. */
export function defaultSourceDelayMs(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_DEFAULT_DELAY_MS", 1500, DELAY_MIN_MS, DELAY_MAX_MS);
}

/*
 * Crawler v2 WP5: how far discovery may reach from a human-added or
 * survivor-reported site, and how many discovered sites may be switched on
 * per UTC day. Read in this one place, client-safe (no imports). Unset or
 * unparseable values fall back to the defaults; out-of-range values clamp,
 * never refuse — a discovery report must not fail on a bad knob.
 */

/** A DISCOVERED source is enabled automatically while its hops are within this. */
export function maxDiscoveryHops(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_MAX_DISCOVERY_HOPS", 2, 0, 10);
}

/** At most this many discovered sites are auto-enabled per UTC day. */
export function maxNewSitesPerDay(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_MAX_NEW_SITES_PER_DAY", 200, 0, 10_000);
}

/**
 * Crawler v2 review fix: the most frontier rows (CrawlPage) one source may
 * hold. Links reported beyond it are dropped, so a huge forum's backlog
 * cannot grow without bound. Default 50,000: 25 days of the largest default
 * budget (2000 pages a day), close to the 30-day retention, so a source
 * rarely holds work it could not do before the rows would expire anyway.
 * Clamped to 1000..1,000,000.
 */
export function maxFrontierPagesPerSource(env: Record<string, string | undefined> = process.env) {
  return clampedInt(env, "CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE", 50_000, 1000, 1_000_000);
}

/*
 * SSCD, the second matching layer (ADR 008, WP28): the crawler — never the
 * app — computes a deep descriptor of an image an analyst has already
 * confirmed, posts it to /api/crawler/embeddings, and the app stores it
 * encrypted, serving it back through the pool under the same consent gating
 * as the PDQ hashes. Read in this one place, client-safe (no imports).
 *
 * ENABLE_SSCD is a deployment switch like ENABLE_CRAWLER in crawler-auth.ts,
 * off by default and deliberately NOT in wrangler.jsonc: nothing changes in
 * any environment until the owner turns it on. While it is off the
 * embeddings route answers 503 crawler_disabled and the pool serves no
 * vectors, exactly as before this feature existed.
 */

/** Whether the SSCD second layer is switched on (ADR 008). Off unless exactly "true". */
export function sscdEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ENABLE_SSCD === "true";
}

const SSCD_MODEL_DEFAULT = "sscd_disc_mixup";
const SSCD_VERSION_DEFAULT = "onnx-1";

/**
 * The SSCD model id the deployment serves and accepts (ADR 008: the released
 * `sscd_disc_mixup`). Vectors are comparable only within one model + version,
 * so the pool serves, and the embeddings route accepts, only this id. An
 * unset, empty or over-long value falls back to the default — a deployment
 * knob must never silently stop the pool from serving what it already holds.
 */
export function sscdModelId(env: Record<string, string | undefined> = process.env) {
  const raw = env.SSCD_MODEL_ID;
  return typeof raw === "string" && raw.length >= 1 && raw.length <= 64 ? raw : SSCD_MODEL_DEFAULT;
}

/** The version tag of the SSCD model (ADR 008: "onnx-1"), same rules as sscdModelId. */
export function sscdModelVersion(env: Record<string, string | undefined> = process.env) {
  const raw = env.SSCD_MODEL_VERSION;
  return typeof raw === "string" && raw.length >= 1 && raw.length <= 64 ? raw : SSCD_VERSION_DEFAULT;
}

/**
 * Which of her case's links a survivor may act on. With crawler findings
 * hidden from her a crawler-found link behaves exactly as if it did not exist:
 * the same "url_not_found" as an id from another case. With them shown she
 * may mark one removed or filed (she never signs one).
 */
export function survivorMayActOnLink(url: { source?: string | null }): boolean {
  return crawlerFindingsVisibleToSurvivor() || url.source !== "CRAWLER";
}

/** The Prisma filter for survivorMayActOnLink. */
export function survivorActableLinkWhere(): { source?: "SURVIVOR" } {
  return crawlerFindingsVisibleToSurvivor() ? {} : { source: "SURVIVOR" };
}
