import { randomBytes, randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { buildHashAnnexForSigning } from "@/lib/case-hash-annex";
import { noticeDate } from "@/lib/notice-date";
import { renderNoticeTemplate } from "@/lib/notice-generator";
import { templateRef } from "@/lib/signed-template";
import * as store from "@/lib/store";

/*
 * The survivor's crawl authorisation (template CRAWL_AUTHORISATION): she lets
 * Asmita compare her fingerprints with images its crawler finds on public
 * websites, and act for her on confirmed copies. One live authorisation per
 * case; withdrawing it stops the search at once (the fingerprints leave the
 * pool and lose their pool ids), deletes possible matches nobody has
 * finished reviewing, and marks approved crawler links that no notice went
 * out for (crawlConsentWithdrawnAt) so they can never be sent. Withdrawn
 * rows stay as the record.
 *
 * She agrees with one tick on her case page; no name or signature is asked
 * for. The record still follows the notice-integrity pattern: the
 * authorisation lists the fingerprints it covers (the same annex the hash
 * advisory uses), the PDF (the full text, the fingerprint list and a record
 * of when the account holder ticked the box) is stored encrypted with the
 * template id and digest, and agreeing refuses when the text or fingerprints
 * changed since the page loaded them (templateRef). Unreviewed templates are
 * refused unless DEV_SKIP_LEGAL_REVIEW is on.
 */

export const CRAWL_AUTHORISATION_TYPE = "CRAWL_AUTHORISATION" as const;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function newPoolId() {
  return `fp_${randomBytes(16).toString("hex")}`;
}

export type CrawlConsentState = {
  status: "none" | "signed" | "withdrawn";
  signedAt: string | null;
  withdrawnAt: string | null;
  fingerprintCount: number;
  /**
   * Watch-and-verify WP24: the re-upload window of the live authorisation
   * (null while the case is open or no watch has started). The survivor's
   * case page shows "Watching for re-uploads until <date>" from it.
   */
  watchUntil: string | null;
};

type ConsentRow = { hashSubmissionIds: string[]; signedAt: Date; withdrawnAt: Date | null; watchUntil?: Date | null };

function toState(rows: ConsentRow[]): CrawlConsentState {
  const live = rows.find((row) => !row.withdrawnAt);
  if (live) {
    return {
      status: "signed",
      signedAt: live.signedAt.toISOString(),
      withdrawnAt: null,
      fingerprintCount: live.hashSubmissionIds.length,
      watchUntil: live.watchUntil ? new Date(live.watchUntil).toISOString() : null,
    };
  }
  const latest = [...rows].sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0];
  if (!latest) return { status: "none", signedAt: null, withdrawnAt: null, fingerprintCount: 0, watchUntil: null };
  return {
    status: "withdrawn",
    signedAt: latest.signedAt.toISOString(),
    withdrawnAt: latest.withdrawnAt!.toISOString(),
    fingerprintCount: 0,
    watchUntil: null,
  };
}

export async function getCrawlConsentState(caseId: string): Promise<CrawlConsentState> {
  if (isDevNoDb()) return toState(crawlMemory().consents.filter((c) => c.caseId === caseId));
  const { db } = await import("@/lib/db");
  const rows = await db.crawlConsent.findMany({
    where: { caseId },
    select: { hashSubmissionIds: true, signedAt: true, withdrawnAt: true, watchUntil: true },
  });
  return toState(rows);
}

/** The authorisation template signing may use; reviewed by legal unless the dev bypass is on. */
export async function findCrawlAuthorisationTemplate(skipLegalGate: boolean) {
  const { db } = await import("@/lib/db");
  return db.noticeTemplate.findFirst({
    where: { templateType: CRAWL_AUTHORISATION_TYPE, isActive: true, ...(skipLegalGate ? {} : { reviewedByLegal: true }) },
    orderBy: { version: "desc" },
  });
}

export type CrawlAuthorisationDraft = {
  template: { id: string; subjectTemplate: string; bodyTemplate: string };
  hashSubmissionIds: string[];
  subject: string;
  body: string;
  templateRef: string;
};

/**
 * The exact text the survivor sees and signs: the template rendered for the
 * case, followed by the annex listing every non-rejected fingerprint.
 */
export async function buildCrawlAuthorisationDraft(
  caseId: string,
  referenceNumber: string,
  skipLegalGate: boolean,
): Promise<CrawlAuthorisationDraft | { error: "template_missing" | "no_hashes" }> {
  const template = await findCrawlAuthorisationTemplate(skipLegalGate);
  if (!template) return { error: "template_missing" };
  const annex = await buildHashAnnexForSigning(caseId);
  if (annex.hashSubmissionIds.length === 0) return { error: "no_hashes" };
  const variables = { caseReference: referenceNumber, declarationReference: referenceNumber };
  return {
    template,
    hashSubmissionIds: annex.hashSubmissionIds,
    subject: renderNoticeTemplate(template.subjectTemplate, variables),
    body: `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex.text}`,
    templateRef: templateRef(template, annex.hashSubmissionIds),
  };
}

function indiaTime(date: Date) {
  return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * The record appended to the authorisation PDF in place of a typed name and
 * signature: who agreed (the holder of the account the case belongs to,
 * signed in by a one-time email code) and when. States nothing else about
 * her, and no name, since none is asked for.
 */
export function crawlAgreementRecord(input: { caseReference: string; agreedAt: Date }): string {
  return [
    "--- RECORD OF AGREEMENT ---",
    "",
    `The holder of the Asmita account for case ${input.caseReference} agreed to this authorisation by ticking the box to switch on the search for more copies of her images on the case page, on ${noticeDate(input.agreedAt)} at ${indiaTime(input.agreedAt)} IST.`,
    "The account holder was signed in with an email address verified by a one-time code. No name or signature was typed: the tick is the agreement.",
    "",
    "--- END RECORD ---",
  ].join("\n");
}

export type RecordConsentInput = {
  caseId: string;
  signedPdfEncrypted: string;
  hashSubmissionIds: string[];
  templateId: string;
  templateDigest: string;
  /** When she ticked the box; the time the authorisation PDF records. */
  signedAt?: Date;
  actorId?: string;
};

function isUniqueViolation(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2002" || code === "23505";
}

export async function recordCrawlConsent(input: RecordConsentInput): Promise<{ ok: true; consentId: string } | { ok: false; error: "already_signed" }> {
  let consentId: string;
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if (memory.consents.some((c) => c.caseId === input.caseId && !c.withdrawnAt)) return { ok: false, error: "already_signed" };
    consentId = randomUUID();
    memory.consents.push({
      id: consentId, caseId: input.caseId, signedPdfEncrypted: input.signedPdfEncrypted,
      hashSubmissionIds: [...input.hashSubmissionIds], templateId: input.templateId, templateDigest: input.templateDigest,
      signedAt: input.signedAt ?? new Date(), withdrawnAt: null, watchUntil: null,
    });
    for (const id of input.hashSubmissionIds) {
      const fingerprint = memory.fingerprints.get(id);
      if (fingerprint && fingerprint.caseId === input.caseId && !fingerprint.crawlPoolId) fingerprint.crawlPoolId = newPoolId();
    }
  } else {
    const { db } = await import("@/lib/db");
    try {
      consentId = await db.$transaction(async (tx) => {
        // The partial unique index allows one live authorisation per case.
        const live = await tx.crawlConsent.findFirst({ where: { caseId: input.caseId, withdrawnAt: null }, select: { id: true } });
        if (live) throw Object.assign(new Error("already_signed"), { code: "P2002" });
        const created = await tx.crawlConsent.create({
          data: {
            caseId: input.caseId, signedPdfEncrypted: input.signedPdfEncrypted,
            hashSubmissionIds: input.hashSubmissionIds, templateId: input.templateId, templateDigest: input.templateDigest,
            ...(input.signedAt ? { signedAt: input.signedAt } : {}),
          },
          select: { id: true },
        });
        for (const id of input.hashSubmissionIds) {
          await tx.hashSubmission.updateMany({
            where: { id, caseId: input.caseId, crawlPoolId: null },
            data: { crawlPoolId: newPoolId() },
          });
        }
        return created.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: "already_signed" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "CRAWL_CONSENT_SIGNED",
    entityType: "Case",
    entityId: input.caseId,
    actorId: input.actorId,
    data: { consentId, fingerprintCount: input.hashSubmissionIds.length },
  });
  return { ok: true, consentId };
}

export async function withdrawCrawlConsent(
  caseId: string,
  actorId?: string,
  reason: "survivor" | "account_deletion" = "survivor",
): Promise<{ ok: true; candidatesDeleted: number } | { ok: false; error: "not_signed" }> {
  let candidatesDeleted = 0;
  let linksStopped = 0;
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const live = memory.consents.filter((c) => c.caseId === caseId && !c.withdrawnAt);
    if (live.length === 0) return { ok: false, error: "not_signed" };
    const now = new Date();
    for (const consent of live) consent.withdrawnAt = now;
    for (const [id, finding] of memory.findings) {
      if (finding.caseId === caseId && finding.reviewStatus === "CANDIDATE") {
        memory.findings.delete(id);
        candidatesDeleted += 1;
      }
    }
    for (const fingerprint of memory.fingerprints.values()) {
      if (fingerprint.caseId === caseId) fingerprint.crawlPoolId = null;
    }
    // Nothing is ever sent from the memory store, so every crawler link on
    // the case is unsent.
    for (const url of store.cases.get(caseId)?.urls ?? []) {
      if (url.source === "CRAWLER" && !url.crawlConsentWithdrawnAt) {
        url.crawlConsentWithdrawnAt = now.toISOString();
        linksStopped += 1;
      }
    }
  } else {
    const { db } = await import("@/lib/db");
    const result = await db.$transaction(async (tx) => {
      const now = new Date();
      const withdrawn = await tx.crawlConsent.updateMany({ where: { caseId, withdrawnAt: null }, data: { withdrawnAt: now } });
      if (withdrawn.count === 0) return null;
      // Pool ids go first, so the crawler's next report on them is refused.
      await tx.hashSubmission.updateMany({ where: { caseId, crawlPoolId: { not: null } }, data: { crawlPoolId: null } });
      // Approved crawler links with no notice sent can never be sent now, even
      // under a later authorisation (crawl-notice.ts refuses them). Links
      // already sent keep their record untouched.
      const stopped = await tx.submittedUrl.updateMany({
        where: { caseId, source: "CRAWLER", crawlConsentWithdrawnAt: null, notices: { none: {} } },
        data: { crawlConsentWithdrawnAt: now },
      });
      const deleted = await tx.crawlFinding.deleteMany({ where: { caseId, reviewStatus: "CANDIDATE" } });
      return { candidatesDeleted: deleted.count, linksStopped: stopped.count };
    });
    if (result === null) return { ok: false, error: "not_signed" };
    candidatesDeleted = result.candidatesDeleted;
    linksStopped = result.linksStopped;
  }
  await writeAuditLog({
    eventType: "CRAWL_CONSENT_WITHDRAWN",
    entityType: "Case",
    entityId: caseId,
    actorId,
    data: { candidatesDeleted, linksStopped, reason },
  });
  return { ok: true, candidatesDeleted };
}

/**
 * Account deletion requested: the search stops at once for every case of
 * hers, with the same effects as her own withdrawal (fingerprints leave the
 * pool, unreviewed matches are deleted, unsent crawler links are stopped).
 * Cancelling the deletion by signing in does not undo this: she would have to
 * tick the box again to opt in again.
 */
export async function withdrawCrawlConsentsForDeletion(caseIds: string[], userId: string): Promise<number> {
  let withdrawn = 0;
  for (const caseId of caseIds) {
    const result = await withdrawCrawlConsent(caseId, userId, "account_deletion");
    if (result.ok) withdrawn += 1;
  }
  return withdrawn;
}
