import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { crawlPageDigest, ensurePriorityCrawlPage } from "@/lib/crawl-pages";
import { caseHasPoolFingerprints } from "@/lib/crawl-pool";
import { ensureCrawlSourceForReportedHost } from "@/lib/crawl-sources";
import { crawlerShapedUrl } from "@/lib/crawl-findings";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { decryptField } from "@/lib/encryption";
import { sendLinkStillOnlineNotification } from "@/lib/email";
import { parseSubmittedUrl } from "@/lib/url-parser";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Check that removed content stayed down (watch-and-verify spec WP23).
 *
 * When one of her links becomes REMOVED — she marks it removed, or a
 * platform's recorded reply says so — three re-checks are scheduled: one day,
 * three days and seven days later (attempts 1..3). The hourly retention cron
 * (/api/cron/purge-expired-urls) runs sweepDueLinkVerifications:
 *
 * - Enqueue: each due check is put into the crawler frontier as a priority
 *   row (due now, ahead of every scheduled revisit) for its host's crawl
 *   source, creating a REPORTED source through the existing rules when none
 *   exists. A never-crawl host cannot be checked, so the outcome is UNKNOWN.
 *   The crawler then visits the page like any other, through the same
 *   claim/report path — there is no second fetch path.
 * - Resolve: from the crawler's report on that page row. A finding for that
 *   page address on her case since the check was queued decides first, at
 *   any moment — her image was seen there. Otherwise: the page gone or
 *   blocked (404/410, robots) is GONE; a fetched page is GONE only when the
 *   crawler was matching her fingerprints (a live crawl authorisation
 *   listing an approved fingerprint, exactly the pool's rule), because only
 *   then does "no match" mean the image is no longer there; without them a
 *   fetched page — and a page that answered "not modified", whose images
 *   were not re-hashed — is UNKNOWN. Resolution of a fetched page waits two
 *   hours after the report so findings still in flight can arrive.
 *
 * On STILL_ONLINE the link returns to the notice-sent state (which re-arms
 * the existing automated follow-up/escalation, escalation-engine.ts), the
 * episode's remaining attempts are dropped, and she gets an email that
 * carries only her case reference and a sign-in prompt.
 *
 * Privacy: this table stores no URL — a check works from the SubmittedUrl
 * it references, and nothing here is logged or audited with an address. The
 * frontier row the check creates is ordinary frontier state (encrypted at
 * rest, purged with the 30-day retention). Erasure deletes a case's checks
 * with its links.
 *
 * The three backends stay aligned (memory, Kysely on the Worker, Prisma);
 * every update that decides an outcome is conditional on the row still
 * being PENDING, so two sweeps can never double-resolve a check.
 */

/** The +1/+3/+7 day checks (spec: attempts 1..3). */
export const VERIFICATION_DELAYS_MS = [24, 72, 168].map((hours) => hours * 60 * 60 * 1000) as readonly number[];
/** How long after the report of a fetched page findings may still arrive (spec: two hours). */
export const VERIFICATION_FINDING_GRACE_MS = 2 * 60 * 60 * 1000;
/**
 * A check whose page was never visited (source switched off, budget spent,
 * page erroring forever) resolves UNKNOWN this long after it was queued, so
 * no check waits forever. The spec's schedule ends at +7 days; this bounds
 * the wait beyond it.
 */
export const VERIFICATION_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
/** At most this many due checks are enqueued and resolved per sweep; the rest wait an hour. */
export const VERIFICATION_SWEEP_BATCH = 200;

export type LinkVerificationOutcome = "PENDING" | "GONE" | "STILL_ONLINE" | "UNKNOWN";

export type VerificationRow = {
  id: string;
  submittedUrlId: string;
  dueAt: Date;
  attempt: number;
  outcome: LinkVerificationOutcome;
  checkedAt: Date | null;
  enqueuedAt: Date | null;
  createdAt: Date;
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Storage, three aligned paths

type CheckLink = { id: string; caseId: string; urlEncrypted: string; urlHash: string; domain: string; status: string };

const LINK_SELECT = ["id", "caseId", "urlEncrypted", "urlHash", "domain", "status"] as const;

async function loadLink(urlId: string): Promise<CheckLink | null> {
  if (isDevNoDb()) {
    for (const record of store.cases.values()) {
      const url = record.urls.find((item) => item.id === urlId);
      if (url) {
        return { id: url.id, caseId: record.id, urlEncrypted: url.urlEncrypted ?? "", urlHash: url.urlHash, domain: url.domain, status: url.status };
      }
    }
    return null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("SubmittedUrl").select([...LINK_SELECT])
      .where("id", "=", urlId).executeTakeFirst();
    return row ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.submittedUrl.findUnique({ where: { id: urlId }, select: { id: true, caseId: true, urlEncrypted: true, urlHash: true, domain: true, status: true } });
}

/** The link's address, or null once the retention blanking removed it. */
function decryptLinkUrl(link: { urlEncrypted: string }): string | null {
  if (!link.urlEncrypted) return null;
  try {
    return decryptField(link.urlEncrypted);
  } catch {
    return null;
  }
}

/** Whether the case has checks still waiting. */
async function hasPendingChecks(urlId: string): Promise<boolean> {
  if (isDevNoDb()) {
    for (const row of crawlMemory().linkVerifications.values()) if (row.submittedUrlId === urlId && row.outcome === "PENDING") return true;
    return false;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("LinkVerification").select("id")
      .where("submittedUrlId", "=", urlId).where("outcome", "=", "PENDING").limit(1).executeTakeFirst();
    return row !== undefined;
  }
  const { db } = await import("@/lib/db");
  return (await db.linkVerification.count({ where: { submittedUrlId: urlId, outcome: "PENDING" } })) > 0;
}

type NewVerification = { id: string; submittedUrlId: string; dueAt: Date; attempt: number; caseId?: string };

async function insertVerifications(rows: NewVerification[], createdAt: Date): Promise<void> {
  if (rows.length === 0) return;
  if (isDevNoDb()) {
    const memory = crawlMemory();
    for (const row of rows) {
      memory.linkVerifications.set(row.id, {
        id: row.id, caseId: row.caseId ?? "", submittedUrlId: row.submittedUrlId,
        dueAt: row.dueAt, attempt: row.attempt, outcome: "PENDING", checkedAt: null, enqueuedAt: null, createdAt,
      });
    }
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("LinkVerification").values(
      rows.map((row) => ({ id: row.id, submittedUrlId: row.submittedUrlId, dueAt: row.dueAt, attempt: row.attempt })),
    ).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.linkVerification.createMany({
    data: rows.map((row) => ({ id: row.id, submittedUrlId: row.submittedUrlId, dueAt: row.dueAt, attempt: row.attempt })),
  });
}

type SweepCandidate = { id: string; submittedUrlId: string; attempt: number; dueAt: Date; enqueuedAt: Date | null };

/** The due checks of one kind, oldest first, bounded by the sweep batch. */
async function pendingChecks(kind: "not_enqueued" | "enqueued", now: Date, limit: number): Promise<SweepCandidate[]> {
  const cols = ["id", "submittedUrlId", "attempt", "dueAt", "enqueuedAt"] as const;
  if (isDevNoDb()) {
    return [...crawlMemory().linkVerifications.values()]
      .filter((row) =>
        row.outcome === "PENDING" &&
        (kind === "not_enqueued"
          ? row.enqueuedAt === null && row.dueAt.getTime() <= now.getTime()
          : row.enqueuedAt !== null))
      .sort((a, b) => (kind === "not_enqueued" ? a.dueAt.getTime() - b.dueAt.getTime() : a.enqueuedAt!.getTime() - b.enqueuedAt!.getTime()))
      .slice(0, limit)
      .map((row) => ({ id: row.id, submittedUrlId: row.submittedUrlId, attempt: row.attempt, dueAt: row.dueAt, enqueuedAt: row.enqueuedAt }));
  }
  if (usesWorkerKysely()) {
    const db = getWorkerDb();
    if (kind === "not_enqueued") {
      return db.selectFrom("LinkVerification").select([...cols])
        .where("outcome", "=", "PENDING").where("dueAt", "<=", now).where("enqueuedAt", "is", null)
        .orderBy("dueAt", "asc").limit(limit).execute();
    }
    return db.selectFrom("LinkVerification").select([...cols])
      .where("outcome", "=", "PENDING").where("enqueuedAt", "is not", null)
      .orderBy("enqueuedAt", "asc").limit(limit).execute();
  }
  const { db } = await import("@/lib/db");
  return db.linkVerification.findMany({
    where: kind === "not_enqueued"
      ? { outcome: "PENDING", dueAt: { lte: now }, enqueuedAt: null }
      : { outcome: "PENDING", enqueuedAt: { not: null } },
    orderBy: kind === "not_enqueued" ? { dueAt: "asc" } : { enqueuedAt: "asc" },
    take: limit,
    select: { id: true, submittedUrlId: true, attempt: true, dueAt: true, enqueuedAt: true },
  });
}

/** Marks one PENDING check, once; false when another sweep already moved it. */
async function updatePending(id: string, data: { outcome?: LinkVerificationOutcome; checkedAt?: Date; enqueuedAt?: Date }, now: Date): Promise<boolean> {
  if (isDevNoDb()) {
    const row = crawlMemory().linkVerifications.get(id);
    if (!row || row.outcome !== "PENDING") return false;
    if (data.outcome !== undefined) {
      row.outcome = data.outcome;
      row.checkedAt = data.checkedAt ?? now;
    } else {
      row.enqueuedAt = data.enqueuedAt ?? now;
    }
    return true;
  }
  if (usesWorkerKysely()) {
    const set = data.outcome !== undefined
      ? { outcome: data.outcome, checkedAt: data.checkedAt ?? now }
      : { enqueuedAt: data.enqueuedAt ?? now };
    const result = await getWorkerDb().updateTable("LinkVerification").set(set)
      .where("id", "=", id).where("outcome", "=", "PENDING").executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }
  const { db } = await import("@/lib/db");
  const result = await db.linkVerification.updateMany({
    where: { id, outcome: "PENDING" },
    data: data.outcome !== undefined ? { outcome: data.outcome, checkedAt: data.checkedAt ?? now } : { enqueuedAt: data.enqueuedAt ?? now },
  });
  return result.count === 1;
}

/** Drops the still-pending checks of the given links (an ended episode). */
async function deletePendingForUrls(urlIds: string[]): Promise<number> {
  if (urlIds.length === 0) return 0;
  if (isDevNoDb()) {
    const ids = new Set(urlIds);
    let deleted = 0;
    for (const [id, row] of crawlMemory().linkVerifications) {
      if (ids.has(row.submittedUrlId) && row.outcome === "PENDING") {
        crawlMemory().linkVerifications.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().deleteFrom("LinkVerification")
      .where("submittedUrlId", "in", urlIds).where("outcome", "=", "PENDING").executeTakeFirst();
    return Number(result.numDeletedRows);
  }
  const { db } = await import("@/lib/db");
  const result = await db.linkVerification.deleteMany({ where: { submittedUrlId: { in: urlIds }, outcome: "PENDING" } });
  return result.count;
}

/** The crawl source of a host, whatever its origin and state. */
async function findSourceIdByDomain(domain: string): Promise<string | null> {
  if (isDevNoDb()) {
    for (const source of crawlMemory().sources.values()) if (source.domain === domain) return source.id;
    return null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlSource").select("id")
      .where("domain", "=", domain).executeTakeFirst();
    return row?.id ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.crawlSource.findFirst({ where: { domain }, select: { id: true } });
  return row?.id ?? null;
}

type PageState = { status: string; lastFetchedAt: Date | null };

/** The frontier row of the check's page, if it still exists. */
async function loadPageRow(sourceId: string, digest: string): Promise<PageState | null> {
  if (isDevNoDb()) {
    for (const page of crawlMemory().pages.values()) {
      if (page.sourceId === sourceId && page.urlDigest === digest) return { status: page.status, lastFetchedAt: page.lastFetchedAt };
    }
    return null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlPage").select(["status", "lastFetchedAt"])
      .where("sourceId", "=", sourceId).where("urlDigest", "=", digest).executeTakeFirst();
    return row ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.crawlPage.findUnique({ where: { sourceId_urlDigest: { sourceId, urlDigest: digest } }, select: { status: true, lastFetchedAt: true } });
}

/**
 * Whether the crawler reported a finding for exactly this page address on
 * her case since the check was queued: the finding's page URL, normalised
 * the same way as her link, hashes to the link's urlHash ("the same address
 * digest"). Findings blanked by the retention no longer carry an address and
 * never match.
 */
async function hasFindingForPage(caseId: string, urlHash: string, since: Date): Promise<boolean> {
  let rows: Array<{ pageUrlEncrypted: string }>;
  if (isDevNoDb()) {
    rows = [...crawlMemory().findings.values()]
      .filter((finding) => finding.caseId === caseId && finding.lastSeenAt.getTime() >= since.getTime())
      .map((finding) => ({ pageUrlEncrypted: finding.pageUrlEncrypted }));
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("CrawlFinding").select(["pageUrlEncrypted"])
      .where("caseId", "=", caseId).where("lastSeenAt", ">=", since).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlFinding.findMany({
      where: { caseId, lastSeenAt: { gte: since } },
      select: { pageUrlEncrypted: true },
    });
  }
  for (const row of rows) {
    if (!row.pageUrlEncrypted) continue;
    let pageUrl: string;
    try {
      pageUrl = decryptField(row.pageUrlEncrypted);
    } catch {
      continue;
    }
    const parsed = parseSubmittedUrl(pageUrl);
    if (parsed.ok && parsed.urlHash === urlHash) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scheduling

/**
 * Schedules the three re-checks for a link that just became REMOVED. The
 * callers invoke it only on a real transition into REMOVED; re-marking an
 * already-removed link schedules nothing new. Idempotent on its own too: a
 * second call while checks are still pending adds none.
 */
export async function scheduleLinkVerifications(urlId: string, now = new Date()): Promise<{ scheduled: number }> {
  const link = await loadLink(urlId);
  if (!link) return { scheduled: 0 };
  if (await hasPendingChecks(urlId)) return { scheduled: 0 };
  const rows = VERIFICATION_DELAYS_MS.map((delay, index) => ({
    id: randomUUID(),
    submittedUrlId: urlId,
    dueAt: new Date(now.getTime() + delay),
    attempt: index + 1,
    caseId: link.caseId, // memory path only; ignored on the database paths
  }));
  await insertVerifications(rows, now);
  return { scheduled: rows.length };
}

// ---------------------------------------------------------------------------
// The hourly sweep

export type LinkVerificationSweepSummary = { enqueued: number; resolved: number; stillOnline: number };

/**
 * The hourly sweep (wired into /api/cron/purge-expired-urls): enqueues the
 * due checks into the crawler frontier, then resolves the enqueued ones from
 * the crawler's reports. Does nothing while the crawler is switched off —
 * no page would be fetched, so checks wait as PENDING until it is back.
 */
export async function sweepDueLinkVerifications(now = new Date()): Promise<LinkVerificationSweepSummary> {
  if (!crawlerEnabled()) return { enqueued: 0, resolved: 0, stillOnline: 0 };
  const enqueue = await enqueueDueChecks(now);
  const resolve = await resolveEnqueuedChecks(now);
  // Checks resolved without a frontier row (never-crawl host, purged address)
  // are outcomes too, so both steps count.
  return { enqueued: enqueue.enqueued, resolved: enqueue.resolved + resolve.resolved, stillOnline: resolve.stillOnline };
}

/** Step 1: each due, never-enqueued check goes to the frontier (or resolves without one). */
async function enqueueDueChecks(now: Date): Promise<{ enqueued: number; resolved: number }> {
  let enqueued = 0;
  let resolved = 0;
  for (const check of await pendingChecks("not_enqueued", now, VERIFICATION_SWEEP_BATCH)) {
    const link = await loadLink(check.submittedUrlId);
    if (link && link.status !== "REMOVED") {
      // The episode ended: the link is no longer removed, so the checks
      // still waiting for it are dropped. A later removal schedules fresh ones.
      await deletePendingForUrls([link.id]);
      continue;
    }
    const url = link ? decryptLinkUrl(link) : null;
    if (!link || !url) {
      // Erased, or the retention already removed the address: nothing to check.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const parsed = parseSubmittedUrl(url);
    if (!parsed.ok || !crawlerShapedUrl(url)) {
      // The crawler refuses credentials and non-default ports, like findings.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const ensured = await ensureCrawlSourceForReportedHost(parsed.domain);
    let sourceId: string | null = null;
    if (ensured.created) sourceId = ensured.id;
    else if (ensured.reason === "exists") sourceId = await findSourceIdByDomain(parsed.domain);
    else {
      // A never-crawl host cannot be checked (spec): UNKNOWN, no source, no row.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    if (!sourceId || !(await ensurePriorityCrawlPage(sourceId, parsed.normalizedUrl, now))) {
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    if (await updatePending(check.id, { enqueuedAt: now }, now)) enqueued += 1;
  }
  return { enqueued, resolved };
}

/** Step 2: resolve the enqueued checks from the crawler's reports. */
async function resolveEnqueuedChecks(now: Date): Promise<{ resolved: number; stillOnline: number }> {
  let resolved = 0;
  let stillOnline = 0;
  for (const check of await pendingChecks("enqueued", now, VERIFICATION_SWEEP_BATCH)) {
    const link = await loadLink(check.submittedUrlId);
    const url = link ? decryptLinkUrl(link) : null;
    if (!link || !url) {
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const parsed = parseSubmittedUrl(url);
    const sourceId = parsed.ok ? await findSourceIdByDomain(parsed.domain) : null;
    const digest = parsed.ok && sourceId ? crawlPageDigest(sourceId, parsed.normalizedUrl) : null;
    if (!parsed.ok || !sourceId || !digest) {
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const queuedAt = check.enqueuedAt ?? check.dueAt;
    // A finding for this page on her case decides first, whatever the page
    // row says: her image was seen there since the check was queued.
    if (await hasFindingForPage(link.caseId, link.urlHash, queuedAt)) {
      if (await markStillOnline(check, link, now)) {
        resolved += 1;
        stillOnline += 1;
      }
      continue;
    }
    const page = await loadPageRow(sourceId, digest);
    if (!page) {
      // The frontier row left with the retention: nothing is coming.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const giveUp = queuedAt.getTime() + VERIFICATION_GIVE_UP_MS <= now.getTime();
    if (page.status === "PENDING" || page.status === "ERROR") {
      if (!giveUp) continue; // not visited yet, or backing off between errors
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    if (page.status === "DEAD") {
      // Five failed visits: the page cannot be checked.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    if (page.status === "GONE" || page.status === "BLOCKED") {
      // 404/410, or robots/401/403: the page is gone (spec).
      if (await updatePending(check.id, { outcome: "GONE", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    // FETCHED or NOT_MODIFIED: a report after the check was queued set
    // lastFetchedAt. Findings may still be in flight for two hours.
    const fetchedAt = page.lastFetchedAt ? page.lastFetchedAt.getTime() : 0;
    if (now.getTime() - fetchedAt < VERIFICATION_FINDING_GRACE_MS) continue;
    if (page.status === "NOT_MODIFIED") {
      // The images were not re-hashed, so the page says nothing about them.
      if (await updatePending(check.id, { outcome: "UNKNOWN", checkedAt: now }, now)) resolved += 1;
      continue;
    }
    const imageLevel = await caseHasPoolFingerprints(link.caseId);
    const outcome: LinkVerificationOutcome = imageLevel ? "GONE" : "UNKNOWN";
    if (await updatePending(check.id, { outcome, checkedAt: now }, now)) resolved += 1;
  }
  return { resolved, stillOnline };
}

/** Records a STILL_ONLINE outcome and everything that follows from it. */
async function markStillOnline(check: SweepCandidate, link: CheckLink, now: Date): Promise<boolean> {
  // The outcome first, conditionally: only the sweep that wins this update
  // acts on the episode.
  if (!(await updatePending(check.id, { outcome: "STILL_ONLINE", checkedAt: now }, now))) return false;
  const flipped = await flipLinkToNoticeSent(link.id);
  // The episode's remaining attempts are dropped: the link is back in the
  // notice-sent flow, and a later removal schedules fresh checks.
  await deletePendingForUrls([link.id]);
  if (!flipped) return true; // the link had already moved on; the outcome stands as history
  await writeAuditLog({
    eventType: "CONTENT_STILL_ONLINE",
    entityType: "SubmittedUrl",
    entityId: link.id,
    data: { caseId: link.caseId, attempt: check.attempt, verificationId: check.id },
  });
  try {
    await emailStillOnline(link.caseId, check.id);
  } catch {
    console.error("verification_email_failed"); // fixed code only, never an address
  }
  return true;
}

/** REMOVED -> NOTICE_SENT, only while the link is still removed. */
async function flipLinkToNoticeSent(urlId: string): Promise<boolean> {
  if (isDevNoDb()) {
    for (const record of store.cases.values()) {
      const url = record.urls.find((item) => item.id === urlId);
      if (!url) continue;
      if (url.status !== "REMOVED") return false;
      url.status = "NOTICE_SENT";
      return true;
    }
    return false;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("SubmittedUrl").set({ status: "NOTICE_SENT" })
      .where("id", "=", urlId).where("status", "=", "REMOVED").executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }
  const { db } = await import("@/lib/db");
  const result = await db.submittedUrl.updateMany({ where: { id: urlId, status: "REMOVED" }, data: { status: "NOTICE_SENT" } });
  return result.count === 1;
}

/** The reference-only email (email.ts); never an address or site name. */
async function emailStillOnline(caseId: string, verificationId: string): Promise<void> {
  let record: { referenceNumber: string; emailEncrypted: string | null; preferredLocale: string | null } | null = null;
  if (isDevNoDb()) {
    const rec = store.cases.get(caseId) ?? null;
    const user = rec ? store.users.get(rec.userId) ?? null : null;
    record = rec ? { referenceNumber: rec.referenceNumber, emailEncrypted: user?.emailEncrypted ?? null, preferredLocale: null } : null;
  } else if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("Case as c")
      .leftJoin("User as usr", "usr.id", "c.userId")
      .select(["c.referenceNumber", "usr.emailEncrypted", "usr.preferredLocale"])
      .where("c.id", "=", caseId).executeTakeFirst();
    record = row ? { referenceNumber: row.referenceNumber, emailEncrypted: row.emailEncrypted ?? null, preferredLocale: row.preferredLocale ?? null } : null;
  } else {
    const { db } = await import("@/lib/db");
    const row = await db.case.findUnique({
      where: { id: caseId },
      select: { referenceNumber: true, user: { select: { emailEncrypted: true, preferredLocale: true } } },
    });
    record = row ? { referenceNumber: row.referenceNumber, emailEncrypted: row.user?.emailEncrypted ?? null, preferredLocale: row.user?.preferredLocale ?? null } : null;
  }
  if (!record?.emailEncrypted) return;
  let to: string;
  try {
    to = decryptField(record.emailEncrypted);
  } catch {
    return;
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");
  await sendLinkStillOnlineNotification(
    to,
    record.referenceNumber,
    `${appUrl}/case/${caseId}`,
    record.preferredLocale === "hi" ? "hi" : "en",
    `verify-still:${verificationId}`,
  );
}

// ---------------------------------------------------------------------------
// Reads for the case pages

export type LinkVerificationSummary = {
  /** Checks still waiting to run. */
  pending: number;
  /** Completed checks. */
  checked: number;
  /** GONE results so far; three mean "verified removed". */
  goneCount: number;
  /** The outcome of the most recently completed check. */
  latestOutcome: LinkVerificationOutcome | null;
};

/** Per-link verification summaries for the survivor's case page. */
export async function getLinkVerificationSummaries(caseId: string): Promise<Map<string, LinkVerificationSummary>> {
  const urlIds = await caseLinkIds(caseId);
  const rows = await verificationsForUrls(urlIds);
  return summarise(rows);
}

/** The admin case page's verification history, per link, oldest attempt first. */
export async function listLinkVerifications(urlIds: string[]): Promise<Map<string, Array<{ id: string; attempt: number; outcome: LinkVerificationOutcome; dueAt: string; checkedAt: string | null }>>> {
  const rows = await verificationsForUrls(urlIds);
  const map = new Map<string, Array<{ id: string; attempt: number; outcome: LinkVerificationOutcome; dueAt: string; checkedAt: string | null }>>();
  for (const row of [...rows].sort((a, b) => a.attempt - b.attempt)) {
    const list = map.get(row.submittedUrlId) ?? [];
    list.push({ id: row.id, attempt: row.attempt, outcome: row.outcome, dueAt: row.dueAt.toISOString(), checkedAt: row.checkedAt ? row.checkedAt.toISOString() : null });
    map.set(row.submittedUrlId, list);
  }
  return map;
}

async function caseLinkIds(caseId: string): Promise<string[]> {
  if (isDevNoDb()) {
    return (store.cases.get(caseId)?.urls ?? []).map((url) => url.id);
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("SubmittedUrl").select("id").where("caseId", "=", caseId).execute();
    return rows.map((row) => row.id);
  }
  const { db } = await import("@/lib/db");
  const rows = await db.submittedUrl.findMany({ where: { caseId }, select: { id: true } });
  return rows.map((row) => row.id);
}

async function verificationsForUrls(urlIds: string[]): Promise<VerificationRow[]> {
  if (urlIds.length === 0) return [];
  const cols = ["id", "submittedUrlId", "dueAt", "attempt", "outcome", "checkedAt", "enqueuedAt", "createdAt"] as const;
  if (isDevNoDb()) {
    const ids = new Set(urlIds);
    return [...crawlMemory().linkVerifications.values()].filter((row) => ids.has(row.submittedUrlId));
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("LinkVerification").select([...cols])
      .where("submittedUrlId", "in", urlIds).orderBy("attempt", "asc").execute();
  }
  const { db } = await import("@/lib/db");
  return db.linkVerification.findMany({
    where: { submittedUrlId: { in: urlIds } },
    orderBy: { attempt: "asc" },
    select: { id: true, submittedUrlId: true, dueAt: true, attempt: true, outcome: true, checkedAt: true, enqueuedAt: true, createdAt: true },
  });
}

type WipSummary = LinkVerificationSummary & { latestCheckedAt: Date | null };

function summarise(rows: VerificationRow[]): Map<string, LinkVerificationSummary> {
  const map = new Map<string, WipSummary>();
  for (const row of rows) {
    const summary = map.get(row.submittedUrlId) ?? { pending: 0, checked: 0, goneCount: 0, latestOutcome: null, latestCheckedAt: null };
    if (row.outcome === "PENDING") {
      summary.pending += 1;
    } else {
      summary.checked += 1;
      if (row.outcome === "GONE") summary.goneCount += 1;
      // Rows arrive oldest-first, so >= keeps the newest completed check.
      if (summary.latestOutcome === null || (row.checkedAt?.getTime() ?? 0) >= (summary.latestCheckedAt?.getTime() ?? 0)) {
        summary.latestOutcome = row.outcome;
        summary.latestCheckedAt = row.checkedAt;
      }
    }
    map.set(row.submittedUrlId, summary);
  }
  const out = new Map<string, LinkVerificationSummary>();
  for (const [urlId, summary] of map) {
    out.set(urlId, { pending: summary.pending, checked: summary.checked, goneCount: summary.goneCount, latestOutcome: summary.latestOutcome });
  }
  return out;
}
