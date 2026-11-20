import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

export const URL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// The hourly sweep removes records up to one hour before the 30-day deadline.
const SWEEP_LEAD_MS = 60 * 60 * 1000;

export function urlRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - URL_RETENTION_MS);
}

export function isUrlExpired(submittedAt: Date, now = new Date()): boolean {
  return submittedAt.getTime() <= urlRetentionCutoff(now).getTime();
}

/** Remove URL-bearing material while retaining notice and case history.
 * Empty strings mark redacted URL fields; no URL or digest is preserved.
 */
export async function purgeExpiredUrls(now = new Date()): Promise<number> {
  const cutoff = new Date(urlRetentionCutoff(now).getTime() + SWEEP_LEAD_MS);
  if (usesWorkerKysely()) {
    return getWorkerDb().transaction().execute(async (tx) => {
      const expired = await tx.selectFrom("SubmittedUrl").select("id")
        .where("submittedAt", "<=", cutoff).where("urlEncrypted", "!=", "")
        .forUpdate().execute();
      const ids = expired.map((row) => row.id);
      if (!ids.length) return 0;
      await tx.deleteFrom("UrlPortalToken").where("urlId", "in", ids).execute();
      // Removal re-checks (watch-and-verify WP23) work from the link's
      // address; once the retention removed it they can never run, so the
      // still-pending ones go with it. Completed checks stay as history.
      await tx.deleteFrom("LinkVerification").where("submittedUrlId", "in", ids).where("outcome", "=", "PENDING").execute();
      await tx.updateTable("SubmittedUrl").set({
        urlEncrypted: "", urlHash: "", signedNoticePdf: null, signedHashSubmissionIds: [],
        signedTemplateId: null, signedTemplateDigest: null,
      }).where("id", "in", ids).execute();
      // A representative notice PDF names the page and image addresses too.
      // Its digest, template, authorisation and sender ids stay as the record.
      await tx.updateTable("SubmittedUrl").set({ representativeNoticePdf: null })
        .where("id", "in", ids).where("representativeNoticePdf", "is not", null).execute();
      return ids.length;
    });
  }
  const { db } = await import("@/lib/db");
  return db.$transaction(async (tx) => {
    const expired = await tx.submittedUrl.findMany({
      where: { submittedAt: { lte: cutoff }, urlEncrypted: { not: "" } }, select: { id: true },
    });
    const ids = expired.map((row) => row.id);
    if (!ids.length) return 0;
    await tx.urlPortalToken.deleteMany({ where: { urlId: { in: ids } } });
    // Removal re-checks (watch-and-verify WP23) work from the link's
    // address; once the retention removed it they can never run, so the
    // still-pending ones go with it. Completed checks stay as history.
    await tx.linkVerification.deleteMany({ where: { submittedUrlId: { in: ids }, outcome: "PENDING" } });
    const result = await tx.submittedUrl.updateMany({
      where: { id: { in: ids }, submittedAt: { lte: cutoff } },
      data: {
        urlEncrypted: "", urlHash: "", signedNoticePdf: null, signedHashSubmissionIds: [],
        signedTemplateId: null, signedTemplateDigest: null,
      },
    });
    // A representative notice PDF names the page and image addresses too.
    // Its digest, template, authorisation and sender ids stay as the record.
    await tx.submittedUrl.updateMany({
      where: { id: { in: ids }, representativeNoticePdf: { not: null } },
      data: { representativeNoticePdf: null },
    });
    return result.count;
  });
}

/**
 * Crawler findings follow the same 30 days, counted from when the crawler
 * first saw the copy. The page and image URLs and the dedup digest are
 * blanked; the row (distance, review status, dates) stays as the record.
 * Independent of purgeExpiredUrls so neither can skip the other.
 */
export async function purgeExpiredCrawlFindings(now = new Date()): Promise<number> {
  const cutoff = new Date(urlRetentionCutoff(now).getTime() + SWEEP_LEAD_MS);
  const blank = { pageUrlEncrypted: "", imageUrlEncrypted: "", urlDigest: null };
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    const { crawlMemory } = await import("@/lib/crawl-store");
    let count = 0;
    for (const finding of crawlMemory().findings.values()) {
      if (finding.firstSeenAt.getTime() <= cutoff.getTime() && finding.pageUrlEncrypted !== "") {
        Object.assign(finding, blank);
        count += 1;
      }
    }
    return count;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("CrawlFinding").set(blank)
      .where("firstSeenAt", "<=", cutoff).where("pageUrlEncrypted", "!=", "").executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
  const { db } = await import("@/lib/db");
  const result = await db.crawlFinding.updateMany({
    where: { firstSeenAt: { lte: cutoff }, pageUrlEncrypted: { not: "" } },
    data: blank,
  });
  return result.count;
}

/**
 * Frontier rows (crawler v2 WP3) follow the same 30 days as findings, counted
 * from the last visit (or creation, if never visited). A frontier row is
 * operational state, not a record, so it is deleted, not blanked — a row
 * without its URL can never be crawled again. Rows still due for crawling
 * are kept: their work has not happened yet, and the schedule window is at
 * most 14 days, so a live row past its due date means the crawler has not
 * run and its pending work must not be silently dropped. Dead rows (gone or
 * five failures) are never due again and always leave with the retention.
 * Review fix: rows of a source that is switched off (by an admin, a block or
 * a 30-day pause) are not waiting for a crawler, so they leave with the
 * retention too, due or not; the per-source row cap (crawl-pages.ts) bounds
 * the rest.
 */
export async function purgeExpiredCrawlPages(now = new Date()): Promise<number> {
  const cutoff = new Date(urlRetentionCutoff(now).getTime() + SWEEP_LEAD_MS);
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    const { crawlMemory } = await import("@/lib/crawl-store");
    const memory = crawlMemory();
    const expired: string[] = [];
    for (const page of memory.pages.values()) {
      const last = (page.lastFetchedAt ?? page.createdAt).getTime();
      const sourceOn = memory.sources.get(page.sourceId)?.enabled === true;
      const stillDue = sourceOn && page.nextDueAt.getTime() <= now.getTime() && page.status !== "DEAD" && page.status !== "GONE";
      if (last <= cutoff.getTime() && !stillDue) expired.push(page.id);
    }
    for (const id of expired) memory.pages.delete(id);
    return expired.length;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().deleteFrom("CrawlPage")
      .where((eb) => eb.and([
        eb.or([eb("lastFetchedAt", "<=", cutoff), eb.and([eb("lastFetchedAt", "is", null), eb("createdAt", "<=", cutoff)])]),
        eb.or([
          eb("status", "in", ["DEAD", "GONE"]),
          eb("nextDueAt", ">", now),
          eb("sourceId", "in", eb.selectFrom("CrawlSource").select("id").where("enabled", "=", false)),
        ]),
      ])).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
  const { db } = await import("@/lib/db");
  const result = await db.crawlPage.deleteMany({
    where: {
      AND: [
        {
          OR: [
            { lastFetchedAt: { lte: cutoff } },
            { lastFetchedAt: null, createdAt: { lte: cutoff } },
          ],
        },
        {
          OR: [
            { status: { in: ["DEAD", "GONE"] } },
            { nextDueAt: { gt: now } },
            { source: { enabled: false } },
          ],
        },
      ],
    },
  });
  return result.count;
}
