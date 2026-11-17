import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { validateCrawlDomain } from "@/lib/crawl-sources";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * The admin-managed half of the never-crawl list (full-crawler spec WP2):
 * rows in the CrawlBlockedHost table. The built-in half is the constant list
 * in crawl-never.ts; a host matches a row if it equals the row's host or is
 * a subdomain of it (isBlockedCrawlHost in crawl-sources.ts, which the
 * automatic paths use).
 *
 * SUPER_ADMIN only (crawler:manage), every change audited. While
 * ENABLE_CRAWLER is off the list still reads and changes are refused with
 * 503 crawler_disabled (the routes). The list stops the automatic paths
 * (a survivor's reported link, an approved finding, from WP5 a discovered
 * link). Blocking a host also switches off every existing source for it or a
 * subdomain of it, whatever its origin (disabledReason "blocked_host", any
 * automatic pause cleared so the sweep cannot resume it), and the frontier
 * hands out no pages for a blocked host (crawl-pages.ts) — a SUPER_ADMIN can
 * still add such a host by hand, but it is not crawled while blocked.
 * Unblocking switches nothing back on: an admin decides.
 */

/** Why a source was switched off when its host was blocked. */
export const DISABLED_REASON_BLOCKED_HOST = "blocked_host";

export const blockedHostSchema = z.object({
  host: z.string().min(1).max(253),
  reason: z.string().trim().min(1).max(200),
}).strict();

export const removeBlockedHostSchema = z.object({
  id: z.string().min(1).max(64),
}).strict();

export type CrawlBlockedHostView = {
  id: string;
  host: string;
  reason: string;
  addedBy: string;
  createdAt: string;
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

type BlockedRow = Omit<CrawlBlockedHostView, "createdAt"> & { createdAt: Date | string };

function toView(row: BlockedRow): CrawlBlockedHostView {
  return {
    id: row.id, host: row.host, reason: row.reason, addedBy: row.addedBy,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const BLOCKED_COLUMNS = ["id", "host", "reason", "addedBy", "createdAt"] as const;

export async function listBlockedCrawlHosts(): Promise<CrawlBlockedHostView[]> {
  let rows: BlockedRow[];
  if (isDevNoDb()) {
    rows = [...crawlMemory().blockedHosts.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("CrawlBlockedHost").select([...BLOCKED_COLUMNS]).orderBy("host").execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlBlockedHost.findMany({ orderBy: { host: "asc" } });
  }
  return rows.map(toView).sort((a, b) => a.host.localeCompare(b.host));
}

export async function addBlockedCrawlHost(
  input: z.infer<typeof blockedHostSchema>,
  actorId: string,
): Promise<{ ok: true; host: CrawlBlockedHostView } | { ok: false; error: "invalid_domain" | "private_domain" | "blocked_host_exists" }> {
  // The same host rule as a crawl source, so entries are canonical public
  // host names (the automatic paths only ever ask about such hosts anyway).
  const checked = validateCrawlDomain(input.host);
  if (!checked.ok) return checked;
  // The schema trims; do it again so a direct caller cannot store whitespace.
  const reason = input.reason.trim();
  let view: CrawlBlockedHostView;
  if (isDevNoDb()) {
    if (crawlMemory().blockedHosts.has(checked.domain)) return { ok: false, error: "blocked_host_exists" };
    const row = { id: randomUUID(), host: checked.domain, reason, addedBy: actorId, createdAt: new Date() };
    crawlMemory().blockedHosts.set(row.host, row);
    view = toView(row);
  } else if (usesWorkerKysely()) {
    // One statement, so two admins cannot create the same row.
    const inserted = await getWorkerDb().insertInto("CrawlBlockedHost")
      .values({ id: randomUUID(), host: checked.domain, reason, addedBy: actorId, createdAt: new Date() })
      .onConflict((oc) => oc.column("host").doNothing())
      .returning([...BLOCKED_COLUMNS])
      .executeTakeFirst();
    if (!inserted) return { ok: false, error: "blocked_host_exists" };
    view = toView(inserted);
  } else {
    const { db } = await import("@/lib/db");
    try {
      view = toView(await db.crawlBlockedHost.create({ data: { host: checked.domain, reason, addedBy: actorId } }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "blocked_host_exists" };
      throw err;
    }
  }
  const disabledSourceIds = await disableSourcesForBlockedHost(view.host);
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "CrawlBlockedHost",
    entityId: view.id,
    actorId,
    data: { action: "crawl_blocked_host_added", host: view.host, reason, ...(disabledSourceIds.length > 0 ? { disabledSourceIds } : {}) },
  });
  return { ok: true, host: view };
}

/**
 * Switches off every source on `host` or a subdomain of it that is enabled
 * or carries an automatic pause, with disabledReason "blocked_host" and the
 * pause cleared (so the hourly sweep can never switch it back on). Returns
 * the ids changed, for the blocking admin's audit entry.
 */
async function disableSourcesForBlockedHost(host: string): Promise<string[]> {
  const off = { enabled: false, pausedUntil: null, pauseReason: null, disabledReason: DISABLED_REASON_BLOCKED_HOST };
  const suffix = `.${host}`;
  if (isDevNoDb()) {
    const ids: string[] = [];
    for (const source of crawlMemory().sources.values()) {
      if (source.domain !== host && !source.domain.endsWith(suffix)) continue;
      if (!source.enabled && source.pauseReason === null) continue;
      Object.assign(source, off);
      ids.push(source.id);
    }
    return ids;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().updateTable("CrawlSource").set(off)
      .where((eb) => eb.or([eb("domain", "=", host), eb("domain", "like", `%${suffix}`)]))
      .where((eb) => eb.or([eb("enabled", "=", true), eb("pauseReason", "is not", null)]))
      .returning("id").execute();
    return rows.map((row) => row.id);
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlSource.findMany({
    where: {
      AND: [
        { OR: [{ domain: host }, { domain: { endsWith: suffix } }] },
        { OR: [{ enabled: true }, { pauseReason: { not: null } }] },
      ],
    },
    select: { id: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  await db.crawlSource.updateMany({ where: { id: { in: ids } }, data: off });
  return ids;
}

export async function removeBlockedCrawlHost(
  id: string,
  actorId: string,
): Promise<{ ok: true; host: string } | { ok: false; error: "blocked_host_not_found" }> {
  let removed: string | null = null;
  if (isDevNoDb()) {
    for (const [host, row] of crawlMemory().blockedHosts) {
      if (row.id === id) {
        crawlMemory().blockedHosts.delete(host);
        removed = host;
        break;
      }
    }
  } else if (usesWorkerKysely()) {
    const row = await getWorkerDb().deleteFrom("CrawlBlockedHost").where("id", "=", id).returning("host").executeTakeFirst();
    removed = row?.host ?? null;
  } else {
    const { db } = await import("@/lib/db");
    const row = await db.crawlBlockedHost.findFirst({ where: { id }, select: { host: true } });
    if (row) {
      await db.crawlBlockedHost.deleteMany({ where: { id } });
      removed = row.host;
    }
  }
  if (!removed) return { ok: false, error: "blocked_host_not_found" };
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "CrawlBlockedHost",
    entityId: id,
    actorId,
    data: { action: "crawl_blocked_host_removed", host: removed },
  });
  return { ok: true, host: removed };
}
