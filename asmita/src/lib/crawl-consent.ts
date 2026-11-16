import { randomBytes, randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory } from "@/lib/crawl-store";
import { buildHashAnnexForSigning } from "@/lib/case-hash-annex";
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
 * Signing follows the notice-integrity pattern: the authorisation lists the
 * fingerprints it covers (the same annex the hash advisory uses), the PDF is
 * stored encrypted with the template id and digest, and signing refuses when
 * the text or fingerprints changed since the survivor saw them (templateRef).
 * Unreviewed templates are refused unless DEV_SKIP_LEGAL_REVIEW is on.
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
};

type ConsentRow = { hashSubmissionIds: string[]; signedAt: Date; withdrawnAt: Date | null };

function toState(rows: ConsentRow[]): CrawlConsentState {
  const live = rows.find((row) => !row.withdrawnAt);
  if (live) {
    return { status: "signed", signedAt: live.signedAt.toISOString(), withdrawnAt: null, fingerprintCount: live.hashSubmissionIds.length };
  }
  const latest = [...rows].sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0];
  if (!latest) return { status: "none", signedAt: null, withdrawnAt: null, fingerprintCount: 0 };
  return {
    status: "withdrawn",
    signedAt: latest.signedAt.toISOString(),
    withdrawnAt: latest.withdrawnAt!.toISOString(),
    fingerprintCount: 0,
  };
}

export async function getCrawlConsentState(caseId: string): Promise<CrawlConsentState> {
  if (isDevNoDb()) return toState(crawlMemory().consents.filter((c) => c.caseId === caseId));
  const { db } = await import("@/lib/db");
  const rows = await db.crawlConsent.findMany({
    where: { caseId },
    select: { hashSubmissionIds: true, signedAt: true, withdrawnAt: true },
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

export type RecordConsentInput = {
  caseId: string;
  signedPdfEncrypted: string;
  hashSubmissionIds: string[];
  templateId: string;
  templateDigest: string;
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
      signedAt: new Date(), withdrawnAt: null,
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
    data: { candidatesDeleted, linksStopped },
  });
  return { ok: true, candidatesDeleted };
}
