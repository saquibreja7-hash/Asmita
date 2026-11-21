import { randomUUID } from "node:crypto";
import { writeAuditLogs } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlSource } from "@/lib/crawl-store";
import { isNeverCrawlHost, normalizeNeverCrawlHost } from "@/lib/crawl-never";
import { defaultSourceDelayMs, reportedSourcePageBudget } from "@/lib/crawler-flags";
import { blockedHostRows, existingSourceDomains, validateCrawlDomain } from "@/lib/crawl-sources";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Partner programme part 2 (WP33): the partner side of crawler monitoring.
 *
 * Recording a platform's written permission to crawl (partner-admin.ts) is
 * the moment Asmita may start monitoring that platform: the partner's
 * registered domains then appear as crawl sources, origin PARTNER, created
 * disabled like an admin-added site — the usual admin enable follows before
 * the crawler ever visits them (Rule 5: monitoring starts only after an
 * admin records the written permission, and even then an admin switches it
 * on).
 *
 * The same rules as reported sources apply (crawl-sources.ts): never-crawl
 * hosts (the built-in list and CrawlBlockedHost rows) and invalid or
 * private hosts are skipped, a domain that already has a source is left
 * alone whatever its origin, and nothing survivor-related is stored — only
 * the host names the partner itself published. Every created source gets an
 * audit entry with the partner id and the domain.
 *
 * Source creation never fails the action that triggered it: an unrecordable
 * domain is skipped and counted, and callers (the admin recording the
 * permission, the admin editing the partner's domains) always succeed on
 * their own write.
 *
 * Backends like every crawl module: the in-memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise.
 */

export type PartnerCrawlSourcesResult = {
  /** Domains that got a source row this call. */
  created: string[];
  /** Domains skipped: already a source, never-crawl, or not crawlable. */
  skipped: string[];
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function insertPartnerSource(domain: string, pageBudget: number, delayMs: number, actorId: string, now: Date): Promise<string | null> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if ([...memory.sources.values()].some((source) => source.domain === domain)) return null;
    const row: MemoryCrawlSource = {
      id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs,
      enabled: false, approvedBy: actorId,
      origin: "PARTNER", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
      pausedUntil: null, pauseReason: null, disabledReason: null,
      createdAt: now,
    };
    memory.sources.set(row.id, row);
    return row.id;
  }
  if (usesWorkerKysely()) {
    // One statement, so two concurrent calls cannot create two rows.
    const row = await getWorkerDb().insertInto("CrawlSource").values({
      id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs,
      enabled: false, approvedBy: actorId, origin: "PARTNER", hops: 0, discoveredFromId: null, render: "HTTP",
      lastCrawledAt: null, pagesCrawled: 0, createdAt: now,
    }).onConflict((oc) => oc.column("domain").doNothing()).returning("id").executeTakeFirst();
    return row?.id ?? null;
  }
  const { db } = await import("@/lib/db");
  const existing = await db.crawlSource.findFirst({ where: { domain }, select: { id: true } });
  if (existing) return null;
  try {
    const row = await db.crawlSource.create({
      data: { domain, pageBudget, delayMs, enabled: false, approvedBy: actorId, origin: "PARTNER" },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // A concurrent call created the same host first.
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }
}

/**
 * Makes sure a crawl source exists for every domain an ACTIVE-status
 * platform partner owns (primary and extra), created disabled so the usual
 * admin enable follows. Idempotent: a domain that already has a source,
 * whatever its origin, is skipped. Never-crawl and blocked hosts (including
 * parent-domain blocks) and hosts that fail the crawl-domain rules are
 * skipped, never an error.
 */
export async function ensurePartnerCrawlSources(
  partner: { id: string; primaryDomain: string; extraDomains: string[] },
  actorId: string,
  now: Date = new Date(),
): Promise<PartnerCrawlSourcesResult> {
  const domains = [...new Set([partner.primaryDomain, ...partner.extraDomains])].filter(Boolean);
  if (domains.length === 0) return { created: [], skipped: [] };

  const existing = await existingSourceDomains(domains);
  const blocked = await blockedHostRows(domains);
  const pageBudget = reportedSourcePageBudget();
  const delayMs = defaultSourceDelayMs();

  const created: string[] = [];
  const skipped: string[] = [];
  const createdRows: Array<{ id: string; domain: string }> = [];
  for (const domain of domains) {
    if (existing.has(domain)) {
      skipped.push(domain);
      continue;
    }
    const host = normalizeNeverCrawlHost(domain);
    if (isNeverCrawlHost(host) || [...blocked].some((blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`))) {
      skipped.push(domain);
      continue;
    }
    const checked = validateCrawlDomain(host);
    if (!checked.ok) {
      skipped.push(domain);
      continue;
    }
    try {
      const id = await insertPartnerSource(checked.domain, pageBudget, delayMs, actorId, now);
      if (id) {
        created.push(checked.domain);
        createdRows.push({ id, domain: checked.domain });
      } else {
        skipped.push(domain);
      }
    } catch {
      // Never fail the action that triggered this.
      skipped.push(domain);
    }
  }

  // One entry per created source, ids and the host only — nothing about any
  // survivor (no partner source ever has any).
  if (createdRows.length > 0) {
    await writeAuditLogs(createdRows.map((row) => ({
      eventType: "ADMIN_ACTION" as const,
      entityType: "CrawlSource",
      entityId: row.id,
      actorId,
      data: { action: "partner_crawl_source_created", partnerId: partner.id, domain: row.domain, pageBudget, delayMs, enabled: false },
    })));
  }
  return { created, skipped };
}
