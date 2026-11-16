import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlSource } from "@/lib/crawl-store";
import { checkLink } from "@/lib/link-check";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Public sites the crawler may visit. A SUPER_ADMIN adds each one by domain
 * and sets how many pages a run may fetch and how long to wait between them.
 * New sites start disabled; the crawler only ever sees enabled ones. Every
 * change is audited (ADMIN_ACTION, action crawl_source_*).
 *
 * Domain rule: a public DNS name with at least two labels and an alphabetic
 * top-level label, so IP literals, single-label and private hosts are
 * refused. There is no public-suffix list here, so "registrable" is an
 * approximation: subdomains are accepted, and a bare public suffix with two
 * labels (e.g. "co.in") is not detected.
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
  createdAt: string;
};

type SourceRow = Omit<MemoryCrawlSource, "createdAt"> & { createdAt: Date | string };

function toView(row: SourceRow): CrawlSourceView {
  return {
    id: row.id, kind: "site", domain: row.domain, pageBudget: row.pageBudget, delayMs: row.delayMs,
    enabled: row.enabled, approvedBy: row.approvedBy, createdAt: new Date(row.createdAt).toISOString(),
  };
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** What the crawler service gets: enabled sites only, no admin details. */
export async function listEnabledCrawlSources() {
  let rows: Array<{ id: string; domain: string; pageBudget: number; delayMs: number }>;
  if (isDevNoDb()) {
    rows = [...crawlMemory().sources.values()].filter((s) => s.enabled);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("CrawlSource").select(["id", "domain", "pageBudget", "delayMs"])
      .where("enabled", "=", true).orderBy("domain").execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlSource.findMany({
      where: { enabled: true }, select: { id: true, domain: true, pageBudget: true, delayMs: true }, orderBy: { domain: "asc" },
    });
  }
  return rows
    .map((row) => ({ id: row.id, kind: "site" as const, domain: row.domain, pageBudget: row.pageBudget, delayMs: row.delayMs }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
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
      enabled: input.enabled ?? false, approvedBy: actorId, createdAt: new Date(),
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
