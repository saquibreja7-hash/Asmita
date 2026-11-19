import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { z } from "zod";
import { crawlMemory, sourceDayKey, type MemoryCrawlPage } from "@/lib/crawl-store";
import { crawlerShapedUrl, pageOnSourceHost } from "@/lib/crawl-findings";
import { isBlockedCrawlHost } from "@/lib/crawl-sources";
import { maxFrontierPagesPerSource } from "@/lib/crawler-flags";
import { legacyPageKeys, pageKey } from "@/lib/crawl-page-key";
import { decryptField, encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * The app-backed frontier (full-crawler spec WP3). The app owns the list of
 * page URLs per source: the crawler claims a batch of due rows, fetches them
 * with If-None-Match / If-Modified-Since, and reports each page's outcome
 * plus the links it found. The app stores new in-scope URLs (deduplicated per
 * source on a keyed digest), schedules the next visit from the outcome, and
 * counts fetched pages against the source's daily budget.
 *
 * - A claimed row is not handed out again for 30 minutes, so two crawler
 *   processes never fetch the same URL in the same window, and a killed run
 *   loses at most its claimed batch, which becomes due again on its own.
 * - The claim locks rows FOR UPDATE SKIP LOCKED on both database paths, so
 *   concurrent claims disjoint. The memory path is single-threaded by design.
 * - A source holds at most CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE rows
 *   (crawler-flags.ts, default 50,000); new links beyond it are dropped, so
 *   a huge site's backlog stays bounded. Some of the dropped links may be
 *   duplicates of stored rows, so the cap can bite a few rows early; it never
 *   lets the count exceed it.
 * - URLs are strings only here: validated, encrypted at rest, never fetched,
 *   never logged, never in audit data. A frontier row is operational state,
 *   not a record: rows leave with the same 30-day retention as findings
 *   (url-retention.ts), except rows that are still due for crawling.
 * - Claim and report are not audited: they are high-frequency service
 *   traffic, not admin or case actions, and an entry per page would dwarf
 *   the audit log. Source changes and findings stay audited as before.
 *
 * Scheduling (spec): first visit as soon as possible; after "fetched",
 * revisit in 24 h; after "not_modified" double the previous interval up to
 * 14 days; after "error" back off 1 h, 6 h, 24 h and mark the page dead
 * after 5 failures; "gone" is dead. "blocked" (robots or a 401/403 answer)
 * is rechecked after 24 h — the spec does not give it a schedule. A
 * permanent fetch failure (crawler v3 review fix, WP13: `error` carrying
 * `failure: "permanent"`) backs off like any error on the first attempt and
 * is remembered on the row (`lastPermanentFailAt`); the row dies only on a
 * permanent failure at least 24 h after the first one, and a successful
 * visit clears the marker.
 *
 * Crawl order (crawler v3 WP11): every row carries a priority, lower runs
 * first, and the claim sorts by priority, then nextDueAt. A reported link
 * sets the priority of the row it stores (sitemap 10, feed 20, pagination
 * 30, other pages 50 plus 10 per depth level, capped at the default 100);
 * a sitemap link whose lastmod is newer than the row's last fetch sets 5
 * and makes the row due immediately. Rows stored before WP11 keep 100.
 */

/** How long a claimed row is withheld from other claims. */
export const FRONTIER_CLAIM_MS = 30 * 60 * 1000;
/** Revisit interval after a fetched page (spec: 24 h). */
export const FRONTIER_REVISIT_MS = 24 * 60 * 60 * 1000;
/** Ceiling for the doubling interval after not_modified (spec: 14 days). */
export const FRONTIER_MAX_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
/** Backoff after 1st, 2nd, 3rd+ error (spec: 1 h, 6 h, 24 h). */
export const FRONTIER_ERROR_BACKOFF_MS = [60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000] as const;
/** A page is dead after this many error reports (spec: 5 failures). */
export const FRONTIER_MAX_FAILURES = 5;
/** Recheck interval after a blocked page (spec gives none; see header). */
export const FRONTIER_BLOCKED_REVISIT_MS = 24 * 60 * 60 * 1000;
/**
 * The permanent-failure window (crawler v3 review fix, WP13): a row that
 * failed permanently is marked dead only on the next permanent failure at
 * least this long after the first one. One bad resolver answer or one bad
 * hour never kills a page.
 */
export const FRONTIER_PERMANENT_FAIL_MS = 24 * 60 * 60 * 1000;
/**
 * The priority every row keeps until a report says otherwise (crawler v3
 * WP11): lower runs first, so the default runs last.
 */
export const FRONTIER_PRIORITY_DEFAULT = 100;
/** A sitemap entry whose lastmod is newer than the row's last fetch (WP11). */
export const FRONTIER_PRIORITY_LASTMOD = 5;

/** Server-side caps, mirrored in the route schemas. */
export const FRONTIER_CLAIM_LIMIT_MAX = 200;
export const FRONTIER_LINKS_PER_PAGE_MAX = 500;
/** Canonical aliases one reported page may carry (crawler v3 WP10). */
export const FRONTIER_ALIASES_PER_PAGE_MAX = 20;
/** A report carries at most one entry per claimed page, so the claim cap. */
export const FRONTIER_REPORT_PAGES_MAX = FRONTIER_CLAIM_LIMIT_MAX;
const MAX_PAGE_URL_LENGTH = 2048;
/** Link inserts are chunked to stay well inside Postgres parameter limits. */
const LINK_INSERT_CHUNK = 500;

/**
 * A memory-store frontier row with the columns added by the crawler v3
 * review fixes. The memory store's own type (crawl-store.ts) predates them;
 * the fields are optional so rows created elsewhere still fit, and absent
 * means the column default (false / null).
 */
type FrontierMemoryPage = MemoryCrawlPage & { viaPagination?: boolean };

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Request schemas (strict; the routes refuse anything else with 400)

const sourceIdField = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const frontierClaimSchema = z
  .object({
    sourceId: sourceIdField,
    limit: z.number().int().min(1).max(FRONTIER_CLAIM_LIMIT_MAX),
  })
  .strict();

export type FrontierClaimBody = z.infer<typeof frontierClaimSchema>;

export const frontierReportPageSchema = z
  .object({
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    status: z.enum(["fetched", "not_modified", "gone", "blocked", "error"]),
    etag: z.string().min(1).max(512).optional(),
    lastModified: z.string().min(1).max(512).optional(),
    // Crawler v3 review fix (WP13): an `error` whose fetch failed
    // permanently (a DNS name that does not exist, a definite TLS
    // certificate failure). The row is marked dead only on a permanent
    // failure at least 24 h after the first one; until then it is an
    // ordinary error backoff. Optional on both sides, only with status
    // `error` — anything else skips the whole entry, like every malformed
    // one.
    failure: z.literal("permanent").optional(),
    // Canonical aliases (crawler v3 WP10, review fix): the <link
    // rel="canonical"> targets of the fetched page, in scope. A row for an
    // alias that was never fetched and is not a seed is retired; a fetched
    // row or a depth-0 seed is never touched, no placeholder row is ever
    // inserted, and aliases from pages reached via pagination are ignored.
    aliases: z
      .array(z.string().min(10).max(MAX_PAGE_URL_LENGTH))
      .max(FRONTIER_ALIASES_PER_PAGE_MAX)
      .optional(),
    links: z
      .array(
        z
          .object({
            url: z.string().min(10).max(MAX_PAGE_URL_LENGTH),
            kind: z.enum(["page", "sitemap", "feed"]),
            // Crawler v3 WP11: a pagination link runs before plain pages
            // (priority 30), and a sitemap link may carry the entry's
            // <lastmod> as a strict ISO date — an entry newer than the
            // row's last fetch jumps the queue. Optional on both sides.
            pagination: z.boolean().optional(),
            lastmod: z.iso.datetime({ offset: true }).optional(),
          })
          .strict(),
      )
      .max(FRONTIER_LINKS_PER_PAGE_MAX),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (page.failure !== undefined && page.status !== "error") {
      ctx.addIssue({ code: "custom", path: ["failure"], message: "only with status error" });
    }
  });

export const frontierReportSchema = z
  .object({
    sourceId: sourceIdField,
    runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
    // Checked per item (like findings), so one bad page entry is skipped
    // without losing the others. Envelope-level page count still applies.
    pages: z.array(z.unknown()).min(0).max(FRONTIER_REPORT_PAGES_MAX),
  })
  .strict();

export type FrontierReportBody = z.infer<typeof frontierReportSchema>;
export type ReportedPage = z.infer<typeof frontierReportPageSchema>;

// ---------------------------------------------------------------------------
// URL key and digest

/**
 * The dedup key of a page URL: the shared WP10 normalisation
 * (crawl-page-key.ts — https, one leading `www.` dropped, directory index and
 * non-root trailing slash dropped, tracking parameters dropped and the rest
 * sorted), the same identity the crawler computes, so a page the two sides
 * spell differently is still stored once. The key is only ever a dedup
 * identity: the stored URL stays exactly as reported, and rows stored before
 * this rule keep their stored digest.
 */
export function crawlPageKey(rawUrl: string): string | null {
  return pageKey(rawUrl);
}

/** The per-source dedup digest of a page URL (never reversible, never logged). */
export function crawlPageDigest(sourceId: string, url: string): string | null {
  const key = crawlPageKey(url);
  if (key === null) return null;
  return keyDigest(sourceId, key);
}

/** The per-source digest of an already computed key (new or legacy form). */
function keyDigest(sourceId: string, key: string): string {
  return sha256(`crawl-page\u0000${sourceId}\u0000${key}`);
}

/**
 * The legacy digests (rows stored before crawler v3 WP10) of every spelling
 * that shares this URL's page key, the new digest itself excluded. Exported
 * for the frontier tests; see crawl-page-key.ts `legacyPageKeys`.
 */
export function crawlPageLegacyDigests(sourceId: string, url: string): string[] {
  const current = crawlPageDigest(sourceId, url);
  return legacyPageKeys(url).map((key) => keyDigest(sourceId, key)).filter((d) => d !== current);
}

/**
 * The priority a reported link stores its row with (crawler v3 WP11): the
 * useful pages run first — sitemap 10, feed 20, pagination 30, other pages
 * 50 plus 10 per depth level, capped at the default 100. Lower runs first.
 */
export function linkPriority(link: { kind: "page" | "sitemap" | "feed"; pagination?: boolean }, depth: number): number {
  if (link.kind === "sitemap") return 10;
  if (link.kind === "feed") return 20;
  if (link.pagination === true) return 30;
  return Math.min(50 + 10 * Math.max(depth, 0), FRONTIER_PRIORITY_DEFAULT);
}

// ---------------------------------------------------------------------------
// Shared helpers

type SourceRow = { id: string; domain: string; pageBudget: number; enabled: boolean };

async function sourceRow(sourceId: string): Promise<SourceRow | null> {
  if (isDevNoDb()) return crawlMemory().sources.get(sourceId) ?? null;
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "domain", "pageBudget", "enabled"])
      .where("id", "=", sourceId).executeTakeFirst();
    return row ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.crawlSource.findUnique({ where: { id: sourceId }, select: { id: true, domain: true, pageBudget: true, enabled: true } });
}

/** Start of the UTC day `now` falls in: the budget window (spec: per day). */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * What a claim may still hand out today: the page budget minus the pages
 * fetched since the start of the UTC day minus the rows already out with a
 * crawler (claimed, claim not expired) that were not fetched today. The
 * claimed rows count because their fetch will count when reported: without
 * them, two crawler processes could each claim the full budget. A claimed
 * row already fetched today (an error retry keeps its lastFetchedAt) is
 * counted once, as fetched. Pure; the counts come from the callers below,
 * read inside the claim transaction while the source row is locked.
 */
function remainingBudget(pageBudget: number, fetchedToday: number, outstanding: number): number {
  return pageBudget - fetchedToday - outstanding;
}

function memoryBudgetCounts(sourceId: string, now: Date): { fetchedToday: number; outstanding: number } {
  const dayStart = startOfUtcDay(now);
  let fetchedToday = 0;
  let outstanding = 0;
  for (const page of crawlMemory().pages.values()) {
    if (page.sourceId !== sourceId) continue;
    const fetched = page.lastFetchedAt !== null && page.lastFetchedAt >= dayStart;
    if (fetched) fetchedToday++;
    else if (page.claimedUntil && page.claimedUntil > now) outstanding++;
  }
  return { fetchedToday, outstanding };
}

/** Whether the source has any frontier rows yet (the seed is created on first claim). */
async function hasPages(sourceId: string): Promise<boolean> {
  if (isDevNoDb()) {
    for (const page of crawlMemory().pages.values()) if (page.sourceId === sourceId) return true;
    return false;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlPage").select("id")
      .where("sourceId", "=", sourceId).limit(1).executeTakeFirst();
    return row !== undefined;
  }
  const { db } = await import("@/lib/db");
  return (await db.crawlPage.count({ where: { sourceId } })) > 0;
}

type SeedInsert = { id: string; sourceId: string; urlEncrypted: string; urlDigest: string };

/** The seed row of a source: https://<domain>/ (spec), due immediately. */
function seedRow(source: SourceRow): SeedInsert | null {
  const url = `https://${source.domain}/`;
  const digest = crawlPageDigest(source.id, url);
  if (digest === null) return null;
  return { id: randomUUID(), sourceId: source.id, urlEncrypted: encryptField(url), urlDigest: digest };
}

// ---------------------------------------------------------------------------
// Claim

export type ClaimedCrawlPage = {
  id: string;
  url: string;
  depth: number;
  etag: string | null;
  lastModified: string | null;
};

type DueRow = {
  id: string;
  urlEncrypted: string;
  depth: number;
  etag: string | null;
  lastModified: string | null;
};

/**
 * The next due pages of one source, claimed for FRONTIER_CLAIM_MS. The daily
 * budget applies: once pageBudget pages were fetched today (lastFetchedAt
 * within the UTC day) or are out with a crawler, nothing more is handed out,
 * and a claim never crosses the remaining budget (claimDue). If the source has no rows yet, the seed row
 * (https://<domain>/) is created first, so the first run starts at the home
 * page. Unknown or disabled sources, and sources whose host is on the
 * never-crawl list, claim nothing (the crawler treats an empty batch as
 * "source done").
 */
export async function claimCrawlPages(sourceId: string, limit: number, now = new Date()): Promise<ClaimedCrawlPage[]> {
  const source = await sourceRow(sourceId);
  if (!source || !source.enabled) return [];
  // A blocked host (never-crawl list, including a parent domain) hands out
  // nothing, even if its source is still switched on (review fix).
  if (await isBlockedCrawlHost(source.domain)) return [];
  if (await hasPages(sourceId)) {
    return claimDue(source, Math.min(limit, FRONTIER_CLAIM_LIMIT_MAX), now);
  }
  const seed = seedRow(source);
  if (seed) await insertSeed(seed);
  return claimDue(source, Math.min(limit, FRONTIER_CLAIM_LIMIT_MAX), now);
}

/**
 * Selects due rows and marks them claimed, as one transaction on the
 * database paths. The source row is locked first (SELECT ... FOR UPDATE), so
 * concurrent claims for one source run their budget arithmetic one after the
 * other and each sees the rows the previous one claimed; claims for other
 * sources are not blocked. The page rows are still taken FOR UPDATE SKIP
 * LOCKED.
 */
async function claimDue(source: SourceRow, limit: number, now: Date): Promise<ClaimedCrawlPage[]> {
  const claimedUntil = new Date(now.getTime() + FRONTIER_CLAIM_MS);
  const dayStart = startOfUtcDay(now);

  if (isDevNoDb()) {
    // Single-threaded: the count and the claim cannot interleave.
    const { fetchedToday, outstanding } = memoryBudgetCounts(source.id, now);
    const take = Math.min(limit, remainingBudget(source.pageBudget, fetchedToday, outstanding));
    if (take <= 0) return [];
    const memory = crawlMemory();
    const due = [...memory.pages.values()]
      .filter(
        (p) =>
          p.sourceId === source.id &&
          p.nextDueAt <= now &&
          p.status !== "DEAD" &&
          p.status !== "GONE" &&
          (!p.claimedUntil || p.claimedUntil < now),
      )
      // Crawl order (WP11): lowest priority first, then the longest-due.
      .sort((a, b) => a.priority - b.priority || a.nextDueAt.getTime() - b.nextDueAt.getTime())
      .slice(0, take);
    return due.map((row) => {
      row.claimedUntil = claimedUntil;
      return {
        id: row.id,
        url: decryptField(row.urlEncrypted),
        depth: row.depth,
        etag: row.etag,
        lastModified: row.lastModified,
      };
    });
  }

  if (usesWorkerKysely()) {
    return getWorkerDb().transaction().execute(async (trx) => {
      // Serialises claims of this source until commit; re-reads the budget
      // and the switch under the lock.
      const locked = await trx.selectFrom("CrawlSource").select(["id", "pageBudget", "enabled"])
        .where("id", "=", source.id).forUpdate().executeTakeFirst();
      if (!locked || !locked.enabled) return [];
      const fetched = await trx.selectFrom("CrawlPage")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("sourceId", "=", source.id).where("lastFetchedAt", ">=", dayStart)
        .executeTakeFirst();
      const out = await trx.selectFrom("CrawlPage")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("sourceId", "=", source.id).where("claimedUntil", ">", now)
        .where((eb) => eb.or([eb("lastFetchedAt", "is", null), eb("lastFetchedAt", "<", dayStart)]))
        .executeTakeFirst();
      const take = Math.min(limit, remainingBudget(locked.pageBudget, Number(fetched?.count ?? 0), Number(out?.count ?? 0)));
      if (take <= 0) return [];
      // FOR UPDATE SKIP LOCKED: two crawler instances (or two Workers) never
      // get the same row; a concurrent claim simply takes the next ones.
      // Crawl order (WP11): lowest priority first, then the longest-due.
      const rows = await trx.selectFrom("CrawlPage")
        .select(["id", "urlEncrypted", "depth", "etag", "lastModified"])
        .where("sourceId", "=", source.id)
        .where("nextDueAt", "<=", now)
        .where("status", "not in", ["DEAD", "GONE"])
        .where((eb) => eb.or([eb("claimedUntil", "is", null), eb("claimedUntil", "<", now)]))
        .orderBy("priority", "asc")
        .orderBy("nextDueAt", "asc")
        .limit(take)
        .forUpdate()
        .skipLocked()
        .execute();
      if (rows.length > 0) {
        await trx.updateTable("CrawlPage").set({ claimedUntil })
          .where("id", "in", rows.map((r) => r.id)).execute();
      }
      return rows.map(toClaimed);
    });
  }

  const { db } = await import("@/lib/db");
  return db.$transaction(async (tx) => {
    // Serialises claims of this source until commit (see above).
    await tx.$executeRaw`SELECT "id" FROM "CrawlSource" WHERE "id" = ${source.id} FOR UPDATE`;
    const locked = await tx.crawlSource.findUnique({ where: { id: source.id }, select: { pageBudget: true, enabled: true } });
    if (!locked || !locked.enabled) return [];
    const fetchedToday = await tx.crawlPage.count({ where: { sourceId: source.id, lastFetchedAt: { gte: dayStart } } });
    const outstanding = await tx.crawlPage.count({
      where: { sourceId: source.id, claimedUntil: { gt: now }, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: dayStart } }] },
    });
    const take = Math.min(limit, remainingBudget(locked.pageBudget, fetchedToday, outstanding));
    if (take <= 0) return [];
    const rows = await tx.$queryRaw<DueRow[]>`
      SELECT "id", "urlEncrypted", "depth", "etag", "lastModified" FROM "CrawlPage"
      WHERE "sourceId" = ${source.id}
        AND "nextDueAt" <= ${now}
        AND "status" NOT IN ('DEAD', 'GONE')
        AND ("claimedUntil" IS NULL OR "claimedUntil" < ${now})
      ORDER BY "priority" ASC, "nextDueAt" ASC LIMIT ${take}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length > 0) {
      await tx.crawlPage.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { claimedUntil } });
    }
    return rows.map(toClaimed);
  });
}

function toClaimed(row: DueRow): ClaimedCrawlPage {
  return {
    id: row.id,
    url: decryptField(row.urlEncrypted),
    depth: row.depth,
    etag: row.etag,
    lastModified: row.lastModified,
  };
}

async function insertSeed(seed: SeedInsert): Promise<void> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const exists = [...memory.pages.values()].some((p) => p.sourceId === seed.sourceId && p.urlDigest === seed.urlDigest);
    if (!exists) {
      memory.pages.set(seed.id, {
        id: seed.id, sourceId: seed.sourceId, urlEncrypted: seed.urlEncrypted, urlDigest: seed.urlDigest,
        depth: 0, kind: "PAGE", priority: FRONTIER_PRIORITY_DEFAULT, etag: null, lastModified: null, status: "PENDING",
        claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: new Date(),
      });
    }
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("CrawlPage").values({
      id: seed.id, sourceId: seed.sourceId, urlEncrypted: seed.urlEncrypted, urlDigest: seed.urlDigest,
      depth: 0, kind: "PAGE", status: "PENDING", nextDueAt: new Date(0),
    }).onConflict((oc) => oc.columns(["sourceId", "urlDigest"]).doNothing()).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  try {
    await db.crawlPage.create({ data: { id: seed.id, sourceId: seed.sourceId, urlEncrypted: seed.urlEncrypted, urlDigest: seed.urlDigest, nextDueAt: new Date(0) } });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err; // a concurrent first claim won the insert
  }
}

// ---------------------------------------------------------------------------
// Report

export type PageUpdatePlan = {
  status: MemoryCrawlPage["status"];
  nextDueAt: Date;
  lastFetchedAt: Date | null;
  failCount: number;
  etag: string | null;
  lastModified: string | null;
  /**
   * The first permanent failure this row remembers (crawler v3 review fix,
   * WP13), or null once it visits successfully again.
   */
  lastPermanentFailAt: Date | null;
};

/**
 * The next scheduling step for one reported page, from the row's current
 * state (spec: 24 h after fetched; doubling after not_modified, capped at
 * 14 days; 1 h / 6 h / 24 h after error, dead after 5 failures; gone is
 * dead; blocked rechecked after 24 h). A permanent failure (review fix,
 * WP13) is an error like any other on the first attempt — the row remembers
 * it — and dies only on a permanent failure at least 24 h after the first.
 */
export type SchedulablePage = {
  nextDueAt: Date;
  lastFetchedAt: Date | null;
  failCount: number;
  etag: string | null;
  lastModified: string | null;
  /** The row's first permanent failure, when it has had one (review fix, WP13). */
  lastPermanentFailAt?: Date | null;
};

export function planNextVisit(
  row: SchedulablePage,
  report: { status: ReportedPage["status"]; etag?: string; lastModified?: string; failure?: "permanent" },
  now: Date,
): PageUpdatePlan {
  // A missing validator keeps the stored one: an absent field means "no new
  // validator was seen", never "clear the old one".
  const etag = report.etag ?? row.etag;
  const lastModified = report.lastModified ?? row.lastModified;
  const remembered = row.lastPermanentFailAt ?? null;
  switch (report.status) {
    case "fetched":
      return { status: "FETCHED", nextDueAt: new Date(now.getTime() + FRONTIER_REVISIT_MS), lastFetchedAt: now, failCount: 0, etag, lastModified, lastPermanentFailAt: null };
    case "not_modified": {
      // The interval that was in effect for this visit (24 h after a fetch;
      // the seed's first visit cannot be not_modified, but stay bounded).
      const previous = row.lastFetchedAt ? Math.max(row.nextDueAt.getTime() - row.lastFetchedAt.getTime(), 0) : FRONTIER_REVISIT_MS;
      const interval = Math.min(Math.max(previous * 2, FRONTIER_REVISIT_MS), FRONTIER_MAX_INTERVAL_MS);
      return { status: "NOT_MODIFIED", nextDueAt: new Date(now.getTime() + interval), lastFetchedAt: now, failCount: 0, etag, lastModified, lastPermanentFailAt: null };
    }
    case "gone":
      return { status: "GONE", nextDueAt: now, lastFetchedAt: now, failCount: row.failCount, etag, lastModified, lastPermanentFailAt: remembered };
    case "blocked":
      return { status: "BLOCKED", nextDueAt: new Date(now.getTime() + FRONTIER_BLOCKED_REVISIT_MS), lastFetchedAt: row.lastFetchedAt, failCount: row.failCount, etag, lastModified, lastPermanentFailAt: remembered };
    case "error": {
      const failCount = row.failCount + 1;
      // Review fix (WP13): the first permanent failure backs off like any
      // error and is remembered; a permanent failure at least 24 h after
      // the first kills the row without waiting for five retries.
      const permanentAgain =
        report.failure === "permanent" && remembered !== null && now.getTime() - remembered.getTime() >= FRONTIER_PERMANENT_FAIL_MS;
      if (failCount >= FRONTIER_MAX_FAILURES || permanentAgain) {
        return { status: "DEAD", nextDueAt: row.nextDueAt, lastFetchedAt: row.lastFetchedAt, failCount, etag, lastModified, lastPermanentFailAt: remembered };
      }
      const backoff = FRONTIER_ERROR_BACKOFF_MS[Math.min(failCount, FRONTIER_ERROR_BACKOFF_MS.length) - 1]!;
      return {
        status: "ERROR",
        nextDueAt: new Date(now.getTime() + backoff),
        lastFetchedAt: row.lastFetchedAt,
        failCount,
        etag,
        lastModified,
        // The FIRST permanent failure is the one remembered: a second
        // inside the window moves nothing, so the 24 h is measured from
        // the first, never sliding.
        lastPermanentFailAt: report.failure === "permanent" ? (remembered ?? now) : remembered,
      };
    }
  }
}

/**
 * A page address the crawler may store, or why not. The same rules as a
 * finding's page: an explicit http(s) URL of bounded length with no
 * credentials, no non-default port, and a host on the source's domain or a
 * subdomain of it. The scope check the crawler does is repeated here.
 */
function acceptableLink(rawUrl: string, sourceDomain: string): string | null {
  const url = rawUrl.trim();
  if (url.length === 0 || url.length > MAX_PAGE_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!crawlerShapedUrl(url)) return null;
  return pageOnSourceHost(parsed.toString(), sourceDomain) ? parsed.toString() : null;
}

type NewLinkRow = {
  id: string;
  sourceId: string;
  urlEncrypted: string;
  urlDigest: string;
  depth: number;
  kind: "PAGE" | "SITEMAP" | "FEED";
  /** Crawl order (crawler v3 WP11). */
  priority: number;
  /** Stored from a pagination link (review fix: its canonical aliases are ignored). */
  viaPagination: boolean;
};

/**
 * Applies one crawler report: updates each claimed page's schedule, stores
 * the new in-scope links it found (deduplicated per source on the keyed
 * digest, at the reporting page's depth + 1) and counts visited pages
 * against the source's progress counters. Canonical aliases (WP10, review
 * fix): a row for an alias digest that has never been fetched and is not a
 * depth-0 seed is retired (dead: its content is the reporting page's), and
 * a link that arrives in the same report as its alias is not stored. An
 * alias never kills a fetched row or a seed (paginated pages naming page 1,
 * a site-wide canonical to the home page), never inserts a placeholder row,
 * and aliases reported by a page that was reached via pagination, or that
 * name a row this same report moved, are ignored. `accepted` counts the
 * page rows the report moved; skipped entries
 * are unknown ids, rows of another source, dead rows (a late duplicate
 * cannot resurrect them) or malformed entries.
 */
export async function reportCrawlPages(
  sourceId: string,
  runId: string,
  pages: unknown[],
  now = new Date(),
): Promise<{ accepted: number }> {
  const source = await sourceRow(sourceId);
  if (!source) return { accepted: 0 };

  // Validate every entry first; a malformed one is skipped, not fatal.
  const entries: ReportedPage[] = [];
  for (const page of pages) {
    const checked = frontierReportPageSchema.safeParse(page);
    if (checked.success) entries.push(checked.data);
  }

  const current = await pageRows(sourceId, entries.map((page) => page.id));
  const updates: Array<{ id: string; plan: PageUpdatePlan }> = [];
  const links = new Map<string, NewLinkRow>(); // digest -> row (dedups the report itself)
  /** Alias digests of this report: never-fetched, non-seed rows for them are retired. */
  const aliasDigests = new Set<string>();
  /** The accepted URL behind each alias and link digest (for the legacy-key lookup). */
  const linkUrls = new Map<string, string>();
  let accepted = 0;

  // Pass 1: the aliases. They win over links, so they are collected before
  // any link row is built. A page reached via pagination names page 1 (or
  // the listing) as canonical by convention: its aliases are ignored.
  for (const page of entries) {
    const row = current.get(page.id);
    if (!row || row.status === "DEAD" || row.status === "GONE" || row.viaPagination) continue;
    for (const raw of page.aliases ?? []) {
      const url = acceptableLink(raw, source.domain);
      if (url === null) continue;
      const digest = crawlPageDigest(sourceId, url);
      // Self-alias (a page naming itself canonical) changes nothing.
      if (digest === null || digest === row.urlDigest) continue;
      aliasDigests.add(digest);
      linkUrls.set(digest, url);
    }
  }
  // A row this report moves is a page the crawler just visited: never an alias victim.
  for (const row of current.values()) aliasDigests.delete(row.urlDigest);

  /** Reported sitemap lastmods by link digest (crawler v3 WP11). */
  const lastmodByDigest = new Map<string, Date>();

  // Pass 2: the page updates and the link rows (an alias digest never
  // becomes a live row, whatever page reported it).
  for (const page of entries) {
    const row = current.get(page.id);
    // Dead rows are final; a report for another source's row is not ours.
    if (!row || row.status === "DEAD" || row.status === "GONE") continue;
    const plan = planNextVisit(row, page, now);
    updates.push({ id: page.id, plan });
    accepted++;
    for (const link of page.links ?? []) {
      const url = acceptableLink(link.url, source.domain);
      if (url === null) continue;
      const digest = crawlPageDigest(sourceId, url);
      if (digest === null || links.has(digest) || aliasDigests.has(digest)) continue;
      links.set(digest, {
        id: randomUUID(),
        sourceId,
        urlEncrypted: encryptField(url),
        urlDigest: digest,
        depth: row.depth + 1,
        kind: link.kind === "page" ? "PAGE" : link.kind === "sitemap" ? "SITEMAP" : "FEED",
        priority: linkPriority(link, row.depth + 1),
        viaPagination: link.pagination === true,
      });
      linkUrls.set(digest, url);
      if (link.lastmod !== undefined && !lastmodByDigest.has(digest)) lastmodByDigest.set(digest, new Date(link.lastmod));
    }
  }

  // Crawler v3 WP11: a reported sitemap link whose lastmod is newer than
  // the row's last fetch jumps the queue — priority 5, due now. A row this
  // same report moved was just fetched, so it keeps its fresh schedule; a
  // dead row is final; a row never fetched has no last fetch to compare
  // and is due anyway, so it keeps the priority its link stored.
  //
  // Rows stored before WP10 (review fix) carry the digest of the LEGACY key
  // (crawl-page-key.ts): a link spelled differently from such a row (https
  // for http, bare for www., no trailing slash, no index document) has a new
  // digest no row carries, so it would insert a duplicate live row. Every
  // link is therefore also looked up by the legacy digests of all its
  // spellings, in the same read as the lastmod check: a link whose page
  // already has a legacy row is not inserted (and a lastmod bump reaches
  // that row), and an alias reaches a legacy row too.
  const legacyToNew = new Map<string, string>();
  for (const [newDigest, url] of linkUrls) {
    if (!links.has(newDigest) && !aliasDigests.has(newDigest)) continue;
    for (const key of legacyPageKeys(url)) {
      const legacy = keyDigest(sourceId, key);
      if (legacy !== newDigest && !legacyToNew.has(legacy)) legacyToNew.set(legacy, newDigest);
    }
  }
  const reportedIds = new Set(updates.map((u) => u.id));
  const bumps: Array<{ id: string }> = [];
  if (lastmodByDigest.size > 0 || legacyToNew.size > 0) {
    const rows = await rowsByDigest(sourceId, [...new Set([...lastmodByDigest.keys(), ...legacyToNew.keys()])]);
    for (const row of rows.values()) {
      const newDigest = legacyToNew.get(row.urlDigest);
      if (newDigest !== undefined) {
        // The page already has a row under its legacy key: no second row.
        links.delete(newDigest);
        if (aliasDigests.has(newDigest) && !reportedIds.has(row.id)) aliasDigests.add(row.urlDigest);
      }
      if (reportedIds.has(row.id) || row.status === "DEAD" || row.status === "GONE") continue;
      const lastmod = lastmodByDigest.get(row.urlDigest) ?? (newDigest !== undefined ? lastmodByDigest.get(newDigest) : undefined);
      if (lastmod === undefined || row.lastFetchedAt === null) continue;
      if (lastmod.getTime() > row.lastFetchedAt.getTime()) bumps.push({ id: row.id });
    }
  }

  await applyReport(sourceId, updates, [...aliasDigests], [...links.values()], bumps, accepted, now);
  return { accepted };
}

/** The current rows for the reported page ids, in one read. */
async function pageRows(sourceId: string, ids: string[]): Promise<Map<string, CurrentRow>> {
  if (ids.length === 0) return new Map();
  const wanted = [...new Set(ids)];
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const map = new Map<string, CurrentRow>();
    for (const id of wanted) {
      const page = memory.pages.get(id);
      if (page && page.sourceId === sourceId) map.set(id, page);
    }
    return map;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlPage")
      .select(["id", "status", "nextDueAt", "lastFetchedAt", "failCount", "etag", "lastModified", "depth", "urlDigest", "viaPagination", "lastPermanentFailAt"])
      .where("sourceId", "=", sourceId).where("id", "in", wanted).execute();
    return new Map(rows.map((row) => [row.id, row as CurrentRow]));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlPage.findMany({
    where: { sourceId, id: { in: wanted } },
    select: { id: true, status: true, nextDueAt: true, lastFetchedAt: true, failCount: true, etag: true, lastModified: true, depth: true, urlDigest: true, viaPagination: true, lastPermanentFailAt: true },
  });
  return new Map(rows.map((row) => [row.id, row as unknown as CurrentRow]));
}

/** What the scheduling needs from one current row, plus its depth and digest. */
type CurrentRow = SchedulablePage & { id: string; status: MemoryCrawlPage["status"]; depth: number; urlDigest: string; viaPagination?: boolean };

/**
 * The rows for the given link digests, keyed by digest — what the WP11
 * lastmod check needs. One chunked read per path; rows that do not exist
 * (the link is new) are simply absent.
 */
async function rowsByDigest(sourceId: string, digests: string[]): Promise<Map<string, CurrentRow>> {
  const out = new Map<string, CurrentRow>();
  for (let i = 0; i < digests.length; i += LINK_INSERT_CHUNK) {
    const chunk = digests.slice(i, i + LINK_INSERT_CHUNK);
    if (isDevNoDb()) {
      const memory = crawlMemory();
      const wanted = new Set(chunk);
      for (const page of memory.pages.values()) {
        if (page.sourceId === sourceId && wanted.has(page.urlDigest)) out.set(page.urlDigest, page);
      }
      continue;
    }
    if (usesWorkerKysely()) {
      const rows = await getWorkerDb().selectFrom("CrawlPage")
        .select(["id", "status", "nextDueAt", "lastFetchedAt", "failCount", "etag", "lastModified", "depth", "urlDigest", "viaPagination"])
        .where("sourceId", "=", sourceId).where("urlDigest", "in", chunk).execute();
      for (const row of rows) out.set(row.urlDigest, row as CurrentRow);
      continue;
    }
    const { db } = await import("@/lib/db");
    const rows = await db.crawlPage.findMany({
      where: { sourceId, urlDigest: { in: chunk } },
      select: { id: true, status: true, nextDueAt: true, lastFetchedAt: true, failCount: true, etag: true, lastModified: true, depth: true, urlDigest: true, viaPagination: true },
    });
    for (const row of rows) out.set(row.urlDigest, row as unknown as CurrentRow);
  }
  return out;
}

/**
 * Writes the planned updates, the alias retirements, the new link rows, the
 * WP11 lastmod bumps and the source counters. Alias digests (WP10, review
 * fix) retire only rows that were never fetched and are not a depth-0 seed;
 * a fetched row or a seed is never touched by an alias, and no placeholder
 * row is inserted for an alias that has no row.
 */
async function applyReport(
  sourceId: string,
  updates: Array<{ id: string; plan: PageUpdatePlan }>,
  aliasDigests: string[],
  links: NewLinkRow[],
  /** Rows whose reported lastmod jumps the queue: priority 5, due now (WP11). */
  bumps: Array<{ id: string }>,
  accepted: number,
  now: Date,
): Promise<void> {
  // Visited pages (fetched, not_modified, gone) move the progress counters;
  // blocked and error pages were not fetched, so they do not.
  const visited = updates.filter((u) => u.plan.lastFetchedAt !== null).length;
  // The per-day counter (CrawlSourceDay) the discovered-site pause reads:
  // a revisit overwrites lastFetchedAt, the counter keeps each day's total.
  const day = startOfUtcDay(now);
  if (isDevNoDb()) {
    const memory = crawlMemory();
    for (const { id, plan } of updates) {
      const row = memory.pages.get(id)!;
      Object.assign(row, {
        status: plan.status, nextDueAt: plan.nextDueAt, lastFetchedAt: plan.lastFetchedAt, failCount: plan.failCount,
        etag: plan.etag, lastModified: plan.lastModified, claimedUntil: null, lastPermanentFailAt: plan.lastPermanentFailAt,
      });
    }
    // A newer-than-last-fetch lastmod jumps the queue (WP11): due now.
    for (const bump of bumps) {
      const row = memory.pages.get(bump.id);
      if (!row || row.sourceId !== sourceId || row.status === "DEAD" || row.status === "GONE") continue;
      row.priority = FRONTIER_PRIORITY_LASTMOD;
      row.nextDueAt = now;
    }
    // Retire never-fetched, non-seed rows for the report's aliases (WP10).
    for (const row of memory.pages.values()) {
      if (row.sourceId !== sourceId || !aliasDigests.includes(row.urlDigest)) continue;
      if (row.lastFetchedAt !== null || row.depth === 0) continue; // a fetched row or a seed is never an alias victim
      if (row.status !== "DEAD" && row.status !== "GONE") {
        row.status = "DEAD";
        row.nextDueAt = now;
        row.claimedUntil = null;
      }
    }
    const rowsOfSource = [...memory.pages.values()].filter((p) => p.sourceId === sourceId);
    let room = maxFrontierPagesPerSource() - rowsOfSource.length;
    const insert = (row: NewLinkRow): void => {
      if (rowsOfSource.some((p) => p.urlDigest === row.urlDigest)) return;
      if (room <= 0) return; // the source's frontier is full
      room -= 1;
      const page: FrontierMemoryPage = {
        id: row.id, sourceId: row.sourceId, urlEncrypted: row.urlEncrypted, urlDigest: row.urlDigest,
        depth: row.depth, kind: row.kind, priority: row.priority, viaPagination: row.viaPagination, etag: null, lastModified: null, status: "PENDING",
        claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: now,
      };
      memory.pages.set(row.id, page);
    };
    for (const link of links) insert(link);
    if (accepted > 0) {
      const source = memory.sources.get(sourceId);
      if (source) {
        source.pagesCrawled += visited;
        source.lastCrawledAt = now;
      }
    }
    if (visited > 0) {
      const key = sourceDayKey(sourceId, day);
      memory.sourceDays.set(key, (memory.sourceDays.get(key) ?? 0) + visited);
    }
    return;
  }

  if (usesWorkerKysely()) {
    const db = getWorkerDb();
    await db.transaction().execute(async (trx) => {
      for (const { id, plan } of updates) {
        await trx.updateTable("CrawlPage").set({
          status: plan.status, nextDueAt: plan.nextDueAt, lastFetchedAt: plan.lastFetchedAt,
          failCount: plan.failCount, etag: plan.etag, lastModified: plan.lastModified, claimedUntil: null,
          lastPermanentFailAt: plan.lastPermanentFailAt,
        }).where("id", "=", id).where("sourceId", "=", sourceId).execute();
      }
      // A newer-than-last-fetch lastmod jumps the queue (WP11): due now.
      // The bump reads already filtered dead rows and this same report's
      // pages; the status guard only keeps a concurrent kill final.
      for (let i = 0; i < bumps.length; i += LINK_INSERT_CHUNK) {
        await trx.updateTable("CrawlPage").set({ priority: FRONTIER_PRIORITY_LASTMOD, nextDueAt: now })
          .where("id", "in", bumps.slice(i, i + LINK_INSERT_CHUNK).map((b) => b.id))
          .where("sourceId", "=", sourceId)
          .where("status", "not in", ["DEAD", "GONE"])
          .execute();
      }
      // Retire never-fetched, non-seed rows for the report's aliases (WP10,
      // review fix), digest-chunked; a fetched row or a seed is never touched.
      for (let i = 0; i < aliasDigests.length; i += LINK_INSERT_CHUNK) {
        await trx.updateTable("CrawlPage").set({ status: "DEAD", nextDueAt: now, claimedUntil: null })
          .where("sourceId", "=", sourceId).where("urlDigest", "in", aliasDigests.slice(i, i + LINK_INSERT_CHUNK))
          .where("status", "not in", ["DEAD", "GONE"])
          .where("lastFetchedAt", "is", null)
          .where("depth", ">", 0)
          .execute();
      }
      let cappedLinks = links;
      if (links.length > 0) {
        // Per-source frontier cap: the source row lock serialises concurrent
        // reports of one source, so the count stays true until commit.
        await trx.selectFrom("CrawlSource").select("id").where("id", "=", sourceId).forUpdate().executeTakeFirst();
        const held = await trx.selectFrom("CrawlPage")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .where("sourceId", "=", sourceId).executeTakeFirst();
        const room = Math.max(0, maxFrontierPagesPerSource() - Number(held?.count ?? 0));
        cappedLinks = links.slice(0, room);
      }
      for (let i = 0; i < cappedLinks.length; i += LINK_INSERT_CHUNK) {
        const rows = cappedLinks.slice(i, i + LINK_INSERT_CHUNK).map((row) => ({
          id: row.id, sourceId: row.sourceId, urlEncrypted: row.urlEncrypted, urlDigest: row.urlDigest,
          depth: row.depth, kind: row.kind, priority: row.priority, viaPagination: row.viaPagination, status: "PENDING" as const, nextDueAt: new Date(0),
        }));
        await trx.insertInto("CrawlPage").values(rows)
          .onConflict((oc) => oc.columns(["sourceId", "urlDigest"]).doNothing()).execute();
      }
      if (accepted > 0) {
        await trx.updateTable("CrawlSource")
          .set({ pagesCrawled: (eb) => eb("pagesCrawled", "+", visited), lastCrawledAt: now })
          .where("id", "=", sourceId).execute();
      }
      if (visited > 0) {
        await trx.insertInto("CrawlSourceDay").values({ sourceId, day, pagesFetched: visited })
          .onConflict((oc) => oc.columns(["sourceId", "day"])
            .doUpdateSet({ pagesFetched: sql<number>`"CrawlSourceDay"."pagesFetched" + ${visited}` }))
          .execute();
      }
    });
    return;
  }

  const { db } = await import("@/lib/db");
  await db.$transaction(async (tx) => {
    for (const { id, plan } of updates) {
      await tx.crawlPage.update({
        where: { id },
        data: {
          status: plan.status, nextDueAt: plan.nextDueAt, lastFetchedAt: plan.lastFetchedAt,
          failCount: plan.failCount, etag: plan.etag, lastModified: plan.lastModified, claimedUntil: null,
          lastPermanentFailAt: plan.lastPermanentFailAt,
        },
      });
    }
    // A newer-than-last-fetch lastmod jumps the queue (WP11): due now. The
    // status guard keeps a concurrent kill final (see the Kysely path).
    for (let i = 0; i < bumps.length; i += LINK_INSERT_CHUNK) {
      await tx.crawlPage.updateMany({
        where: {
          id: { in: bumps.slice(i, i + LINK_INSERT_CHUNK).map((b) => b.id) },
          sourceId,
          status: { notIn: ["DEAD", "GONE"] },
        },
        data: { priority: FRONTIER_PRIORITY_LASTMOD, nextDueAt: now },
      });
    }
    // Retire never-fetched, non-seed rows for the report's aliases (WP10,
    // review fix), digest-chunked; a fetched row or a seed is never touched.
    for (let i = 0; i < aliasDigests.length; i += LINK_INSERT_CHUNK) {
      await tx.crawlPage.updateMany({
        where: {
          sourceId, urlDigest: { in: aliasDigests.slice(i, i + LINK_INSERT_CHUNK) }, status: { notIn: ["DEAD", "GONE"] },
          lastFetchedAt: null, depth: { gt: 0 },
        },
        data: { status: "DEAD", nextDueAt: now, claimedUntil: null },
      });
    }
    let cappedLinks = links;
    if (links.length > 0) {
      // Per-source frontier cap, under the source row lock (see above).
      await tx.$executeRaw`SELECT "id" FROM "CrawlSource" WHERE "id" = ${sourceId} FOR UPDATE`;
      const held = await tx.crawlPage.count({ where: { sourceId } });
      const room = Math.max(0, maxFrontierPagesPerSource() - held);
      cappedLinks = links.slice(0, room);
    }
    for (let i = 0; i < cappedLinks.length; i += LINK_INSERT_CHUNK) {
      const chunk = cappedLinks.slice(i, i + LINK_INSERT_CHUNK).map((row) => ({
        id: row.id, sourceId: row.sourceId, urlEncrypted: row.urlEncrypted, urlDigest: row.urlDigest,
        depth: row.depth, kind: row.kind, priority: row.priority, viaPagination: row.viaPagination, status: "PENDING" as const, nextDueAt: new Date(0),
      }));
      await tx.crawlPage.createMany({ data: chunk, skipDuplicates: true });
    }
    if (accepted > 0) {
      await tx.crawlSource.update({
        where: { id: sourceId },
        data: { pagesCrawled: { increment: visited }, lastCrawledAt: now },
      });
    }
    if (visited > 0) {
      await tx.crawlSourceDay.upsert({
        where: { sourceId_day: { sourceId, day } },
        create: { sourceId, day, pagesFetched: visited },
        update: { pagesFetched: { increment: visited } },
      });
    }
  });
}
