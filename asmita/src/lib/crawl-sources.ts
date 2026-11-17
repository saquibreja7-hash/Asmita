import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog, writeAuditLogs } from "@/lib/audit";
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
 * rows are created automatically for the hosts of survivors' submitted links
 * (by the hourly sweep, createReportedSourcesFromSubmittedUrls below — never
 * inline in her request) and of approved crawler findings
 * (ensureCrawlSourceForReportedHost) — enabled from birth, the host only,
 * never the link or the case, and never for a host on the never-crawl list
 * (crawl-never.ts and CrawlBlockedHost). They have no admin approver and
 * nothing that ties them to the survivor: erasing her account leaves them in
 * place.
 *
 * Crawler v2 (full-crawler spec WP2): hosts can be imported in bulk
 * (importCrawlSources below), one request up to 1000 entries, each reported
 * per entry; the admin-managed half of the never-crawl list lives in
 * crawl-blocked-hosts.ts.
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
  /** The parent source's domain, resolved for display (WP5); null when gone or not discovered. */
  discoveredFromDomain: string | null;
  render: "HTTP" | "BROWSER" | "AUTO";
  pagesCrawled: number;
  lastCrawledAt: string | null;
  /** Set while an unproductive discovered site is paused for 30 days (WP5). */
  pausedUntil: string | null;
  /** Fixed code for the admin page: why the site is paused (WP5). */
  pauseReason: string | null;
  /** Fixed code for the admin page: why a discovered site was stored disabled (WP5). */
  disabledReason: string | null;
  createdAt: string;
};

type SourceRow = Omit<MemoryCrawlSource, "createdAt" | "lastCrawledAt" | "pausedUntil"> & { createdAt: Date | string; lastCrawledAt: Date | string | null; pausedUntil: Date | string | null };

function toView(row: SourceRow, discoveredFromDomain: string | null = null): CrawlSourceView {
  return {
    id: row.id, kind: "site", domain: row.domain, pageBudget: row.pageBudget, delayMs: row.delayMs,
    enabled: row.enabled, approvedBy: row.approvedBy,
    origin: row.origin, hops: row.hops, discoveredFromId: row.discoveredFromId, discoveredFromDomain, render: row.render,
    pagesCrawled: row.pagesCrawled, lastCrawledAt: row.lastCrawledAt ? new Date(row.lastCrawledAt).toISOString() : null,
    pausedUntil: row.pausedUntil ? new Date(row.pausedUntil).toISOString() : null,
    pauseReason: row.pauseReason, disabledReason: row.disabledReason,
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
  let rows: SourceRow[];
  if (isDevNoDb()) rows = [...crawlMemory().sources.values()];
  else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlSource.findMany({ orderBy: { domain: "asc" } });
  }
  // A DISCOVERED row's parent domain, for the admin page (WP5). All rows are
  // already loaded here, so the join is one map, never a query per source.
  const domains = new Map(rows.map((row) => [row.id, row.domain]));
  return rows
    .map((row) => toView(row, row.discoveredFromId ? domains.get(row.discoveredFromId) ?? null : null))
    .sort((a, b) => a.domain.localeCompare(b.domain));
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
      pausedUntil: null, pauseReason: null, disabledReason: null,
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
  const changes: Record<string, unknown> = {
    ...(input.pageBudget !== undefined ? { pageBudget: input.pageBudget } : {}),
    ...(input.delayMs !== undefined ? { delayMs: input.delayMs } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  };
  // An explicit switch-on (WP5) also lifts an automatic pause and clears the
  // stored reason a discovered site was born with: from here the admin owns
  // the state, and the hourly sweep must not resume it later.
  if (input.enabled === true) Object.assign(changes, { pausedUntil: null, pauseReason: null, disabledReason: null });
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
// Bulk import (full-crawler spec, WP2)

export const importSourceSchema = z.object({
  // Entries are bare hosts or full URLs; the host is extracted below. A
  // blank entry is reported per entry ("invalid"), not a request error, so
  // a pasted list with empty lines still imports.
  hosts: z.array(z.string().max(2000)).min(1).max(1000),
  pageBudget: z.number().int().min(1).max(CRAWL_PAGE_BUDGET_MAX).optional(),
  delayMs: z.number().int().min(CRAWL_DELAY_MIN_MS).max(CRAWL_DELAY_MAX_MS).optional(),
  enabled: z.boolean().optional(),
}).strict();

export type ImportHostStatus = "created" | "exists" | "blocked" | "invalid";

export type ImportHostResult = {
  input: string;
  status: ImportHostStatus;
  host?: string;
  reason?: "invalid_domain" | "private_domain";
};

/**
 * The host of one pasted entry: the entry itself, or the host name of a full
 * URL ("https://a.example.com/x" -> "a.example.com"). Empty when the entry
 * claims a scheme but does not parse. Anything else goes through
 * validateCrawlDomain unchanged, so "example.com/x" (no scheme) is reported
 * invalid, never silently repaired into a host.
 */
export function hostFromEntry(raw: string): string {
  const entry = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(entry)) return entry;
  try {
    return new URL(entry).hostname;
  } catch {
    return "";
  }
}

/** Whether a blocked-host row (one of the matched row hosts) covers `host` or a parent domain of it. */
function blockedByRows(host: string, rows: Set<string>): boolean {
  return hostAndParents(host).some((name) => rows.has(name));
}

/**
 * Bulk add of crawl sources (WP2): every entry is reported, none fails the
 * request. Entries may be bare hosts or full URLs (the host is extracted)
 * and go through exactly the same validation as a single add. A never-crawl
 * host — the built-in list (crawl-never.ts) or a CrawlBlockedHost row,
 * including a parent domain — answers "blocked"; a host that is already a
 * source, or repeats an earlier entry of this request, answers "exists";
 * everything else is created as an ADMIN source by this admin, one audit
 * entry each (crawl_source_imported).
 *
 * The work is a fixed handful of queries whatever the list size — existing
 * sources, blocked rows, one bulk insert, one batched audit write — never
 * one query per host, so a 1000-entry import stays within the Worker's
 * per-request subrequest limit.
 */
export async function importCrawlSources(
  input: z.infer<typeof importSourceSchema>,
  actorId: string,
): Promise<{ results: ImportHostResult[] }> {
  const pageBudget = input.pageBudget ?? reportedSourcePageBudget();
  const delayMs = input.delayMs ?? defaultSourceDelayMs();
  const enabled = input.enabled ?? false;

  // Pass 1, pure: host extraction and the single-add validation, per entry.
  const results: ImportHostResult[] = new Array(input.hosts.length);
  const entries = new Map<string, number[]>(); // normalized host -> result indices
  input.hosts.forEach((raw, index) => {
    const checked = validateCrawlDomain(hostFromEntry(raw));
    if (!checked.ok) {
      results[index] = { input: raw, status: "invalid", reason: checked.error };
      return;
    }
    const indices = entries.get(checked.domain);
    if (indices) indices.push(index);
    else entries.set(checked.domain, [index]);
  });

  // Built-in never-crawl hosts need no lookup at all.
  const hosts = [...entries.keys()].filter((host) => !isNeverCrawlHost(host));
  const existing = hosts.length > 0 ? await existingSourceDomains(hosts) : new Set<string>();
  const blocked = hosts.length > 0 ? await blockedHostRows(hosts) : new Set<string>();

  // Pass 2: one status per unique host.
  const status = new Map<string, ImportHostStatus>();
  const toCreate: string[] = [];
  for (const host of entries.keys()) {
    if (isNeverCrawlHost(host) || blockedByRows(host, blocked)) status.set(host, "blocked");
    else if (existing.has(host)) status.set(host, "exists");
    else {
      toCreate.push(host);
      status.set(host, "created"); // may become "exists" if a concurrent request wins the insert
    }
  }

  const createdRows = toCreate.length > 0 ? await insertImportedSources(toCreate, pageBudget, delayMs, enabled, actorId) : [];
  const created = new Set(createdRows.map((row) => row.domain));
  for (const host of toCreate) if (!created.has(host)) status.set(host, "exists");

  // Pass 3: one result per entry, in input order. A repeated entry reports
  // the first one's outcome; when that one created the host, the repeat
  // already finds it in the list ("exists").
  for (const [host, indices] of entries) {
    const hostStatus = status.get(host)!;
    indices.forEach((index, position) => {
      results[index] = {
        input: input.hosts[index],
        status: position === 0 ? hostStatus : hostStatus === "created" ? "exists" : hostStatus,
        host,
      };
    });
  }

  // Every change audited like a single add, in one batched write.
  await writeAuditLogs(createdRows.map((row) => ({
    eventType: "ADMIN_ACTION" as const,
    entityType: "CrawlSource",
    entityId: row.id,
    actorId,
    data: { action: "crawl_source_imported", domain: row.domain, pageBudget, delayMs, enabled },
  })));

  return { results };
}

/** Existing source domains among `hosts`, in one query (also WP5 discoveries). */
export async function existingSourceDomains(hosts: string[]): Promise<Set<string>> {
  if (isDevNoDb()) {
    const wanted = new Set(hosts);
    return new Set([...crawlMemory().sources.values()].filter((source) => wanted.has(source.domain)).map((source) => source.domain));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlSource").select("domain").where("domain", "in", hosts).execute();
    return new Set(rows.map((row) => row.domain));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlSource.findMany({ where: { domain: { in: hosts } }, select: { domain: true } });
  return new Set(rows.map((row) => row.domain));
}

/**
 * The CrawlBlockedHost rows covering any of `hosts` (a row's host, or a
 * parent of it), in one query over every host and every parent domain (also
 * WP5 discoveries). Hosts are crawler-reported and capped at 200 per request
 * with realistic label counts, so the IN list stays far below Postgres's
 * parameter limit.
 */
export async function blockedHostRows(hosts: string[]): Promise<Set<string>> {
  const candidates = new Set<string>();
  for (const host of hosts) for (const name of hostAndParents(host)) candidates.add(name);
  const names = [...candidates];
  if (isDevNoDb()) {
    const rows = new Set<string>();
    for (const name of names) if (crawlMemory().blockedHosts.has(name)) rows.add(name);
    return rows;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlBlockedHost").select("host").where("host", "in", names).execute();
    return new Set(rows.map((row) => row.host));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlBlockedHost.findMany({ where: { host: { in: names } }, select: { host: true } });
  return new Set(rows.map((row) => row.host));
}

/**
 * Inserts the ADMIN sources of one import and returns the rows that were
 * created (id and domain). A host another request created between the check
 * and the insert is skipped, not an error; it reports "exists" above. On the
 * Prisma path createMany returns no ids, so one read settles both which rows
 * exist now and their ids for the audit entries.
 */
async function insertImportedSources(
  domains: string[],
  pageBudget: number,
  delayMs: number,
  enabled: boolean,
  actorId: string,
): Promise<Array<{ id: string; domain: string }>> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const created: Array<{ id: string; domain: string }> = [];
    for (const domain of domains) {
      if ([...memory.sources.values()].some((source) => source.domain === domain)) continue;
      const row: MemoryCrawlSource = {
        id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs, enabled, approvedBy: actorId,
        origin: "ADMIN", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
        pausedUntil: null, pauseReason: null, disabledReason: null,
        createdAt: new Date(),
      };
      memory.sources.set(row.id, row);
      created.push({ id: row.id, domain });
    }
    return created;
  }
  if (usesWorkerKysely()) {
    const rows = domains.map((domain) => ({
      id: randomUUID(), kind: "SITE" as const, domain, pageBudget, delayMs, enabled, approvedBy: actorId,
      origin: "ADMIN" as const, hops: 0, discoveredFromId: null, render: "HTTP" as const,
      lastCrawledAt: null, pagesCrawled: 0, createdAt: new Date(),
    }));
    // One statement: two concurrent imports of the same host cannot create
    // two rows, and the same import needs no second round trip.
    const inserted = await getWorkerDb().insertInto("CrawlSource").values(rows)
      .onConflict((oc) => oc.column("domain").doNothing())
      .returning(["id", "domain"]).execute();
    return inserted.map((row) => ({ id: row.id, domain: row.domain }));
  }
  const { db } = await import("@/lib/db");
  await db.crawlSource.createMany({
    data: domains.map((domain) => ({ domain, pageBudget, delayMs, enabled, approvedBy: actorId })),
    skipDuplicates: true,
  });
  const rows = await db.crawlSource.findMany({ where: { domain: { in: domains } }, select: { id: true, domain: true } });
  return rows.map((row) => ({ id: row.id, domain: row.domain }));
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
 * Makes sure a CrawlSource exists for a host an approved crawler finding
 * named (a survivor's own links go through the hourly sweep instead,
 * createReportedSourcesFromSubmittedUrls): origin REPORTED, hops 0, enabled from
 * birth, the default budget and delay (crawler-flags.ts). Only the host is
 * ever copied — not the link, not the case, nothing that identifies her — and
 * hosts on the never-crawl list are skipped. Idempotent: if a source for the
 * host exists, whatever its origin, nothing is written. Callers never let a
 * failure here break the action that triggered it (crawl-findings.ts).
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
      pausedUntil: null, pauseReason: null, disabledReason: null,
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

// ---------------------------------------------------------------------------
// Reported sources from survivors' links, created by the hourly sweep

/** At most this many submitted links are looked at per sweep; the rest wait an hour. */
export const REPORTED_SWEEP_BATCH = 1000;

/**
 * Creates the REPORTED sources for the hosts of survivors' submitted links
 * (full-crawler spec WP1), from the hourly retention cron — never inline in
 * her request. Created inline, the CRAWL_SOURCE_REPORTED entry sat right
 * after her CASE_CREATED / URL_SUBMITTED entries in the append-only audit
 * log (adjacent sequence numbers, the same instant, her actor id on the
 * neighbours), which tied her to the host long after the link was purged and
 * her account erased. Here the work is a batch: up to REPORTED_SWEEP_BATCH
 * unchecked links (SubmittedUrl.crawlSourceChecked = false) from any number
 * of cases, hosts deduplicated and sorted, one source row per new host with
 * createdAt = the sweep time, one batched audit write with no actor and no
 * case, then the links are marked checked. Only the host is read from a link.
 *
 * Same rules as ensureCrawlSourceForReportedHost: never-crawl hosts (the
 * built-in list and CrawlBlockedHost rows, including parent domains),
 * invalid and private hosts and hosts that already have a source are
 * skipped. Idempotent: a crash between the insert and the marker re-runs
 * harmlessly, since existing hosts are skipped.
 */
export async function createReportedSourcesFromSubmittedUrls(now = new Date()): Promise<{ checked: number; created: number }> {
  const pending = await uncheckedSubmittedUrls();
  if (pending.length === 0) return { checked: 0, created: 0 };

  const hosts = new Set<string>();
  for (const { domain } of pending) {
    const host = normalizeNeverCrawlHost(domain);
    if (!host || isNeverCrawlHost(host)) continue;
    const checked = validateCrawlDomain(host);
    if (checked.ok && !isNeverCrawlHost(checked.domain)) hosts.add(checked.domain);
  }
  const candidates = [...hosts].sort();
  let created: Array<{ id: string; domain: string }> = [];
  const pageBudget = reportedSourcePageBudget();
  const delayMs = defaultSourceDelayMs();
  if (candidates.length > 0) {
    const existing = await existingSourceDomains(candidates);
    const blocked = await blockedHostRows(candidates);
    const toCreate = candidates.filter((host) => !existing.has(host) && !blockedByRows(host, blocked));
    if (toCreate.length > 0) created = await insertReportedSources(toCreate, pageBudget, delayMs, now);
  }

  // No actor, no case, no link: nothing in these entries ties a source to her.
  await writeAuditLogs(created.map((row) => ({
    eventType: "CRAWL_SOURCE_REPORTED" as const,
    entityType: "CrawlSource",
    entityId: row.id,
    data: { action: "crawl_source_reported", domain: row.domain, pageBudget, delayMs },
  })));
  await markSubmittedUrlsChecked(pending.map((row) => row.id));
  return { checked: pending.length, created: created.length };
}

async function uncheckedSubmittedUrls(): Promise<Array<{ id: string; domain: string }>> {
  if (isDevNoDb()) {
    const store = await import("@/lib/store");
    const rows: Array<{ id: string; domain: string }> = [];
    for (const record of store.cases.values()) {
      for (const url of record.urls) {
        if (url.crawlSourceChecked === false) rows.push({ id: url.id, domain: url.domain });
        if (rows.length >= REPORTED_SWEEP_BATCH) return rows;
      }
    }
    return rows;
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("SubmittedUrl").select(["id", "domain"])
      .where("crawlSourceChecked", "=", false)
      .orderBy("submittedAt", "asc").limit(REPORTED_SWEEP_BATCH).execute();
  }
  const { db } = await import("@/lib/db");
  return db.submittedUrl.findMany({
    where: { crawlSourceChecked: false },
    select: { id: true, domain: true },
    orderBy: { submittedAt: "asc" },
    take: REPORTED_SWEEP_BATCH,
  });
}

async function markSubmittedUrlsChecked(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (isDevNoDb()) {
    const wanted = new Set(ids);
    const store = await import("@/lib/store");
    for (const record of store.cases.values()) {
      for (const url of record.urls) if (wanted.has(url.id)) url.crawlSourceChecked = true;
    }
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("SubmittedUrl").set({ crawlSourceChecked: true }).where("id", "in", ids).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.submittedUrl.updateMany({ where: { id: { in: ids } }, data: { crawlSourceChecked: true } });
}

/**
 * Inserts the REPORTED sources of one sweep and returns the rows this call
 * created. A host another request created meanwhile (unique domain) is
 * skipped. On the Prisma path the ids are generated here, so the re-read
 * after createMany returns exactly this call's rows.
 */
async function insertReportedSources(
  domains: string[],
  pageBudget: number,
  delayMs: number,
  now: Date,
): Promise<Array<{ id: string; domain: string }>> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const created: Array<{ id: string; domain: string }> = [];
    for (const domain of domains) {
      if ([...memory.sources.values()].some((source) => source.domain === domain)) continue;
      const row: MemoryCrawlSource = {
        id: randomUUID(), kind: "SITE", domain, pageBudget, delayMs, enabled: true, approvedBy: null,
        origin: "REPORTED", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
        pausedUntil: null, pauseReason: null, disabledReason: null,
        createdAt: now,
      };
      memory.sources.set(row.id, row);
      created.push({ id: row.id, domain });
    }
    return created;
  }
  const rows = domains.map((domain) => ({
    id: randomUUID(), kind: "SITE" as const, domain, pageBudget, delayMs, enabled: true, approvedBy: null,
    origin: "REPORTED" as const, hops: 0, discoveredFromId: null, render: "HTTP" as const,
    lastCrawledAt: null, pagesCrawled: 0, createdAt: now,
  }));
  if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("CrawlSource").values(rows)
      .onConflict((oc) => oc.column("domain").doNothing())
      .returning(["id", "domain"]).execute();
    return inserted.map((row) => ({ id: row.id, domain: row.domain }));
  }
  const { db } = await import("@/lib/db");
  await db.crawlSource.createMany({ data: rows, skipDuplicates: true });
  const created = await db.crawlSource.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: { id: true, domain: true },
  });
  return created.map((row) => ({ id: row.id, domain: row.domain }));
}
