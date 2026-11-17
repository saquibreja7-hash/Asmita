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
