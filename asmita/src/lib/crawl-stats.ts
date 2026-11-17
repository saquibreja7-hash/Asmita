import { crawlMemory, type MemoryCrawlFinding, type MemoryCrawlPage } from "@/lib/crawl-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Crawler v2 (full-crawler spec WP8): the address-free aggregates behind the
 * admin "Crawler overview" page and GET /api/admin/crawler/stats
 * (findings:review, reads only). Sites by origin and state, pages crawled
 * today, the frontier queue, discovered sites today, matches awaiting
 * review, the last run the app saw, and page outcomes by the code the
 * crawler reported.
 *
 * Every number here is computed in the database (groupBy / count / max), so
 * the aggregation never reads a page, finding or source row into the app:
 * counts, timestamps and run ids cross the wire, nothing else. No host, no
 * URL, no fingerprint, no case reference — the same vocabulary the crawler's
 * own logs keep (counts, ids and codes only).
 *
 * What the app can and cannot see:
 * - "Pages crawled today" counts CrawlPage rows with a lastFetchedAt inside
 *   the UTC day — exactly the count a source's daily pageBudget uses
 *   (crawl-pages.ts), so the dashboard and the budget can never disagree.
 * - The app names a run only through its findings (CrawlFinding.runId):
 *   frontier reports carry the run id but no page row stores it. The "last
 *   run" is therefore the newest run that reported a match, plus the last
 *   crawl activity of any kind (a page fetch, a source visit, a finding).
 *   A run that found nothing leaves no run id behind; the crawler's own run
 *   summary (its logs) remains the full record.
 * - "Errors by code" are the page outcomes the app holds, keyed by the code
 *   of the report that produced them (error, blocked, gone, dead). The
 *   crawler's finer error codes (dns_error, tls_failed, ...) never reach the
 *   app and cannot appear here.
 *
 * Three aligned paths, like every crawl module: the memory store (dev and
 * tests), Kysely (Worker with ASMITA_DATABASE_DRIVER=pg) and Prisma (Node
 * and the Prisma-edge Worker). No schema change: everything here reads
 * tables that already exist.
 */

/** A source origin, as the aggregates key it (lowercase, like /api/crawler/sources). */
export type CrawlOriginKey = "admin" | "reported" | "discovered";

export type CrawlOriginStats = {
  total: number;
  enabled: number;
  disabled: number;
};

export type CrawlerSitesStats = {
  total: number;
  enabled: number;
  disabled: number;
  byOrigin: { admin: CrawlOriginStats; reported: CrawlOriginStats; discovered: CrawlOriginStats };
};

/** The frontier queue, partitioned into four disjoint live buckets plus the dead. */
export type CrawlerQueueStats = {
  /** Live rows: pending + due + claimed + scheduled (every status but gone and dead). */
  live: number;
  /** Rows never visited (status PENDING), whatever claim holds them. */
  pending: number;
  /** Live rows due now and not out with a run: what a crawler claim would take. */
  due: number;
  /** Live rows claimed in the last 30 minutes and not yet reported. */
  claimed: number;
  /** Live rows waiting for their next visit time (fetched, not modified, error backoff, blocked recheck). */
  scheduled: number;
  /** Final rows: gone, or dead after five failures. Never crawled again. */
  dead: number;
};

export type CrawlerFindingsStats = {
  /** CANDIDATE findings: the "matches awaiting review" number. */
  awaitingReview: number;
  approved: number;
  dismissed: number;
};

/** Page rows by the outcome code of their last report. */
export type CrawlOutcomeCounts = {
  pending: number;
  fetched: number;
  notModified: number;
  gone: number;
  blocked: number;
  error: number;
  dead: number;
};

export type CrawlerRunStats = {
  /** The newest crawl activity of any kind the app recorded, or null before the first. */
  activityAt: string | null;
  /**
   * The newest run that reported a match (the only run id the app ever
   * sees), with its finding window and count. Null when no finding exists.
   */
  findingRun: { runId: string; firstSeenAt: string; lastSeenAt: string; findings: number } | null;
};

export type CrawlerStats = {
  generatedAt: string;
  sites: CrawlerSitesStats;
  pagesCrawledToday: number;
  queue: CrawlerQueueStats;
  discoveredSitesToday: number;
  findings: CrawlerFindingsStats;
  pagesByStatus: CrawlOutcomeCounts;
  lastRun: CrawlerRunStats;
};

type PageStatus = MemoryCrawlPage["status"];
type Origin = "ADMIN" | "REPORTED" | "DISCOVERED";
type FindingStatus = "CANDIDATE" | "APPROVED" | "DISMISSED";

/** The raw per-path counts; assembleStats turns them into CrawlerStats. */
type RawCounts = {
  sites: Array<{ origin: Origin; enabled: boolean; count: number }>;
  discoveredSitesToday: number;
  lastSourceCrawlAt: Date | null;
  pagesByStatus: Record<PageStatus, number>;
  pagesCrawledToday: number;
  due: number;
  claimed: number;
  lastPageFetchAt: Date | null;
  findingsByStatus: Record<FindingStatus, number>;
  newestRun: { runId: string; firstSeenAt: Date; lastSeenAt: Date; findings: number } | null;
};

const ZERO_STATUSES: Record<PageStatus, number> = {
  PENDING: 0, FETCHED: 0, NOT_MODIFIED: 0, GONE: 0, BLOCKED: 0, ERROR: 0, DEAD: 0,
};
const ZERO_FINDINGS: Record<FindingStatus, number> = { CANDIDATE: 0, APPROVED: 0, DISMISSED: 0 };

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Start of the UTC day `now` falls in: the budget window (crawl-pages.ts). */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const ORIGIN_KEYS: Record<Origin, CrawlOriginKey> = { ADMIN: "admin", REPORTED: "reported", DISCOVERED: "discovered" };

function maxDate(dates: Array<Date | null>): Date | null {
  let max: Date | null = null;
  for (const date of dates) if (date && (!max || date > max)) max = date;
  return max;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getCrawlerStats(now = new Date()): Promise<CrawlerStats> {
  const dayStart = startOfUtcDay(now);
  const raw = isDevNoDb()
    ? rawMemory(now, dayStart)
    : usesWorkerKysely()
      ? await rawKysely(now, dayStart)
      : await rawPrisma(now, dayStart);
  return assembleStats(raw, now);
}

function assembleStats(raw: RawCounts, now: Date): CrawlerStats {
  const byOrigin: CrawlerSitesStats["byOrigin"] = {
    admin: { total: 0, enabled: 0, disabled: 0 },
    reported: { total: 0, enabled: 0, disabled: 0 },
    discovered: { total: 0, enabled: 0, disabled: 0 },
  };
  for (const group of raw.sites) {
    const key = ORIGIN_KEYS[group.origin];
    if (!key) continue; // cannot happen (enum); never guessed into a bucket
    const bucket = byOrigin[key];
    bucket.total += group.count;
    if (group.enabled) bucket.enabled += group.count;
    else bucket.disabled += group.count;
  }
  const statuses = raw.pagesByStatus;
  const live = statuses.PENDING + statuses.FETCHED + statuses.NOT_MODIFIED + statuses.BLOCKED + statuses.ERROR;
  const scheduled = Math.max(live - raw.due - raw.claimed, 0);
  const activityAt = maxDate([raw.lastPageFetchAt, raw.lastSourceCrawlAt, raw.newestRun?.lastSeenAt ?? null]);
  return {
    generatedAt: now.toISOString(),
    sites: {
      total: byOrigin.admin.total + byOrigin.reported.total + byOrigin.discovered.total,
      enabled: byOrigin.admin.enabled + byOrigin.reported.enabled + byOrigin.discovered.enabled,
      disabled: byOrigin.admin.disabled + byOrigin.reported.disabled + byOrigin.discovered.disabled,
      byOrigin,
    },
    pagesCrawledToday: raw.pagesCrawledToday,
    queue: {
      live,
      pending: statuses.PENDING,
      due: raw.due,
      claimed: raw.claimed,
      scheduled,
      dead: statuses.GONE + statuses.DEAD,
    },
    discoveredSitesToday: raw.discoveredSitesToday,
    findings: {
      awaitingReview: raw.findingsByStatus.CANDIDATE,
      approved: raw.findingsByStatus.APPROVED,
      dismissed: raw.findingsByStatus.DISMISSED,
    },
    pagesByStatus: {
      pending: statuses.PENDING,
      fetched: statuses.FETCHED,
      notModified: statuses.NOT_MODIFIED,
      gone: statuses.GONE,
      blocked: statuses.BLOCKED,
      error: statuses.ERROR,
      dead: statuses.DEAD,
    },
    lastRun: {
      activityAt: activityAt ? activityAt.toISOString() : null,
      findingRun: raw.newestRun
        ? {
          runId: raw.newestRun.runId,
          firstSeenAt: raw.newestRun.firstSeenAt.toISOString(),
          lastSeenAt: raw.newestRun.lastSeenAt.toISOString(),
          findings: raw.newestRun.findings,
        }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Memory path (dev and tests)
// ---------------------------------------------------------------------------

function rawMemory(now: Date, dayStart: Date): RawCounts {
  const memory = crawlMemory();
  const siteGroups = new Map<string, { origin: Origin; enabled: boolean; count: number }>();
  let discoveredSitesToday = 0;
  let lastSourceCrawlAt: Date | null = null;
  for (const source of memory.sources.values()) {
    const key = `${source.origin}:${source.enabled ? "on" : "off"}`;
    const group = siteGroups.get(key) ?? { origin: source.origin as Origin, enabled: source.enabled, count: 0 };
    group.count++;
    siteGroups.set(key, group);
    if (source.origin === "DISCOVERED" && source.createdAt >= dayStart) discoveredSitesToday++;
    if (source.lastCrawledAt && (!lastSourceCrawlAt || source.lastCrawledAt > lastSourceCrawlAt)) lastSourceCrawlAt = source.lastCrawledAt;
  }

  const pagesByStatus = { ...ZERO_STATUSES };
  let pagesCrawledToday = 0;
  let due = 0;
  let claimed = 0;
  let lastPageFetchAt: Date | null = null;
  for (const page of memory.pages.values()) {
    pagesByStatus[page.status]++;
    if (page.lastFetchedAt) {
      if (page.lastFetchedAt >= dayStart) pagesCrawledToday++;
      if (!lastPageFetchAt || page.lastFetchedAt > lastPageFetchAt) lastPageFetchAt = page.lastFetchedAt;
    }
    if (page.status === "DEAD" || page.status === "GONE") continue;
    if (page.claimedUntil && page.claimedUntil > now) claimed++;
    else if (page.nextDueAt <= now) due++;
  }

  const findingsByStatus = { ...ZERO_FINDINGS };
  let newest: MemoryCrawlFinding | null = null;
  for (const finding of memory.findings.values()) {
    findingsByStatus[finding.reviewStatus as FindingStatus]++;
    if (!newest || finding.lastSeenAt > newest.lastSeenAt) newest = finding;
  }
  let newestRun: RawCounts["newestRun"] = null;
  if (newest) {
    let firstSeenAt = newest.lastSeenAt;
    let lastSeenAt = newest.lastSeenAt;
    let findings = 0;
    for (const finding of memory.findings.values()) {
      if (finding.runId !== newest.runId) continue;
      findings++;
      if (finding.firstSeenAt < firstSeenAt) firstSeenAt = finding.firstSeenAt;
      if (finding.lastSeenAt > lastSeenAt) lastSeenAt = finding.lastSeenAt;
    }
    newestRun = { runId: newest.runId, firstSeenAt, lastSeenAt, findings };
  }

  return {
    sites: [...siteGroups.values()],
    discoveredSitesToday,
    lastSourceCrawlAt,
    pagesByStatus,
    pagesCrawledToday,
    due,
    claimed,
    lastPageFetchAt,
    findingsByStatus,
    newestRun,
  };
}

// ---------------------------------------------------------------------------
// Kysely path (Worker, ASMITA_DATABASE_DRIVER=pg)
// ---------------------------------------------------------------------------

/** A count row from countAll(), which Postgres returns as bigint text. */
function toCount(value: unknown): number {
  return Number(value ?? 0);
}

async function rawKysely(now: Date, dayStart: Date): Promise<RawCounts> {
  const db = getWorkerDb();

  // Sites by origin and state, discovered today, last visit of any source.
  const siteRows = await db.selectFrom("CrawlSource")
    .select((eb) => ["origin", "enabled", eb.fn.countAll<string>().as("count")])
    .groupBy(["origin", "enabled"])
    .execute();
  const discoveredRow = await db.selectFrom("CrawlSource")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("origin", "=", "DISCOVERED").where("createdAt", ">=", dayStart)
    .executeTakeFirst();
  const sourceLastRow = await db.selectFrom("CrawlSource")
    .select((eb) => eb.fn.max("lastCrawledAt").as("last"))
    .executeTakeFirst();

  // Pages: outcomes, the day's fetched count, and the queue's due/claimed split.
  const statusRows = await db.selectFrom("CrawlPage")
    .select((eb) => ["status", eb.fn.countAll<string>().as("count")])
    .groupBy("status")
    .execute();
  const todayRow = await db.selectFrom("CrawlPage")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("lastFetchedAt", ">=", dayStart)
    .executeTakeFirst();
  const dueRow = await db.selectFrom("CrawlPage")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("status", "not in", ["DEAD", "GONE"])
    .where("nextDueAt", "<=", now)
    .where((eb) => eb.or([eb("claimedUntil", "is", null), eb("claimedUntil", "<", now)]))
    .executeTakeFirst();
  const claimedRow = await db.selectFrom("CrawlPage")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("status", "not in", ["DEAD", "GONE"])
    .where("claimedUntil", ">", now)
    .executeTakeFirst();
  const pageLastRow = await db.selectFrom("CrawlPage")
    .select((eb) => eb.fn.max("lastFetchedAt").as("last"))
    .executeTakeFirst();

  // Findings by review status, then the newest run that reported a match.
  const findingRows = await db.selectFrom("CrawlFinding")
    .select((eb) => ["reviewStatus", eb.fn.countAll<string>().as("count")])
    .groupBy("reviewStatus")
    .execute();
  const newestRow = await db.selectFrom("CrawlFinding")
    .select(["runId", "lastSeenAt"])
    .orderBy("lastSeenAt", "desc")
    .limit(1)
    .executeTakeFirst();
  const runRow = newestRow
    ? await db.selectFrom("CrawlFinding")
      .select((eb) => [
        eb.fn.countAll<string>().as("count"),
        eb.fn.min("firstSeenAt").as("first"),
        eb.fn.max("lastSeenAt").as("last"),
      ])
      .where("runId", "=", newestRow.runId)
      .executeTakeFirst()
    : undefined;

  const pagesByStatus = { ...ZERO_STATUSES };
  for (const row of statusRows) {
    const status = row.status as PageStatus;
    if (status in pagesByStatus) pagesByStatus[status] = toCount(row.count);
  }
  const findingsByStatus = { ...ZERO_FINDINGS };
  for (const row of findingRows) {
    const status = row.reviewStatus as FindingStatus;
    if (status in findingsByStatus) findingsByStatus[status] = toCount(row.count);
  }
  const newestRun = newestRow && runRow?.first && runRow.last
    ? { runId: newestRow.runId, firstSeenAt: runRow.first, lastSeenAt: runRow.last, findings: toCount(runRow.count) }
    : null;

  return {
    sites: siteRows.map((row) => ({
      origin: row.origin as Origin,
      enabled: row.enabled === true,
      count: toCount(row.count),
    })),
    discoveredSitesToday: toCount(discoveredRow?.count),
    lastSourceCrawlAt: sourceLastRow?.last ?? null,
    pagesByStatus,
    pagesCrawledToday: toCount(todayRow?.count),
    due: toCount(dueRow?.count),
    claimed: toCount(claimedRow?.count),
    lastPageFetchAt: pageLastRow?.last ?? null,
    findingsByStatus,
    newestRun,
  };
}

// ---------------------------------------------------------------------------
// Prisma path (Node and the Prisma-edge Worker)
// ---------------------------------------------------------------------------

async function rawPrisma(now: Date, dayStart: Date): Promise<RawCounts> {
  const { db } = await import("@/lib/db");

  const siteRows = await db.crawlSource.groupBy({ by: ["origin", "enabled"], _count: { _all: true } });
  const discoveredSitesToday = await db.crawlSource.count({ where: { origin: "DISCOVERED", createdAt: { gte: dayStart } } });
  const sourceLast = await db.crawlSource.aggregate({ _max: { lastCrawledAt: true } });

  const statusRows = await db.crawlPage.groupBy({ by: ["status"], _count: { _all: true } });
  const pagesCrawledToday = await db.crawlPage.count({ where: { lastFetchedAt: { gte: dayStart } } });
  const due = await db.crawlPage.count({
    where: { status: { notIn: ["DEAD", "GONE"] }, nextDueAt: { lte: now }, OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }] },
  });
  const claimed = await db.crawlPage.count({ where: { status: { notIn: ["DEAD", "GONE"] }, claimedUntil: { gt: now } } });
  const pageLast = await db.crawlPage.aggregate({ _max: { lastFetchedAt: true } });

  const findingRows = await db.crawlFinding.groupBy({ by: ["reviewStatus"], _count: { _all: true } });
  const newest = await db.crawlFinding.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { runId: true } });
  const runAgg = newest
    ? await db.crawlFinding.aggregate({
      where: { runId: newest.runId },
      _count: { _all: true },
      _min: { firstSeenAt: true },
      _max: { lastSeenAt: true },
    })
    : null;

  const pagesByStatus = { ...ZERO_STATUSES };
  for (const row of statusRows) {
    const status = row.status as PageStatus;
    if (status in pagesByStatus) pagesByStatus[status] = row._count._all;
  }
  const findingsByStatus = { ...ZERO_FINDINGS };
  for (const row of findingRows) {
    const status = row.reviewStatus as FindingStatus;
    if (status in findingsByStatus) findingsByStatus[status] = row._count._all;
  }
  const newestRun = newest && runAgg?._min.firstSeenAt && runAgg._max.lastSeenAt
    ? { runId: newest.runId, firstSeenAt: runAgg._min.firstSeenAt, lastSeenAt: runAgg._max.lastSeenAt, findings: runAgg._count._all }
    : null;

  return {
    sites: siteRows.map((row) => ({
      origin: row.origin as Origin,
      enabled: row.enabled === true,
      count: row._count._all,
    })),
    discoveredSitesToday,
    lastSourceCrawlAt: sourceLast._max.lastCrawledAt ?? null,
    pagesByStatus,
    pagesCrawledToday,
    due,
    claimed,
    lastPageFetchAt: pageLast._max.lastFetchedAt ?? null,
    findingsByStatus,
    newestRun,
  };
}
