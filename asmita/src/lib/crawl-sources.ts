import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlSource } from "@/lib/crawl-store";
import { hostAndParents, isNeverCrawlHost, normalizeNeverCrawlHost } from "@/lib/crawl-never";
import { defaultSourceDelayMs, reportedSourcePageBudget } from "@/lib/crawler-flags";
import { checkLink } from "@/lib/link-check";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Public hosts the crawler may visit. A SUPER_ADMIN adds each one by host
 * name and sets how many pages a run may fetch and how long to wait between
 * them. Pages are crawled on the host and its subdomains only (findings for a
 * page elsewhere are refused, crawl-findings.ts); a leading "www." is
 * dropped, so "www.example.org" approves example.org and all its subdomains.
 * New sites start disabled; the crawler only ever sees enabled ones. Every
 * change is audited (ADMIN_ACTION, action crawl_source_*).
 *
 * Crawler v2 (full-crawler spec WP1): sources now carry an origin. REPORTED
 * rows are created automatically when a survivor's submitted link or an
 * approved crawler finding names their host (ensureCrawlSourceForReportedHost
 * below) — enabled from birth, the host only, never the link or the case, and
 * never for a host on the never-crawl list (crawl-never.ts and
 * CrawlBlockedHost). They have no admin approver and nothing that ties them to
 * the survivor: erasing her account leaves them in place.
 *
 * Host rule: a public DNS name with at least two labels and an alphabetic
 * top-level label, so IP literals, single-label and private hosts are
 * refused. There is no public-suffix list here, so a bare public suffix with
 * two labels (e.g. "co.in") is not detected: the admin must not add one.
 */

export const CRAWL_PAGE_BUDGET_MAX = 10_000;
export const CRAWL_DELAY_MIN_MS = 500;
export const CRAWL_DELAY_MAX_MS = 60_000;

const PRIVATE_SUFFIXES = [
  "localhost", "local", "internal", "intranet", "lan", "home", "corp", "private", "test", "example", "invalid", "onion", "arpa",
];
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export type DomainCheck = { ok: true; domain: string } | { ok: false; error: "invalid_domain" | "private_domain" };

export function validateCrawlDomain(raw: string): DomainCheck {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!domain || domain.length > 253 || /[^a-z0-9.-]/.test(domain)) return { ok: false, error: "invalid_domain" };
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return { ok: false, error: "invalid_domain" };
  const tld = labels.at(-1)!;
  // Alphabetic top-level label: no IPv4 literal (or anything numeric) gets through.
  if (!/^[a-z]{2,63}$/.test(tld)) return { ok: false, error: "invalid_domain" };
  if (PRIVATE_SUFFIXES.includes(tld)) return { ok: false, error: "private_domain" };
  const link = checkLink(`https://${domain}/`);
  if (!link.ok) return { ok: false, error: link.error === "local_or_private_address" ? "private_domain" : "invalid_domain" };
  return { ok: true, domain };
}

export const createSourceSchema = z.object({
  domain: z.string().min(1).max(253),
  pageBudget: z.number().int().min(1).max(CRAWL_PAGE_BUDGET_MAX),
  delayMs: z.number().int().min(CRAWL_DELAY_MIN_MS).max(CRAWL_DELAY_MAX_MS),
  enabled: z.boolean().optional(),
}).strict();

export const updateSourceSchema = z.object({
  id: z.string().min(1).max(64),
  pageBudget: z.number().int().min(1).max(CRAWL_PAGE_BUDGET_MAX).optional(),
  delayMs: z.number().int().min(CRAWL_DELAY_MIN_MS).max(CRAWL_DELAY_MAX_MS).optional(),
  enabled: z.boolean().optional(),
}).strict().refine((d) => d.pageBudget !== undefined || d.delayMs !== undefined || d.enabled !== undefined, { message: "nothing_to_change" });

export type CrawlSourceView = {
  id: string;
  kind: "site";
  domain: string;
  pageBudget: number;
  delayMs: number;
  enabled: boolean;
  approvedBy: string | null;
  origin: "ADMIN" | "REPORTED" | "DISCOVERED";
  hops: number;
  discoveredFromId: string | null;
  render: "HTTP" | "BROWSER" | "AUTO";
  pagesCrawled: number;
  lastCrawledAt: string | null;
  createdAt: string;
};

type SourceRow = Omit<MemoryCrawlSource, "createdAt" | "lastCrawledAt"> & { createdAt: Date | string; lastCrawledAt: Date | string | null };

function toView(row: SourceRow): CrawlSourceView {
  return {
    id: row.id, kind: "site", domain: row.domain, pageBudget: row.pageBudget, delayMs: row.delayMs,
    enabled: row.enabled, approvedBy: row.approvedBy,
    origin: row.origin, hops: row.hops, discoveredFromId: row.discoveredFromId, render: row.render,
    pagesCrawled: row.pagesCrawled, lastCrawledAt: row.lastCrawledAt ? new Date(row.lastCrawledAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** What the crawler service gets: enabled sites only, no admin details. */
export async function listEnabledCrawlSources() {
  type Row = { id: string; domain: string; pageBudget: number; delayMs: number; origin: string; hops: number; render: string };
  const toContract = (row: Row) => ({
    id: row.id, kind: "site" as const, domain: row.domain, pageBudget: row.pageBudget, delayMs: row.delayMs,
    origin: row.origin.toLowerCase() as "admin" | "reported" | "discovered",
    hops: row.hops,
    render: row.render.toLowerCase() as "http" | "browser" | "auto",
  });
  let rows: Row[];
  if (isDevNoDb()) {
    rows = [...crawlMemory().sources.values()].filter((s) => s.enabled);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("CrawlSource")
      .select(["id", "domain", "pageBudget", "delayMs", "origin", "hops", "render"])
      .where("enabled", "=", true).orderBy("domain").execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlSource.findMany({
      where: { enabled: true },
      select: { id: true, domain: true, pageBudget: true, delayMs: true, origin: true, hops: true, render: true },
      orderBy: { domain: "asc" },
    });
  }
  return rows.map(toContract).sort((a, b) => a.domain.localeCompare(b.domain));
}

/** The host findings under this source must be on, while the source exists and is enabled; else null. */
export async function enabledCrawlSourceDomain(id: string): Promise<string | null> {
  let row: { domain: string; enabled: boolean } | null | undefined;
  if (isDevNoDb()) row = crawlMemory().sources.get(id);
  else if (usesWorkerKysely()) {
    row = await getWorkerDb().selectFrom("CrawlSource").select(["domain", "enabled"]).where("id", "=", id).executeTakeFirst();
  } else {
    const { db } = await import("@/lib/db");
    row = await db.crawlSource.findUnique({ where: { id }, select: { domain: true, enabled: true } });
  }
  return row?.enabled === true ? row.domain : null;
}

/** Whether findings may name this source: it exists and is enabled. */
export async function isEnabledCrawlSource(id: string): Promise<boolean> {
  return (await enabledCrawlSourceDomain(id)) !== null;
}

export async function listCrawlSources(): Promise<CrawlSourceView[]> {
  if (isDevNoDb()) return [...crawlMemory().sources.values()].map(toView).sort((a, b) => a.domain.localeCompare(b.domain));
  const { db } = await import("@/lib/db");
  return (await db.crawlSource.findMany({ orderBy: { domain: "asc" } })).map(toView);
}

export async function createCrawlSource(
  input: z.infer<typeof createSourceSchema>,
  actorId: string,
): Promise<{ ok: true; source: CrawlSourceView } | { ok: false; error: "invalid_domain" | "private_domain" | "source_exists" }> {
  const checked = validateCrawlDomain(input.domain);
  if (!checked.ok) return checked;
  let source: CrawlSourceView;
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if ([...memory.sources.values()].some((s) => s.domain === checked.domain)) return { ok: false, error: "source_exists" };
    const row: MemoryCrawlSource = {
      id: randomUUID(), kind: "SITE", domain: checked.domain, pageBudget: input.pageBudget, delayMs: input.delayMs,
      enabled: input.enabled ?? false, approvedBy: actorId,
      origin: "ADMIN", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
      createdAt: new Date(),
    };
    memory.sources.set(row.id, row);
    source = toView(row);
  } else {
    const { db } = await import("@/lib/db");
    try {
      source = toView(await db.crawlSource.create({
        data: { domain: checked.domain, pageBudget: input.pageBudget, delayMs: input.delayMs, enabled: input.enabled ?? false, approvedBy: actorId },
      }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "source_exists" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "CrawlSource",
    entityId: source.id,
    actorId,
    data: { action: "crawl_source_added", domain: source.domain, pageBudget: source.pageBudget, delayMs: source.delayMs, enabled: source.enabled },
  });
  return { ok: true, source };
}

export async function updateCrawlSource(
  input: z.infer<typeof updateSourceSchema>,
  actorId: string,
): Promise<{ ok: true; source: CrawlSourceView } | { ok: false; error: "source_not_found" }> {
  const changes = {
    ...(input.pageBudget !== undefined ? { pageBudget: input.pageBudget } : {}),
    ...(input.delayMs !== undefined ? { delayMs: input.delayMs } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  };
  let source: CrawlSourceView;
  if (isDevNoDb()) {
    const row = crawlMemory().sources.get(input.id);
    if (!row) return { ok: false, error: "source_not_found" };
    Object.assign(row, changes);
    source = toView(row);
  } else {
    const { db } = await import("@/lib/db");
    const updated = await db.crawlSource.updateMany({ where: { id: input.id }, data: changes });
    if (updated.count === 0) return { ok: false, error: "source_not_found" };
    const row = await db.crawlSource.findUnique({ where: { id: input.id } });
    if (!row) return { ok: false, error: "source_not_found" };
    source = toView(row);
  }
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "CrawlSource",
    entityId: source.id,
    actorId,
    data: { action: "crawl_source_updated", domain: source.domain, changes },
  });
  return { ok: true, source };
}

// ---------------------------------------------------------------------------
// Reported sources (full-crawler spec, WP1)

/**
 * Whether a host is on the never-crawl list: a built-in entry
 * (crawl-never.ts), or a CrawlBlockedHost row for the host or any parent
 * domain of it (a block on "example.com" also answers for
 * "deep.forum.example.com").
 */
export async function isBlockedCrawlHost(rawHost: string): Promise<boolean> {
  const host = normalizeNeverCrawlHost(rawHost);
  if (!host) return true;
  if (isNeverCrawlHost(host)) return true;
  const candidates = hostAndParents(host);
  if (isDevNoDb()) return candidates.some((name) => crawlMemory().blockedHosts.has(name));
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlBlockedHost").select("host")
      .where("host", "in", candidates).executeTakeFirst();
    return row !== undefined;
  }
  const { db } = await import("@/lib/db");
  return (await db.crawlBlockedHost.findFirst({ where: { host: { in: candidates } }, select: { host: true } })) !== null;
}

export type ReportedSourceOutcome =
  | { created: true; id: string }
  | { created: false; reason: "exists" | "never_crawl" | "invalid_domain" };

/**
 * Makes sure a CrawlSource exists for a host a survivor's submitted link or
 * an approved crawler finding named: origin REPORTED, hops 0, enabled from
 * birth, the default budget and delay (crawler-flags.ts). Only the host is
 * ever copied — not the link, not the case, nothing that identifies her — and
 * hosts on the never-crawl list are skipped. Idempotent: if a source for the
 * host exists, whatever its origin, nothing is written. Callers never let a
 * failure here break the action that triggered it (case-ops.ts,
 * crawl-findings.ts).
 */
export async function ensureCrawlSourceForReportedHost(rawHost: string): Promise<ReportedSourceOutcome> {
  const host = normalizeNeverCrawlHost(rawHost);
  if (!host) return { created: false, reason: "invalid_domain" };
  if (isNeverCrawlHost(host)) return { created: false, reason: "never_crawl" };
  const checked = validateCrawlDomain(host);
  if (!checked.ok) return { created: false, reason: checked.error === "private_domain" ? "never_crawl" : "invalid_domain" };
  if (await isBlockedCrawlHost(checked.domain)) return { created: false, reason: "never_crawl" };
  const pageBudget = reportedSourcePageBudget();
  const delayMs = defaultSourceDelayMs();
  const createdId = await insertReportedSource(checked.domain, pageBudget, delayMs);
  if (createdId === null) return { created: false, reason: "exists" };
  // No actor, no case: nothing in this entry may tie the source to the survivor.
  await writeAuditLog({
    eventType: "CRAWL_SOURCE_REPORTED",
    entityType: "CrawlSource",
    entityId: createdId,
    data: { action: "crawl_source_reported", domain: checked.domain, pageBudget, delayMs },
  });
  return { created: true, id: createdId };
}

/** Inserts one REPORTED source row; null when a source for the host exists. */
async function insertReportedSource(domain: string, pageBudget: number, delayMs: number): Promise<string | null> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if ([...memory.sources.values()].some((s) => s.domain === domain)) return null;
    const row: MemoryCrawlSource = {
      id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs,
      enabled: true, approvedBy: null,
      origin: "REPORTED", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
      createdAt: new Date(),
    };
    memory.sources.set(row.id, row);
    return row.id;
  }
  if (usesWorkerKysely()) {
    // One statement, so two concurrent reports of one host cannot create two rows.
    const row = await getWorkerDb().insertInto("CrawlSource").values({
      id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs,
      enabled: true, approvedBy: null, origin: "REPORTED", hops: 0, discoveredFromId: null, render: "HTTP",
      lastCrawledAt: null, pagesCrawled: 0, createdAt: new Date(),
    }).onConflict((oc) => oc.column("domain").doNothing()).returning("id").executeTakeFirst();
    return row?.id ?? null;
  }
  const { db } = await import("@/lib/db");
  const existing = await db.crawlSource.findFirst({ where: { domain }, select: { id: true } });
  if (existing) return null;
  try {
    const row = await db.crawlSource.create({
      data: { domain, pageBudget, delayMs, enabled: true, origin: "REPORTED" },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // A concurrent report created the same host first.
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }
}
