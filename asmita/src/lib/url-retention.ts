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
