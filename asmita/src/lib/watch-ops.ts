import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { generateCaseReference } from "@/lib/case-reference";
import { getVerifiedUserEmail } from "@/lib/case-ops";
import { withdrawCrawlConsent } from "@/lib/crawl-consent";
import { crawlMemory } from "@/lib/crawl-store";
import { sendWatchCopyFoundEmail } from "@/lib/email";
import { clearMemoryHashesForCase } from "@/lib/hash-submission";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * "Watch for my images" (watch-and-verify WP22): the watch operations the
 * tick-consent machinery does not already cover. All three backends (memory,
 * Kysely Worker, Prisma), like the functions beside them in case-ops.ts.
 *
 * - A watch is a Case with mode = WATCH, no links, only fingerprints. Its
 *   tick records a WATCH_ONLY crawl consent (crawl-consent.ts): the search
 *   compares her fingerprints with images on public websites and alerts her,
 *   and nothing is ever sent to a platform from a watch.
 * - "Take it down" converts the watch into a case: the watch-only
 *   authorisation is withdrawn (without stopping the found links — the full
 *   authorisation she signs next covers them, via convertedFromId), and she
 *   is asked for the full crawl authorisation tick on the spot.
 * - "Stop watching" withdraws the authorisation and deletes her
 *   fingerprints: a watch holds them for the search alone, so stopping ends
 *   them. Approved findings go with their fingerprints (their links stay as
 *   the record); unreviewed ones were already deleted by the withdrawal.
 */

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Creates an empty watch case (mode = WATCH, no links). Audited as CASE_CREATED. */
export async function createWatchCase(userId: string): Promise<{ id: string; referenceNumber: string }> {
  if (isDevNoDb()) {
    // store.createCase writes the CASE_CREATED audit entry itself.
    const record = await store.createCase(userId, undefined, "WATCH");
    return { id: record.id, referenceNumber: record.referenceNumber };
  }
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referenceNumber = generateCaseReference();
      try {
        const created = await workerDb.insertInto("Case").values({
          id: randomUUID(), referenceNumber, userId, status: "OPEN", mode: "WATCH",
          hashAdvisoryPlatformIds: [], createdAt: new Date(), updatedAt: new Date(),
        }).returning(["id", "referenceNumber"]).executeTakeFirstOrThrow();
        await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: created.id, actorId: userId, data: { mode: "WATCH" } });
        return created;
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error;
      }
    }
    throw new Error("case_reference_collision_exhausted");
  }
  const { db } = await import("@/lib/db");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceNumber = generateCaseReference();
    try {
      const created = await db.case.create({
        data: { referenceNumber, userId, status: "OPEN", mode: "WATCH" },
        select: { id: true, referenceNumber: true },
      });
      await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: created.id, actorId: userId, data: { mode: "WATCH" } });
      return created;
    } catch (error) {
      // Unique-constraint collision on referenceNumber: regenerate.
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new Error("case_reference_collision_exhausted");
}

export type ConvertWatchResult =
  | { ok: true; withdrawnConsentIds: string[] }
  | { ok: false; error: "not_a_watch" };

/**
 * "Take it down": the watch becomes a case. The live WATCH_ONLY authorisation
 * is withdrawn so the full one can take its place (one live consent per
 * case), its fingerprints leave the pool at once, and the found links are
 * NOT stopped: when she signs the full authorisation next, it records
 * convertedFromId and the existing representative-notice path applies to
 * the findings the watch already produced. Unreviewed findings are kept:
 * the search continues under the authorisation she is about to give.
 */
export async function convertWatchToCase(caseId: string, actorId?: string, now = new Date()): Promise<ConvertWatchResult> {
  if (isDevNoDb()) {
    const record = store.cases.get(caseId);
    if (!record || record.mode !== "WATCH") return { ok: false, error: "not_a_watch" };
    const memory = crawlMemory();
    const live = memory.consents.filter((c) => c.caseId === caseId && !c.withdrawnAt && (c.scope ?? "SEARCH_AND_NOTICE") === "WATCH_ONLY");
    record.mode = "CASE";
    for (const consent of live) consent.withdrawnAt = now;
    for (const fingerprint of memory.fingerprints.values()) {
      if (fingerprint.caseId === caseId) fingerprint.crawlPoolId = null;
    }
    await writeAuditLog({
      eventType: "WATCH_CONVERTED",
      entityType: "Case",
      entityId: caseId,
      actorId,
      data: { withdrawnConsentIds: live.map((c) => c.id) },
    });
    return { ok: true, withdrawnConsentIds: live.map((c) => c.id) };
  }

  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    let converted = false;
    const withdrawnIds: string[] = [];
    await workerDb.transaction().execute(async (trx) => {
      // The claim is the guard: only a case still in WATCH mode converts.
      const claimed = await trx.updateTable("Case").set({ mode: "CASE", updatedAt: now })
        .where("id", "=", caseId).where("mode", "=", "WATCH")
        .returning("id").executeTakeFirst();
      converted = Boolean(claimed);
      if (!converted) return;
      // Pool ids go first, so the crawler's next report on them is refused.
      await trx.updateTable("HashSubmission").set({ crawlPoolId: null }).where("caseId", "=", caseId).execute();
      const withdrawn = await trx.updateTable("CrawlConsent").set({ withdrawnAt: now })
        .where("caseId", "=", caseId).where("scope", "=", "WATCH_ONLY").where("withdrawnAt", "is", null)
        .returning("id").execute();
      withdrawnIds.push(...withdrawn.map((row) => row.id));
    });
    if (!converted) return { ok: false, error: "not_a_watch" };
    await writeAuditLog({
      eventType: "WATCH_CONVERTED",
      entityType: "Case",
      entityId: caseId,
      actorId,
      data: { withdrawnConsentIds: withdrawnIds },
    });
    return { ok: true, withdrawnConsentIds: withdrawnIds };
  }

  const { db } = await import("@/lib/db");
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.case.updateMany({ where: { id: caseId, mode: "WATCH" }, data: { mode: "CASE" } });
    if (claimed.count === 0) return null;
    // Pool ids go first, so the crawler's next report on them is refused.
    await tx.hashSubmission.updateMany({ where: { caseId, crawlPoolId: { not: null } }, data: { crawlPoolId: null } });
    const withdrawn = await tx.crawlConsent.updateMany({
      where: { caseId, scope: "WATCH_ONLY", withdrawnAt: null },
      data: { withdrawnAt: now },
    });
    return withdrawn.count;
  });
  if (result === null) return { ok: false, error: "not_a_watch" };
  await writeAuditLog({
    eventType: "WATCH_CONVERTED",
    entityType: "Case",
    entityId: caseId,
    actorId,
    data: { withdrawnConsentCount: result },
  });
  return { ok: true, withdrawnConsentIds: [] };
}

export type StopWatchingResult =
  | { ok: true; fingerprintsDeleted: number }
  | { ok: false; error: "not_a_watch" | "not_signed" };

/**
 * "Stop watching": withdraws the authorisation (with the existing withdrawal
 * confirmation in the UI) and deletes her fingerprints — on a watch they
 * exist for the search alone. Approved findings go with their fingerprints
 * (the links they added to the case stay, stopped by the withdrawal, as the
 * record); unreviewed findings are deleted by the withdrawal itself.
 */
export async function stopWatching(caseId: string, actorId?: string): Promise<StopWatchingResult> {
  const withdrawn = await withdrawCrawlConsent(caseId, actorId, "survivor");
  if (!withdrawn.ok) return withdrawn;
  const fingerprintsDeleted = await deleteWatchFingerprints(caseId);
  // The deletion is part of the same action; the withdrawal entry carries it.
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Case",
    entityId: caseId,
    actorId,
    data: { action: "watch_fingerprints_deleted", fingerprintsDeleted },
  });
  return { ok: true, fingerprintsDeleted };
}

/**
 * Deletes a watch case's fingerprints and the findings that reference them.
 * Fingerprints that were dispatched somewhere (which a watch never does) are
 * kept so platforms can keep blocking; a watch has no dispatches.
 */
export async function deleteWatchFingerprints(caseId: string): Promise<number> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    for (const [id, finding] of memory.findings) {
      if (finding.caseId === caseId) memory.findings.delete(id);
    }
    let fingerprints = 0;
    for (const [id, fingerprint] of memory.fingerprints) {
      if (fingerprint.caseId === caseId) {
        memory.fingerprints.delete(id);
        fingerprints += 1;
      }
    }
    // The dev hash store (hash-submission.ts) holds the app-flow records.
    clearMemoryHashesForCase(caseId);
    return fingerprints;
  }
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    // Findings reference their fingerprint (RESTRICT), so they go first.
    await workerDb.deleteFrom("CrawlFinding").where("caseId", "=", caseId).execute();
    const deleted = await workerDb.deleteFrom("HashSubmission")
      .where("caseId", "=", caseId)
      .where((eb) => eb.not(eb.exists(
        eb.selectFrom("HashDispatch").select("id").whereRef("HashDispatch.hashSubmissionId", "=", "HashSubmission.id"),
      )))
      .executeTakeFirst();
    return Number(deleted?.numDeletedRows ?? 0);
  }
  const { db } = await import("@/lib/db");
  // Findings reference their fingerprint (RESTRICT), so they go first. The
  // links they created stay on the case (their crawlFindingId clears itself).
  await db.crawlFinding.deleteMany({ where: { caseId } });
  const deleted = await db.hashSubmission.deleteMany({ where: { caseId, dispatches: { none: {} } } });
  return deleted.count;
}

/**
 * The alert when an analyst approves a possible copy on her watch: an email
 * carrying only her case reference and a sign-in prompt, never a link,
 * image, site name or platform name. Best-effort, never throws: the approval
 * is already committed, and a failed email must not fail it. Idempotent per
 * finding, so a retried review cannot email twice.
 */
export async function notifyWatchCopyFound(caseId: string, findingId: string): Promise<void> {
  try {
    let reference: string;
    let userId: string;
    if (isDevNoDb()) {
      const record = store.cases.get(caseId);
      if (!record || record.mode !== "WATCH") return;
      reference = record.referenceNumber;
      userId = record.userId;
    } else {
      const { db } = await import("@/lib/db");
      const record = await db.case.findUnique({
        where: { id: caseId },
        select: { mode: true, referenceNumber: true, userId: true },
      });
      if (!record || record.mode !== "WATCH") return;
      reference = record.referenceNumber;
      userId = record.userId;
    }
    const to = await getVerifiedUserEmail(userId);
    if (!to) return;
    await sendWatchCopyFoundEmail(to, reference, `watch-copy-found/${findingId}`);
  } catch {
    console.error("watch_copy_found_email_failed");
  }
}
