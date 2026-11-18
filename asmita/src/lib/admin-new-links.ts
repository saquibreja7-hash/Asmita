// Links a survivor added to a case she had already filed: the console's
// "New links" list and its unseen count. A link counts as added later when it
// arrived more than ADDED_AFTER_MS after the case was opened (links filed with
// the case arrive with it). Crawler links are excluded (the Findings page
// covers those). Named columns only: never the encrypted link.
import { db } from "@/lib/db";
import * as store from "@/lib/store";
import { findPlatformByDomain } from "@/lib/platforms";

export const ADDED_AFTER_MS = 5 * 60_000;
export const NEW_LINKS_WINDOW_DAYS = 30;
/** Per-browser marker of when this admin last opened New links. */
export const NEW_LINKS_SEEN_COOKIE = "asmita_admin_links_seen";

export type AddedLinkRow = {
  urlId: string;
  caseId: string;
  referenceNumber: string;
  platformName: string;
  domain: string;
  status: string;
  addedAt: Date;
};

const devNoDb = () => !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

/** Newest first, within the last NEW_LINKS_WINDOW_DAYS. */
export async function listAddedLinks(now = new Date()): Promise<AddedLinkRow[]> {
  const since = new Date(now.getTime() - NEW_LINKS_WINDOW_DAYS * 86_400_000);
  const rows: AddedLinkRow[] = [];
  if (devNoDb()) {
    for (const record of store.cases.values()) {
      const opened = new Date(record.createdAt).getTime();
      for (const url of record.urls) {
        if (url.source === "CRAWLER" || !url.submittedAt) continue;
        const added = new Date(url.submittedAt);
        if (added < since || added.getTime() - opened <= ADDED_AFTER_MS) continue;
        rows.push({ urlId: url.id, caseId: record.id, referenceNumber: record.referenceNumber, platformName: url.platformName, domain: url.domain, status: url.status, addedAt: added });
      }
    }
  } else {
    const links = await db.submittedUrl.findMany({
      where: { submittedAt: { gte: since }, NOT: { source: "CRAWLER" } },
      orderBy: { submittedAt: "desc" },
      take: 500,
      select: {
        id: true,
        domain: true,
        status: true,
        submittedAt: true,
        platform: { select: { name: true } },
        case: { select: { id: true, referenceNumber: true, createdAt: true } },
      },
    });
    for (const link of links) {
      if (link.submittedAt.getTime() - link.case.createdAt.getTime() <= ADDED_AFTER_MS) continue;
      rows.push({
        urlId: link.id,
        caseId: link.case.id,
        referenceNumber: link.case.referenceNumber,
        platformName: link.platform?.name ?? findPlatformByDomain(link.domain)?.name ?? "Unknown platform",
        domain: link.domain,
        status: link.status,
        addedAt: link.submittedAt,
      });
    }
  }
  return rows.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
}

// The sidebar badge runs on every console page; like the Needs action count,
// it reuses a result for 30 seconds instead of querying on each render.
// Only the times are kept: no case id, reference or domain stays in memory.
let badgeCache: { at: number; rows: { addedAt: Date }[] } | null = null;
export async function listAddedLinksForBadge(now = new Date()): Promise<{ addedAt: Date }[]> {
  if (badgeCache && now.getTime() - badgeCache.at < 30_000) return badgeCache.rows;
  const rows = (await listAddedLinks(now)).map((row) => ({ addedAt: row.addedAt }));
  badgeCache = { at: now.getTime(), rows };
  return rows;
}

/** How many were added after `seenAt` (all in the window when never opened). */
export function countUnseen(rows: { addedAt: Date }[], seenAt: Date | null): number {
  return seenAt ? rows.filter((row) => row.addedAt > seenAt).length : rows.length;
}

/** Reads the seen marker; anything malformed counts as never seen. */
export function parseSeenCookie(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
