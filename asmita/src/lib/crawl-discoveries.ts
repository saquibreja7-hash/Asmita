import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { z } from "zod";
import { writeAuditLogs } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlSource } from "@/lib/crawl-store";
import { hostAndParents, isNeverCrawlHost, normalizeNeverCrawlHost } from "@/lib/crawl-never";
import { blockedHostRows, existingSourceDomains, validateCrawlDomain } from "@/lib/crawl-sources";
import {
  defaultSourceDelayMs,
  discoveredSourcePageBudget,
  maxDiscoveryHops,
  maxNewSitesPerDay,
  reportedSourcePageBudget,
} from "@/lib/crawler-flags";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Automatic discovery of new sites (full-crawler spec WP5). The crawler
 * reports the out-of-scope hosts it saw linked from in-scope pages (hosts
 * only, deduplicated per run, at most 200 per request); these rules decide
 * what becomes a source:
 *
 * - Skipped: a host on the never-crawl list (the built-in list, or a
 *   CrawlBlockedHost row for the host or any parent domain), a host that is
 *   already a source (whatever its origin — nothing is converted or
 *   duplicated), and anything that is not a valid public host name.
 * - Created: a DISCOVERED source with hops = parent.hops + 1, the parent
 *   recorded in discoveredFromId, the CRAWLER_DISCOVERED_PAGE_BUDGET budget
 *   and the default delay. It is enabled automatically while its hops are
 *   within CRAWLER_MAX_DISCOVERY_HOPS; deeper sites are stored disabled with
 *   disabledReason "max_hops". At most CRAWLER_MAX_NEW_SITES_PER_DAY are
 *   auto-enabled per UTC day — the rest are stored disabled with
 *   disabledReason "daily_cap", for an admin to enable.
 * - The reporting parent must exist and be enabled: a disabled or paused
 *   source must not grow the crawl list.
 *
 * Lifecycle of a discovered site:
 *
 * - A match promotes it (crawl-findings.ts calls promoteDiscoveredSource
 *   when a finding under it is stored): hops reset to 0 and the budget raised
 *   to the reported-source budget, because a match proves it is relevant.
 * - The hourly sweep (sweepDiscoveredCrawlSources, wired into the retention
 *   cron) pauses a discovered site whose page budget was spent three UTC
 *   days running without a single finding in that window: switched off for
 *   30 days (pausedUntil, pauseReason "no_match_budget_spent"), then resumed
 *   by the same sweep.
 * - An admin switching a paused or stored-disabled site on clears the
 *   automatic state (crawl-sources.ts updateCrawlSource); the admin owns it
 *   from there on.
 *
 * Hosts only, never URLs: nothing here receives, stores or logs a link, and
 * nothing is fetched (the app never fetches, rule 5 of the spec). The daily
 * auto-enable cap counts DISCOVERED sources that are enabled and were created
 * today; an admin enabling a same-day discovered site therefore counts
 * against it too — the cap can only be reached sooner, never exceeded. On
 * both database paths the count and the insert share one transaction holding
 * CrawlSource exclusively, so two concurrent discovery reports cannot both
 * spend the last slot.
 */

/** How long an unproductive discovered site stays paused (spec: 30 days). */
export const DISCOVERY_PAUSE_MS = 30 * 24 * 60 * 60 * 1000;
/** Budget spent this many days running, without a match, pauses the site (spec: 3). */
export const DISCOVERY_PAUSE_DAYS = 3;
/** The only pause reason there is; shown on the admin page. */
export const PAUSE_REASON_NO_MATCH = "no_match_budget_spent";
/** Why a discovered site was stored disabled at birth. */
export type DiscoveryDisabledReason = "max_hops" | "daily_cap";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Request schema (strict; the route refuses anything else with 400)

export const discoveriesSchema = z
  .object({
    sourceId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
    hosts: z.array(z.string().min(1).max(253)).min(0).max(200),
  })
  .strict();

export type DiscoveriesBody = z.infer<typeof discoveriesSchema>;

/** Start of the UTC day `now` falls in: the daily-cap window. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ---------------------------------------------------------------------------
// Record a discovery report

type ParentRow = { id: string; hops: number; enabled: boolean };

/** The reporting source, only while it exists and is enabled. */
async function discoveryParent(sourceId: string): Promise<ParentRow | null> {
  if (isDevNoDb()) {
    const row = crawlMemory().sources.get(sourceId);
    return row && row.enabled ? { id: row.id, hops: row.hops, enabled: row.enabled } : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "hops", "enabled"])
      .where("id", "=", sourceId).executeTakeFirst();
    return row && row.enabled ? { id: row.id, hops: row.hops, enabled: true } : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.crawlSource.findUnique({ where: { id: sourceId }, select: { id: true, hops: true, enabled: true } });
  return row && row.enabled ? { id: row.id, hops: row.hops, enabled: true } : null;
}

export type DiscoveredHostPlan = {
  host: string;
  hops: number;
  enabled: boolean;
  disabledReason: DiscoveryDisabledReason | null;
};

/**
 * Decides the fate of every reported host, purely: validation, never-crawl,
 * already-a-source and blocked-host filtering, the hop rule, and the daily
 * auto-enable cap against `alreadyEnabledToday`.
 */
export function planDiscoveredHosts(
  hosts: string[],
  parentHops: number,
  alreadyEnabledToday: number,
): DiscoveredHostPlan[] {
  const hops = parentHops + 1;
  const withinHops = hops <= maxDiscoveryHops();
  const cap = maxNewSitesPerDay();
  let autoEnabled = alreadyEnabledToday;
  const seen = new Set<string>();
  const plans: DiscoveredHostPlan[] = [];
  for (const raw of hosts) {
    const host = normalizeNeverCrawlHost(raw);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    if (isNeverCrawlHost(host)) continue;
    const checked = validateCrawlDomain(host);
    if (!checked.ok) continue;
    const enabled = withinHops && autoEnabled < cap;
    if (enabled) autoEnabled += 1;
    plans.push({
      host: checked.domain,
      hops,
      enabled,
      disabledReason: enabled ? null : withinHops ? "daily_cap" : "max_hops",
    });
  }
  return plans;
}

type CreatedSource = { id: string; domain: string; hops: number; enabled: boolean; disabledReason: DiscoveryDisabledReason | null };

/**
 * Applies one discovery report. `accepted` counts the hosts stored as new
 * sources; skipped hosts (never-crawl, already a source, blocked, invalid)
 * are not counted and never fail the request. Only hosts become rows — no
 * link, no page, nothing of the reporting run beyond its id in the audit
 * entry.
 */
export async function recordCrawlDiscoveries(
  sourceId: string,
  runId: string,
  hosts: string[],
  now = new Date(),
  keyId = "",
): Promise<{ accepted: number }> {
  const parent = await discoveryParent(sourceId);
  if (!parent) return { accepted: 0 };

  // One read for the existing sources among the candidates, one for the
  // blocked rows over every host and parent — the same fixed queries the
  // bulk import uses, whatever the list size.
  const candidates = planDiscoveredHosts(hosts, parent.hops, 0).map((plan) => plan.host);
  const existing = candidates.length > 0 ? await existingSourceDomains(candidates) : new Set<string>();
  const blocked = candidates.length > 0 ? await blockedHostRows(candidates) : new Set<string>();
  const plans = planDiscoveredHosts(hosts, parent.hops, 0)
    .filter((plan) => !existing.has(plan.host) && !hostAndParents(plan.host).some((name) => blocked.has(name)));

  const created = plans.length > 0 ? await insertDiscoveredSources(sourceId, plans, now) : [];
  if (created.length > 0) {
    // One batched audit write, like the import. The actor is the service
    // key, as for a recorded finding; no admin and no case is involved.
    await writeAuditLogs(created.map((row) => ({
      eventType: "CRAWL_SOURCE_DISCOVERED" as const,
      entityType: "CrawlSource",
      entityId: row.id,
      ...(keyId ? { actorId: `crawler:${keyId}` } : {}),
      data: {
        action: "crawl_source_discovered", domain: row.domain, hops: row.hops, pageBudget: discoveredSourcePageBudget(),
        delayMs: defaultSourceDelayMs(), enabled: row.enabled, ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}), runId,
      },
    })));
  }
  return { accepted: created.length };
}

/**
 * Inserts the planned sources under the daily auto-enable cap. The count of
 * today's enabled discoveries and the insert share one transaction holding
 * CrawlSource exclusively on both database paths, so the cap cannot be
 * overshot by two concurrent reports; on the memory path a single thread
 * gives the same guarantee. A host another request created between the plan
 * and the insert (unique domain) is skipped silently — it reports "exists"
 * to the next run.
 */
async function insertDiscoveredSources(sourceId: string, plans: DiscoveredHostPlan[], now: Date): Promise<CreatedSource[]> {
  const dayStart = startOfUtcDay(now);
  const pageBudget = discoveredSourcePageBudget();
  const delayMs = defaultSourceDelayMs();

  if (isDevNoDb()) {
    const memory = crawlMemory();
    let alreadyEnabledToday = 0;
    for (const source of memory.sources.values()) {
      if (source.origin === "DISCOVERED" && source.enabled && source.createdAt >= dayStart) alreadyEnabledToday += 1;
    }
    const ordered = planDiscoveredHosts(plans.map((plan) => plan.host), plans[0]!.hops - 1, alreadyEnabledToday)
      .filter((plan) => plans.some((p) => p.host === plan.host));
    const created: CreatedSource[] = [];
    for (const plan of ordered) {
      if ([...memory.sources.values()].some((source) => source.domain === plan.host)) continue;
      const row: MemoryCrawlSource = {
        id: randomUUID(), kind: "SITE", domain: plan.host, pageBudget, delayMs,
        enabled: plan.enabled, approvedBy: null,
        origin: "DISCOVERED", hops: plan.hops, discoveredFromId: sourceId, render: "HTTP",
        lastCrawledAt: null, pagesCrawled: 0, pausedUntil: null, pauseReason: null, disabledReason: plan.disabledReason,
        createdAt: now,
      };
      memory.sources.set(row.id, row);
      created.push({ id: row.id, domain: row.domain, hops: row.hops, enabled: row.enabled, disabledReason: plan.disabledReason });
    }
    return created;
  }

  if (usesWorkerKysely()) {
    return getWorkerDb().transaction().execute(async (tx) => {
      await sql`LOCK TABLE "CrawlSource" IN EXCLUSIVE MODE`.execute(tx);
      const counted = await tx.selectFrom("CrawlSource")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("origin", "=", "DISCOVERED").where("enabled", "=", true).where("createdAt", ">=", dayStart)
        .executeTakeFirst();
      const alreadyEnabledToday = Number(counted?.count ?? 0);
      const ordered = planDiscoveredHosts(plans.map((plan) => plan.host), plans[0]!.hops - 1, alreadyEnabledToday)
        .filter((plan) => plans.some((p) => p.host === plan.host));
      if (ordered.length === 0) return [];
      const inserted = await tx.insertInto("CrawlSource").values(ordered.map((plan) => ({
        id: randomUUID(), kind: "SITE" as const, domain: plan.host, pageBudget, delayMs,
        enabled: plan.enabled, approvedBy: null,
        origin: "DISCOVERED" as const, hops: plan.hops, discoveredFromId: sourceId, render: "HTTP" as const,
        lastCrawledAt: null, pagesCrawled: 0, pausedUntil: null, pauseReason: null, disabledReason: plan.disabledReason,
        createdAt: now,
      }))).onConflict((oc) => oc.column("domain").doNothing())
        .returning(["id", "domain", "hops", "enabled", "disabledReason"]).execute();
      return inserted.map((row) => ({
        id: row.id, domain: row.domain, hops: row.hops, enabled: row.enabled,
        disabledReason: (row.disabledReason as DiscoveryDisabledReason | null) ?? null,
      }));
    });
  }

  const { db } = await import("@/lib/db");
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE "CrawlSource" IN EXCLUSIVE MODE');
    const alreadyEnabledToday = await tx.crawlSource.count({
      where: { origin: "DISCOVERED", enabled: true, createdAt: { gte: dayStart } },
    });
    const ordered = planDiscoveredHosts(plans.map((plan) => plan.host), plans[0]!.hops - 1, alreadyEnabledToday)
      .filter((plan) => plans.some((p) => p.host === plan.host));
    if (ordered.length === 0) return [];
    await tx.crawlSource.createMany({
      data: ordered.map((plan) => ({
        id: randomUUID(), kind: "SITE", domain: plan.host, pageBudget, delayMs,
        enabled: plan.enabled, approvedBy: null,
        origin: "DISCOVERED", hops: plan.hops, discoveredFromId: sourceId, render: "HTTP",
        lastCrawledAt: null, pagesCrawled: 0, pausedUntil: null, pauseReason: null, disabledReason: plan.disabledReason,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
    const rows = await tx.crawlSource.findMany({
      where: { domain: { in: ordered.map((plan) => plan.host) } },
      select: { id: true, domain: true, hops: true, enabled: true, disabledReason: true },
    });
    return rows.map((row) => ({
      id: row.id, domain: row.domain, hops: row.hops, enabled: row.enabled,
      disabledReason: (row.disabledReason as DiscoveryDisabledReason | null) ?? null,
    }));
  });
}

// ---------------------------------------------------------------------------
// Promotion on a match

/**
 * A discovered site that produced a match is promoted (spec): hops reset to
 * 0 and the budget raised to the reported-source budget, because a match
 * proves the site is relevant. Idempotent — an already-promoted source (hops
 * 0, budget at least the reported budget) is left untouched and answers
 * false, so a second finding writes nothing. The caller must never let a
 * failure here lose the finding it is recording.
 */
export async function promoteDiscoveredSource(sourceId: string, keyId = ""): Promise<boolean> {
  if (isDevNoDb()) {
    const row = crawlMemory().sources.get(sourceId);
    if (!row || row.origin !== "DISCOVERED") return false;
    const target = reportedSourcePageBudget();
    if (row.hops === 0 && row.pageBudget >= target) return false;
    const pageBudget = Math.max(row.pageBudget, target);
    row.hops = 0;
    row.pageBudget = pageBudget;
    await writeAuditLogs([{
      eventType: "CRAWL_SOURCE_PROMOTED",
      entityType: "CrawlSource",
      entityId: row.id,
      ...(keyId ? { actorId: `crawler:${keyId}` } : {}),
      data: { action: "crawl_source_promoted", domain: row.domain, pageBudget },
    }]);
    return true;
  }

  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "domain", "origin", "hops", "pageBudget"])
      .where("id", "=", sourceId).executeTakeFirst();
    if (!row || row.origin !== "DISCOVERED") return false;
    const target = reportedSourcePageBudget();
    if (row.hops === 0 && row.pageBudget >= target) return false;
    const pageBudget = Math.max(row.pageBudget, target);
    await getWorkerDb().updateTable("CrawlSource")
      .set({ hops: 0, pageBudget })
      .where("id", "=", sourceId).where("origin", "=", "DISCOVERED").execute();
    await writeAuditLogs([{
      eventType: "CRAWL_SOURCE_PROMOTED",
      entityType: "CrawlSource",
      entityId: row.id,
      ...(keyId ? { actorId: `crawler:${keyId}` } : {}),
      data: { action: "crawl_source_promoted", domain: row.domain, pageBudget },
    }]);
    return true;
  }

  const { db } = await import("@/lib/db");
  const row = await db.crawlSource.findUnique({ where: { id: sourceId }, select: { id: true, domain: true, origin: true, hops: true, pageBudget: true } });
  if (!row || row.origin !== "DISCOVERED") return false;
  const target = reportedSourcePageBudget();
  if (row.hops === 0 && row.pageBudget >= target) return false;
  const pageBudget = Math.max(row.pageBudget, target);
  await db.crawlSource.update({ where: { id: sourceId }, data: { hops: 0, pageBudget } });
  await writeAuditLogs([{
    eventType: "CRAWL_SOURCE_PROMOTED",
    entityType: "CrawlSource",
    entityId: row.id,
    ...(keyId ? { actorId: `crawler:${keyId}` } : {}),
    data: { action: "crawl_source_promoted", domain: row.domain, pageBudget },
  }]);
  return true;
}

// ---------------------------------------------------------------------------
// Hourly sweep: pause the unproductive, resume the paused

type SweepCandidate = { id: string; domain: string; pageBudget: number };

/** Enabled DISCOVERED sources: the sweep's pause candidates. */
async function discoveredSweepCandidates(): Promise<SweepCandidate[]> {
  if (isDevNoDb()) {
    return [...crawlMemory().sources.values()]
      .filter((source) => source.origin === "DISCOVERED" && source.enabled)
      .map((source) => ({ id: source.id, domain: source.domain, pageBudget: source.pageBudget }));
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "domain", "pageBudget"])
      .where("origin", "=", "DISCOVERED").where("enabled", "=", true).execute();
  }
  const { db } = await import("@/lib/db");
  return db.crawlSource.findMany({
    where: { origin: "DISCOVERED", enabled: true },
    select: { id: true, domain: true, pageBudget: true },
  });
}

/** The UTC-day starts of the pause window: today and the two days before. */
function pauseWindowDays(now: Date): Date[] {
  const today = startOfUtcDay(now);
  const day = 24 * 60 * 60 * 1000;
  return [today, new Date(today.getTime() - day), new Date(today.getTime() - 2 * day)];
}

/** Pages each candidate source fetched per day of the window, [days][sourceId]. */
async function pagesFetchedPerDay(ids: string[], days: Date[]): Promise<Array<Map<string, number>>> {
  if (ids.length === 0) return days.map(() => new Map());
  const dayMs = 24 * 60 * 60 * 1000;
  if (isDevNoDb()) {
    const perDay = days.map(() => new Map<string, number>());
    const wanted = new Set(ids);
    for (const page of crawlMemory().pages.values()) {
      if (!page.lastFetchedAt || !wanted.has(page.sourceId)) continue;
      days.forEach((start, index) => {
        const ts = page.lastFetchedAt!.getTime();
        if (ts >= start.getTime() && ts < start.getTime() + dayMs) {
          const map = perDay[index]!;
          map.set(page.sourceId, (map.get(page.sourceId) ?? 0) + 1);
        }
      });
    }
    return perDay;
  }
  if (usesWorkerKysely()) {
    const perDay: Array<Map<string, number>> = [];
    for (let index = 0; index < days.length; index += 1) {
      const start = days[index]!;
      const rows = await getWorkerDb().selectFrom("CrawlPage")
        .select(["sourceId"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("sourceId", "in", ids)
        .where("lastFetchedAt", ">=", start)
        .where("lastFetchedAt", "<", new Date(start.getTime() + dayMs))
        .groupBy("sourceId")
        .execute();
      perDay.push(new Map(rows.map((row) => [row.sourceId, Number(row.count)])));
    }
    return perDay;
  }
  const { db } = await import("@/lib/db");
  const perDay: Array<Map<string, number>> = [];
  for (let index = 0; index < days.length; index += 1) {
    const start = days[index]!;
    const rows = await db.crawlPage.groupBy({
      by: ["sourceId"],
      where: { sourceId: { in: ids }, lastFetchedAt: { gte: start, lt: new Date(start.getTime() + dayMs) } },
      _count: { _all: true },
    });
    perDay.push(new Map(rows.map((row) => [row.sourceId, row._count._all])));
  }
  return perDay;
}

/** Candidate sources with at least one finding since the window opened. */
async function sourcesWithFindingSince(ids: string[], since: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  if (isDevNoDb()) {
    const wanted = new Set(ids);
    const withFinding = new Set<string>();
    for (const finding of crawlMemory().findings.values()) {
      if (wanted.has(finding.sourceId) && finding.lastSeenAt >= since) withFinding.add(finding.sourceId);
    }
    return withFinding;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlFinding")
      .select("sourceId").distinct()
      .where("sourceId", "in", ids).where("lastSeenAt", ">=", since).execute();
    return new Set(rows.map((row) => row.sourceId));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlFinding.findMany({
    where: { sourceId: { in: ids }, lastSeenAt: { gte: since } },
    select: { sourceId: true },
    distinct: ["sourceId"],
  });
  return new Set(rows.map((row) => row.sourceId));
}

/**
 * The hourly lifecycle sweep of discovered sites, wired into the retention
 * cron. First it resumes every pause that has expired (and clears the fields
 * of one an admin lifted early); then it pauses each enabled discovered site
 * whose page budget was spent on every day of the three-day window without
 * one finding in the window. A paused site is simply disabled until its 30
 * days pass, so the frontier and the crawler's source list need no new
 * rules; days while it was paused fetched no pages, so it cannot be re-paused
 * until it has spent its budget on three fresh days.
 */
export async function sweepDiscoveredCrawlSources(now = new Date()): Promise<{ paused: number; resumed: number }> {
  // --- resume: an expired pause lifts itself, whoever switched it on.
  const expired: SweepCandidate[] = [];
  if (isDevNoDb()) {
    for (const source of crawlMemory().sources.values()) {
      if (source.origin === "DISCOVERED" && source.pauseReason !== null && source.pausedUntil && source.pausedUntil <= now) {
        expired.push({ id: source.id, domain: source.domain, pageBudget: source.pageBudget });
        source.enabled = true;
        source.pausedUntil = null;
        source.pauseReason = null;
      }
    }
  } else if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "domain", "pageBudget"])
      .where("origin", "=", "DISCOVERED").where("pauseReason", "is not", null)
      .where("pausedUntil", "<=", now).execute();
    if (rows.length > 0) {
      await getWorkerDb().updateTable("CrawlSource")
        .set({ enabled: true, pausedUntil: null, pauseReason: null })
        .where("id", "in", rows.map((row) => row.id)).execute();
      expired.push(...rows.map((row) => ({ id: row.id, domain: row.domain, pageBudget: row.pageBudget })));
    }
  } else {
    const { db } = await import("@/lib/db");
    const rows = await db.crawlSource.findMany({
      where: { origin: "DISCOVERED", pauseReason: { not: null }, pausedUntil: { lte: now } },
      select: { id: true, domain: true, pageBudget: true },
    });
    if (rows.length > 0) {
      await db.crawlSource.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { enabled: true, pausedUntil: null, pauseReason: null },
      });
      expired.push(...rows.map((row) => ({ id: row.id, domain: row.domain, pageBudget: row.pageBudget })));
    }
  }

  // --- pause: three spent days, no finding in the window.
  const candidates = await discoveredSweepCandidates();
  const days = pauseWindowDays(now);
  const ids = candidates.map((candidate) => candidate.id);
  const perDay = await pagesFetchedPerDay(ids, days);
  const withFinding = await sourcesWithFindingSince(ids, days[days.length - 1]!);
  const toPause = candidates.filter(
    (candidate) =>
      !withFinding.has(candidate.id) &&
      perDay.every((map) => (map.get(candidate.id) ?? 0) >= candidate.pageBudget),
  );
  const pausedUntil = new Date(now.getTime() + DISCOVERY_PAUSE_MS);
  if (toPause.length > 0) {
    if (isDevNoDb()) {
      for (const candidate of toPause) {
        const source = crawlMemory().sources.get(candidate.id);
        if (!source || !source.enabled) continue;
        source.enabled = false;
        source.pausedUntil = pausedUntil;
        source.pauseReason = PAUSE_REASON_NO_MATCH;
      }
    } else if (usesWorkerKysely()) {
      await getWorkerDb().updateTable("CrawlSource")
        .set({ enabled: false, pausedUntil, pauseReason: PAUSE_REASON_NO_MATCH })
        .where("id", "in", toPause.map((candidate) => candidate.id)).execute();
    } else {
      const { db } = await import("@/lib/db");
      await db.crawlSource.updateMany({
        where: { id: { in: toPause.map((candidate) => candidate.id) } },
        data: { enabled: false, pausedUntil, pauseReason: PAUSE_REASON_NO_MATCH },
      });
    }
  }

  // One batched write for both directions; automated, so no actor.
  const events = [
    ...toPause.map((candidate) => ({
      eventType: "CRAWL_SOURCE_PAUSED" as const,
      entityType: "CrawlSource",
      entityId: candidate.id,
      data: { action: "crawl_source_paused", domain: candidate.domain, until: pausedUntil.toISOString(), reason: PAUSE_REASON_NO_MATCH },
    })),
    ...expired.map((candidate) => ({
      eventType: "CRAWL_SOURCE_RESUMED" as const,
      entityType: "CrawlSource",
      entityId: candidate.id,
      data: { action: "crawl_source_resumed", domain: candidate.domain },
    })),
  ];
  if (events.length > 0) await writeAuditLogs(events);
  return { paused: toPause.length, resumed: expired.length };
}
