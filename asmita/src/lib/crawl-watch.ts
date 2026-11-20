import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { isCaseOpen } from "@/lib/crawl-pool";
import { sendReuploadFoundNotification } from "@/lib/email";
import { decryptField } from "@/lib/encryption";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Watch for re-uploads after the case closes (watch-and-verify spec WP24).
 *
 * When a case is resolved — or every link on it is verified removed by the
 * WP23 re-checks — her live crawl authorisation gains a 12-month window
 * (`CrawlConsent.watchUntil`). Inside that window the pool keeps matching her
 * fingerprints (crawl-pool.ts's pool rule), so the crawler can find a
 * re-upload; an analyst then approves it like any finding and the existing
 * representative-notice path applies, because her full consent covers it.
 *
 * - The window is started by the hourly sweep that rides
 *   /api/cron/purge-expired-urls (sweepReuploadWatches), so it begins within
 *   an hour of the case resolving, whatever resolved it. First start wins:
 *   a later resolution does not move the date.
 * - Nothing new is fetched and no site is added for her here: the sources
 *   created from her reported links stay as they are (spec), and a
 *   re-upload is found on sites the crawler already visits.
 * - When an analyst approves a re-upload inside the window she gets an email
 *   that carries only her case reference and a sign-in prompt
 *   (notifyReuploadFinding; new legal text, created unreviewed).
 *
 * Privacy: this module reads no address. The verified-removed test counts
 * GONE outcomes per link (LinkVerification rows), never an address, and the
 * audit entry carries the consent id and the window's end only. Account
 * erasure needs no new rule: the watch lives on the consent, which erasure
 * already deletes, and a withdrawal clears the whole authorisation whatever
 * its window.
 *
 * The three backends stay aligned (memory, Kysely on the Worker, Prisma);
 * every start is a conditional update, so two sweeps can never double-start
 * a watch or double-audit it.
 */

/** The re-upload window the spec fixes: 12 months from the case resolving. */
export const REUPLOAD_WATCH_MONTHS = 12;
/** "Verified removed" is three GONE re-checks — the same rule as her case page (WP23). */
export const VERIFIED_REMOVED_GONE_COUNT = 3;
/** At most this many watches are started per hourly pass; the rest wait an hour. */
export const REUPLOAD_WATCH_SWEEP_BATCH = 200;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function watchUntilFrom(now: Date): Date {
  const until = new Date(now.getTime());
  until.setMonth(until.getMonth() + REUPLOAD_WATCH_MONTHS);
  return until;
}

// ---------------------------------------------------------------------------
// Starting the window, three aligned paths

/**
 * Sets the 12-month window on the case's live authorisation, once: the
 * update is conditional on no window existing, so the first trigger wins and
 * nothing later moves the date. Returns whether this call started it.
 */
export async function startReuploadWatch(caseId: string, now = new Date()): Promise<boolean> {
  const watchUntil = watchUntilFrom(now);
  let consentId: string | null = null;
  if (isDevNoDb()) {
    const live = crawlMemory().consents.find((c) => c.caseId === caseId && !c.withdrawnAt && (c.watchUntil ?? null) === null);
    if (!live) return false;
    live.watchUntil = watchUntil;
    consentId = live.id;
  } else if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlConsent").select(["id"])
      .where("caseId", "=", caseId).where("withdrawnAt", "is", null).where("watchUntil", "is", null)
      .executeTakeFirst();
    if (!row) return false;
    const updated = await getWorkerDb().updateTable("CrawlConsent").set({ watchUntil })
      .where("id", "=", row.id).where("withdrawnAt", "is", null).where("watchUntil", "is", null)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) !== 1) return false; // another sweep won
    consentId = row.id;
  } else {
    const { db } = await import("@/lib/db");
    const row = await db.crawlConsent.findFirst({
      where: { caseId, withdrawnAt: null, watchUntil: null },
      select: { id: true },
    });
    if (!row) return false;
    const updated = await db.crawlConsent.updateMany({
      where: { id: row.id, withdrawnAt: null, watchUntil: null },
      data: { watchUntil },
    });
    if (updated.count !== 1) return false; // another sweep won
    consentId = row.id;
  }
  await writeAuditLog({
    eventType: "CRAWL_WATCH_STARTED",
    entityType: "Case",
    entityId: caseId,
    data: { consentId, watchUntil: watchUntil.toISOString() },
  });
  return true;
}

// ---------------------------------------------------------------------------
// The hourly sweep

type WatchCandidate = { caseId: string };

/** Live authorisations with no window yet, bounded by the sweep batch. */
async function watchCandidates(limit: number): Promise<WatchCandidate[]> {
  if (isDevNoDb()) {
    return crawlMemory().consents
      .filter((c) => !c.withdrawnAt && (c.watchUntil ?? null) === null)
      .slice(0, limit)
      .map((c) => ({ caseId: c.caseId }));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("CrawlConsent").select(["caseId"])
      .where("withdrawnAt", "is", null).where("watchUntil", "is", null)
      .limit(limit).execute();
    return rows.map((row) => ({ caseId: row.caseId }));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.crawlConsent.findMany({
    where: { withdrawnAt: null, watchUntil: null },
    select: { caseId: true },
    take: limit,
  });
  return rows.map((row) => ({ caseId: row.caseId }));
}

/** The case's status, or null when the case row is gone. */
async function loadCaseStatus(caseId: string): Promise<string | null> {
  if (isDevNoDb()) return store.cases.get(caseId)?.status ?? null;
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("Case").select(["status"]).where("id", "=", caseId).executeTakeFirst();
    return row?.status ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.case.findUnique({ where: { id: caseId }, select: { status: true } });
  return row?.status ?? null;
}

/** The case's links that a takedown was ever about (a rejected link never was). */
async function caseLinkStates(caseId: string): Promise<Array<{ id: string; status: string }>> {
  if (isDevNoDb()) {
    return (store.cases.get(caseId)?.urls ?? [])
      .filter((url) => url.status !== "REJECTED")
      .map((url) => ({ id: url.id, status: url.status }));
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("SubmittedUrl").select(["id", "status"])
      .where("caseId", "=", caseId).where("status", "!=", "REJECTED").execute();
  }
  const { db } = await import("@/lib/db");
  return db.submittedUrl.findMany({
    where: { caseId, status: { not: "REJECTED" } },
    select: { id: true, status: true },
  });
}

/** GONE re-checks per link; counts only, never an address. */
async function goneCounts(urlIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (urlIds.length === 0) return counts;
  if (isDevNoDb()) {
    const ids = new Set(urlIds);
    for (const row of crawlMemory().linkVerifications.values()) {
      if (ids.has(row.submittedUrlId) && row.outcome === "GONE") counts.set(row.submittedUrlId, (counts.get(row.submittedUrlId) ?? 0) + 1);
    }
    return counts;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("LinkVerification").select(["submittedUrlId"])
      .where("submittedUrlId", "in", urlIds).where("outcome", "=", "GONE").execute();
    for (const row of rows) counts.set(row.submittedUrlId, (counts.get(row.submittedUrlId) ?? 0) + 1);
    return counts;
  }
  const { db } = await import("@/lib/db");
  const rows = await db.linkVerification.findMany({
    where: { submittedUrlId: { in: urlIds }, outcome: "GONE" },
    select: { submittedUrlId: true },
  });
  for (const row of rows) counts.set(row.submittedUrlId, (counts.get(row.submittedUrlId) ?? 0) + 1);
  return counts;
}

/**
 * Every link on the case is verified removed (WP23: three GONE re-checks), so
 * the takedown work is done even if nobody marked the case resolved. A case
 * with no link never matches: there is nothing whose removal was verified.
 */
async function everyLinkVerifiedRemoved(caseId: string): Promise<boolean> {
  const links = await caseLinkStates(caseId);
  if (links.length === 0) return false;
  const gone = await goneCounts(links.map((link) => link.id));
  return links.every((link) => link.status === "REMOVED" && (gone.get(link.id) ?? 0) >= VERIFIED_REMOVED_GONE_COUNT);
}

export type ReuploadWatchSweepSummary = { started: number };

/**
 * The hourly sweep (wired into /api/cron/purge-expired-urls): starts the
 * 12-month window on every live authorisation whose case is resolved or whose
 * links are all verified removed. Unlike the removal re-check sweep this
 * needs nothing from the crawler service, so it runs whatever ENABLE_CRAWLER
 * says: the window is part of the case's record, and the pool applies it
 * whenever the crawler is switched back on.
 */
export async function sweepReuploadWatches(now = new Date()): Promise<ReuploadWatchSweepSummary> {
  let started = 0;
  for (const candidate of await watchCandidates(REUPLOAD_WATCH_SWEEP_BATCH)) {
    const status = await loadCaseStatus(candidate.caseId);
    if (status === null) continue; // the case row is gone; its consent soon will be
    if (status !== "RESOLVED" && !(await everyLinkVerifiedRemoved(candidate.caseId))) continue;
    if (await startReuploadWatch(candidate.caseId, now)) started += 1;
  }
  return { started };
}

// ---------------------------------------------------------------------------
// The re-upload alert

/** The live authorisation's window, or null when there is no live authorisation. */
async function liveWatch(caseId: string): Promise<{ consentId: string; watchUntil: Date | null } | null> {
  if (isDevNoDb()) {
    const live = crawlMemory().consents.find((c) => c.caseId === caseId && !c.withdrawnAt);
    return live ? { consentId: live.id, watchUntil: live.watchUntil ?? null } : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlConsent").select(["id", "watchUntil"])
      .where("caseId", "=", caseId).where("withdrawnAt", "is", null).executeTakeFirst();
    return row ? { consentId: row.id, watchUntil: row.watchUntil ?? null } : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.crawlConsent.findFirst({
    where: { caseId, withdrawnAt: null },
    select: { id: true, watchUntil: true },
  });
  return row ? { consentId: row.id, watchUntil: row.watchUntil ?? null } : null;
}

/**
 * Whether a finding approved now on this case is a re-upload inside the
 * watch window: the case is no longer open, the authorisation is live and its
 * window ends in the future. An open case never alerts (the finding goes to
 * analyst review and the dashboard as before); a resolved case outside its
 * window cannot have findings at all, because its fingerprints left the pool.
 */
export async function reuploadWatchActive(caseId: string, now = new Date()): Promise<boolean> {
  const watch = await liveWatch(caseId);
  if (!watch?.watchUntil || watch.watchUntil.getTime() <= now.getTime()) return false;
  const status = await loadCaseStatus(caseId);
  if (status === null || isCaseOpen(status)) return false;
  return true;
}

/**
 * Called after an analyst's final approval of a finding: emails her when the
 * approval is a re-upload inside the watch window, and does nothing otherwise.
 * Reference and sign-in prompt only. Best-effort by contract — the caller
 * treats a throw as a fixed-code log line, never a failed approval.
 */
export async function notifyReuploadFinding(caseId: string, findingId: string, now = new Date()): Promise<void> {
  if (!(await reuploadWatchActive(caseId, now))) return;
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
  await sendReuploadFoundNotification(
    to,
    record.referenceNumber,
    `${appUrl}/case/${caseId}`,
    record.preferredLocale === "hi" ? "hi" : "en",
    `reupload-found:${findingId}`,
  );
}
