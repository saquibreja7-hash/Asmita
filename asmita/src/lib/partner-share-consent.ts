import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { buildHashAnnex, renderNoticeTemplate } from "@/lib/notice-generator";
import { partnerMemory } from "@/lib/partner-store";
import { templateRef } from "@/lib/signed-template";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import * as store from "@/lib/store";
import { decryptField } from "@/lib/encryption";

/*
 * The survivor's agreement to share her fingerprints with partner platforms
 * (template PARTNER_SHARING_CONSENT), partner programme part 2 (WP31). One
 * tick on her case page, like the crawl opt-in; no name, signature or PDF.
 * The tick is the agreement: the exact text she ticked against is pinned by
 * the template id and digest (notice-integrity pattern), and the fingerprint
 * ids the page listed are stored on the row as the record of what she saw.
 *
 * A fingerprint is shared only while all of these hold (Rule 2,
 * partner-sharing-spec.md):
 * - its case has a live (not withdrawn) PartnerShareConsent;
 * - an analyst approved it (APPROVED, or DISPATCHED after an advisory went
 *   out — the same set the crawl pool uses, src/lib/crawl-pool.ts);
 * - its case is an adult case: the query re-checks User.ageOver18 (Rule 3),
 *   so a fingerprint never reaches a partner feed through data drift.
 *
 * The agreement is standing: a fingerprint approved after she ticked is
 * covered too (WP32 writes a feed event on approval), and a rejected or
 * deleted fingerprint stops being shared by its own status, without touching
 * her agreement. Withdrawal, a deletion request or account erasure ends the
 * agreement; the feed then tells partners to delete what they hold (WP32).
 *
 * Backends like the crawl modules: the in-memory store for dev/tests, Prisma
 * otherwise. Kysely paths are provided for the shareable query, which WP32's
 * partner routes run on the Worker.
 */

export const PARTNER_SHARING_CONSENT_TYPE = "PARTNER_SHARING_CONSENT" as const;

/** An analyst approved the fingerprint; DISPATCHED means approved and an advisory already went out. */
export const PARTNER_SHARE_STATUSES = ["APPROVED", "DISPATCHED"] as const;

export function isPartnerShareableStatus(status: string): boolean {
  return (PARTNER_SHARE_STATUSES as readonly string[]).includes(status);
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export type PartnerShareConsentState = {
  status: "none" | "agreed" | "withdrawn";
  agreedAt: string | null;
  withdrawnAt: string | null;
  fingerprintCount: number;
};

type ConsentRow = { hashSubmissionIds: string[]; agreedAt: Date; withdrawnAt: Date | null };

function toState(rows: ConsentRow[]): PartnerShareConsentState {
  const live = rows.find((row) => !row.withdrawnAt);
  if (live) {
    return { status: "agreed", agreedAt: live.agreedAt.toISOString(), withdrawnAt: null, fingerprintCount: live.hashSubmissionIds.length };
  }
  const latest = [...rows].sort((a, b) => b.agreedAt.getTime() - a.agreedAt.getTime())[0];
  if (!latest) return { status: "none", agreedAt: null, withdrawnAt: null, fingerprintCount: 0 };
  return {
    status: "withdrawn",
    agreedAt: latest.agreedAt.toISOString(),
    withdrawnAt: latest.withdrawnAt!.toISOString(),
    fingerprintCount: 0,
  };
}

export async function getPartnerShareConsentState(caseId: string): Promise<PartnerShareConsentState> {
  if (isDevNoDb()) return toState(partnerMemory().shareConsents.filter((c) => c.caseId === caseId));
  const { db } = await import("@/lib/db");
  const rows = await db.partnerShareConsent.findMany({
    where: { caseId },
    select: { hashSubmissionIds: true, agreedAt: true, withdrawnAt: true },
  });
  return toState(rows);
}

/** The agreement template the tick may use; reviewed by legal unless the dev bypass is on. */
export async function findPartnerSharingTemplate(skipLegalGate: boolean) {
  const { db } = await import("@/lib/db");
  return db.noticeTemplate.findFirst({
    where: { templateType: PARTNER_SHARING_CONSENT_TYPE, isActive: true, ...(skipLegalGate ? {} : { reviewedByLegal: true }) },
    orderBy: { version: "desc" },
  });
}

/** One fingerprint row the agreement could cover: approved, on this case. */
type EligibleRow = { id: string; hashEncrypted: string; quality: number; clientVersion: string | null; algorithm: string };

async function eligibleHashes(caseId: string): Promise<EligibleRow[]> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    return [...memory.fingerprints.values()]
      .filter((f) => f.caseId === caseId && isPartnerShareableStatus(f.status))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => ({ id: f.id, hashEncrypted: f.hashEncrypted, quality: f.quality, clientVersion: null, algorithm: "PDQ" }));
  }
  const { db } = await import("@/lib/db");
  return db.hashSubmission.findMany({
    where: { caseId, status: { in: [...PARTNER_SHARE_STATUSES] } },
    orderBy: { submittedAt: "asc" },
    select: { id: true, hashEncrypted: true, quality: true, clientVersion: true, algorithm: true },
  });
}

export type PartnerSharingDraft = {
  template: { id: string; subjectTemplate: string; bodyTemplate: string };
  hashSubmissionIds: string[];
  subject: string;
  body: string;
  templateRef: string;
};

/**
 * The exact text the survivor reads before she ticks: the template rendered
 * for the case, followed by the annex listing every approved fingerprint
 * (the same annex builder the signed advisories use). Agreeing is refused
 * when this changed since the page loaded (templateRef).
 */
export async function buildPartnerSharingDraft(
  caseId: string,
  referenceNumber: string,
  skipLegalGate: boolean,
): Promise<PartnerSharingDraft | { error: "template_missing" | "no_hashes" }> {
  const template = await findPartnerSharingTemplate(skipLegalGate);
  if (!template) return { error: "template_missing" };
  const rows = await eligibleHashes(caseId);
  if (rows.length === 0) return { error: "no_hashes" };
  const annex = buildHashAnnex({
    algorithm: "PDQ",
    hashes: rows.map((row) => ({ value: decryptField(row.hashEncrypted), quality: row.quality })),
    clientVersion: rows[0].clientVersion,
  });
  const variables = { caseReference: referenceNumber, declarationReference: referenceNumber };
  return {
    template,
    hashSubmissionIds: rows.map((row) => row.id),
    subject: renderNoticeTemplate(template.subjectTemplate, variables),
    body: `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex}`,
    templateRef: templateRef(template, rows.map((row) => row.id)),
  };
}

export type RecordPartnerShareConsentInput = {
  caseId: string;
  hashSubmissionIds: string[];
  templateId: string;
  templateDigest: string;
  /** When she ticked the box. */
  agreedAt?: Date;
  actorId?: string;
};

function isUniqueViolation(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2002" || code === "23505";
}

export async function recordPartnerShareConsent(
  input: RecordPartnerShareConsentInput,
): Promise<{ ok: true; consentId: string } | { ok: false; error: "already_agreed" }> {
  let consentId: string;
  if (isDevNoDb()) {
    const memory = partnerMemory();
    if (memory.shareConsents.some((c) => c.caseId === input.caseId && !c.withdrawnAt)) return { ok: false, error: "already_agreed" };
    consentId = randomUUID();
    memory.shareConsents.push({
      id: consentId, caseId: input.caseId, hashSubmissionIds: [...input.hashSubmissionIds],
      templateId: input.templateId, templateDigest: input.templateDigest,
      agreedAt: input.agreedAt ?? new Date(), withdrawnAt: null,
    });
    // WP32: the fingerprints this agreement makes shareable enter the partner
    // feed at once (partner-feed.ts writes the ADD events).
    const { syncPartnerFeedForCase } = await import("@/lib/partner-feed");
    await syncPartnerFeedForCase(input.caseId);
  } else {
    const { db } = await import("@/lib/db");
    try {
      consentId = await db.$transaction(async (tx) => {
        // The partial unique index (migration 20261119140000) allows one live
        // agreement per case; this check keeps the error readable.
        const live = await tx.partnerShareConsent.findFirst({ where: { caseId: input.caseId, withdrawnAt: null }, select: { id: true } });
        if (live) throw Object.assign(new Error("already_agreed"), { code: "P2002" });
        const created = await tx.partnerShareConsent.create({
          data: {
            caseId: input.caseId, hashSubmissionIds: input.hashSubmissionIds,
            templateId: input.templateId, templateDigest: input.templateDigest,
            ...(input.agreedAt ? { agreedAt: input.agreedAt } : {}),
          },
          select: { id: true },
        });
        // WP32: the feed's ADD events are written in the same transaction,
        // so an agreement can never exist without its feed events.
        const { syncCaseFeedEventsPrisma } = await import("@/lib/partner-feed");
        await syncCaseFeedEventsPrisma(tx, input.caseId);
        return created.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: "already_agreed" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "PARTNER_SHARE_CONSENT_GIVEN",
    entityType: "Case",
    entityId: input.caseId,
    actorId: input.actorId,
    data: { consentId, fingerprintCount: input.hashSubmissionIds.length },
  });
  return { ok: true, consentId };
}

export async function withdrawPartnerShareConsent(
  caseId: string,
  actorId?: string,
  reason: "survivor" | "account_deletion" = "survivor",
): Promise<{ ok: true; consentsWithdrawn: number } | { ok: false; error: "not_agreed" }> {
  let consentsWithdrawn = 0;
  if (isDevNoDb()) {
    const memory = partnerMemory();
    const live = memory.shareConsents.filter((c) => c.caseId === caseId && !c.withdrawnAt);
    if (live.length === 0) return { ok: false, error: "not_agreed" };
    const now = new Date();
    for (const consent of live) consent.withdrawnAt = now;
    consentsWithdrawn = live.length;
    // WP32: the feed's WITHDRAW events follow at once (partner-feed.ts).
    const { syncPartnerFeedForCase } = await import("@/lib/partner-feed");
    await syncPartnerFeedForCase(caseId);
  } else {
    const { db } = await import("@/lib/db");
    // The feed's WITHDRAW events are written in the same transaction, so a
    // withdrawal can never be left without them (partner-feed.ts).
    const { syncCaseFeedEventsPrisma } = await import("@/lib/partner-feed");
    const withdrawn = await db.$transaction(async (tx) => {
      const result = await tx.partnerShareConsent.updateMany({ where: { caseId, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
      if (result.count === 0) return 0;
      await syncCaseFeedEventsPrisma(tx, caseId);
      return result.count;
    });
    if (withdrawn === 0) return { ok: false, error: "not_agreed" };
    consentsWithdrawn = withdrawn;
  }
  await writeAuditLog({
    eventType: "PARTNER_SHARE_CONSENT_WITHDRAWN",
    entityType: "Case",
    entityId: caseId,
    actorId,
    data: { reason, consentsWithdrawn },
  });
  return { ok: true, consentsWithdrawn };
}

/**
 * Account deletion requested: sharing stops at once for every case of hers.
 * Cancelling the deletion by signing in does not opt her back in: she would
 * have to tick the box again.
 */
export async function withdrawPartnerShareConsentsForDeletion(caseIds: string[], userId: string): Promise<number> {
  let withdrawn = 0;
  for (const caseId of caseIds) {
    const result = await withdrawPartnerShareConsent(caseId, userId, "account_deletion");
    if (result.ok) withdrawn += result.consentsWithdrawn;
  }
  return withdrawn;
}

export type PartnerShareableFingerprint = {
  hashSubmissionId: string;
  caseId: string;
  caseReference: string;
  algorithm: string;
};

/**
 * Every fingerprint currently shareable under Rule 2, with the case reference
 * a partner feed may carry (WP32). Adult cases only: the query joins through
 * to User.ageOver18 on both database backends (Rule 3), so no fingerprint of
 * a minor's case can be listed even if the session gate failed somewhere.
 * Internal ids and references only — no hash values are decrypted here.
 */
export async function listPartnerShareableFingerprints(): Promise<PartnerShareableFingerprint[]> {
  if (isDevNoDb()) {
    const live = partnerMemory().shareConsents.filter((c) => !c.withdrawnAt);
    if (live.length === 0) return [];
    const caseIds = new Set(live.map((c) => c.caseId));
    const out: PartnerShareableFingerprint[] = [];
    for (const fingerprint of crawlMemory().fingerprints.values()) {
      if (!caseIds.has(fingerprint.caseId) || !isPartnerShareableStatus(fingerprint.status)) continue;
      const record = store.cases.get(fingerprint.caseId);
      if (!record) continue;
      out.push({ hashSubmissionId: fingerprint.id, caseId: fingerprint.caseId, caseReference: record.referenceNumber, algorithm: "PDQ" });
    }
    return out;
  }
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    const consents = await workerDb.selectFrom("PartnerShareConsent").select("caseId").where("withdrawnAt", "is", null).execute();
    const caseIds = [...new Set(consents.map((row) => row.caseId))];
    if (caseIds.length === 0) return [];
    // Rule 3 at the query: only cases whose user attested to being an adult.
    const adultCases = await workerDb.selectFrom("Case")
      .innerJoin("User", (join) => join.onRef("Case.userId", "=", "User.id"))
      .select(["Case.id", "Case.referenceNumber"])
      .where("Case.id", "in", caseIds)
      .where("User.ageOver18", "=", true)
      .execute();
    if (adultCases.length === 0) return [];
    const adultCaseIds = adultCases.map((row) => row.id);
    const rows = await workerDb.selectFrom("HashSubmission")
      .select(["id", "caseId", "algorithm"])
      .where("caseId", "in", adultCaseIds)
      .where("status", "in", [...PARTNER_SHARE_STATUSES])
      .execute();
    const referenceByCase = new Map(adultCases.map((row) => [row.id, row.referenceNumber]));
    return rows.map((row) => ({
      hashSubmissionId: row.id,
      caseId: row.caseId,
      caseReference: referenceByCase.get(row.caseId) ?? "",
      algorithm: String(row.algorithm),
    }));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.hashSubmission.findMany({
    where: {
      status: { in: [...PARTNER_SHARE_STATUSES] },
      case: {
        // Rule 2 (live agreement) and Rule 3 (adult case) at the query.
        partnerShareConsents: { some: { withdrawnAt: null } },
        user: { ageOver18: true },
      },
    },
    select: { id: true, caseId: true, algorithm: true, case: { select: { referenceNumber: true } } },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map((row) => ({
    hashSubmissionId: row.id,
    caseId: row.caseId,
    caseReference: row.case?.referenceNumber ?? "",
    algorithm: row.algorithm,
  }));
}
