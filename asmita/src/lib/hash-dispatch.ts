import { db } from "@/lib/db";
import { devFlagEnabled } from "@/lib/dev-flags";
import { decryptField } from "@/lib/encryption";
import { sendNoticeDraft } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { assertVerifiedNoticeRecipient } from "@/lib/notice-dispatch";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  renderNoticeTemplate,
} from "@/lib/notice-generator";
import { buildSignedHashAnnex, voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";

// Dispatches the signed hash advisory to each target email platform.
// Hard gates, in order:
//   1. ENABLE_HASH_UPLOAD must be on (checked by callers' routes).
//   2. Case must have a signedHashAdvisoryPdf - survivor must have reviewed and signed.
//   3. The HASH_ADVISORY template must be human-legally reviewed (or DEV bypass).
//   4. Only the fingerprints the signed advisory lists are dispatched, and only
//      once every one of them is APPROVED (admin-reviewed).
//   5. Recipients must be human-verified platform contacts.
//   6. Idempotent per (hashSubmission, platform) via the HashDispatch unique
//      constraint - re-runs never double-send.
//
// Integrity: the notice body is rendered ONCE from the platform-agnostic
// HASH_ADVISORY template and is identical for every email platform. The signed
// PDF (stored on Case, encrypted) is attached to every outgoing email so
// recipients receive the survivor-signed operative document.

export type HashDispatchResult =
  | { platformId: string; dispatched: true; messageId: string; hashCount: number }
  | { platformId: string; dispatched: false; reason: string; formUrl?: string };

export async function dispatchHashAdvisories(input: {
  caseId: string;
  platformIds: string[];
  actorId?: string;
}): Promise<HashDispatchResult[]> {
  const dbCase = await db.case.findUnique({
    where: { id: input.caseId },
    select: {
      id: true,
      referenceNumber: true,
      signedHashAdvisoryPdf: true,
      hashAdvisorySignedHashIds: true,
    },
  });
  if (!dbCase) throw new Error("case_not_found");
  if (!dbCase.signedHashAdvisoryPdf) throw new Error("hash_advisory_not_signed");
  // Advisories signed before the signed set was recorded cannot prove what
  // they cover, so they are never sent.
  if (dbCase.hashAdvisorySignedHashIds.length === 0) throw new Error("no_signed_fingerprints");

  const pdfBase64 = decryptField(dbCase.signedHashAdvisoryPdf);
  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  // Exactly the fingerprints the signed PDF lists, once all are approved.
  const signed = await buildSignedHashAnnex(dbCase.hashAdvisorySignedHashIds);
  if (!signed.ok) {
    if (signed.reason === "signed_fingerprints_changed") {
      await voidSignaturesWithRejectedFingerprints(input.caseId, { trigger: "dispatch", actorId: input.actorId });
    }
    throw new Error(signed.reason);
  }
  const submissions = signed.annex.hashSubmissionIds.map((id) => ({ id }));

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType: "HASH_ADVISORY",
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
    },
    orderBy: { version: "desc" },
  });
  if (!template) throw new Error("hash_advisory_template_missing");

  // Render the notice body ONCE. The HASH_ADVISORY template is platform-agnostic;
  // passing platformName: "your service" handles any remaining {{platformName}}
  // references in the v1 template while v2+ templates omit the variable entirely.
  const variables = {
    caseReference: dbCase.referenceNumber,
    declarationReference: dbCase.referenceNumber,
    platformName: "your service",
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const noticeBody = renderNoticeTemplate(template.bodyTemplate, variables);
  const emailBody = `${noticeBody}\n\n${signed.annex.text}`;
  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(emailBody);

  const results: HashDispatchResult[] = [];

  for (const platformId of input.platformIds) {
    const platform = await db.platform.findUnique({ where: { id: platformId } });
    if (!platform || !platform.isActive) {
      results.push({ platformId, dispatched: false, reason: "platform_not_found" });
      continue;
    }
    if (!platform.lastContactVerifiedByHuman) {
      results.push({ platformId, dispatched: false, reason: "contact_not_human_verified" });
      continue;
    }
    if (!platform.grievanceEmail) {
      results.push({ platformId, dispatched: false, reason: "form_only", formUrl: platform.formUrl ?? undefined });
      continue;
    }
    try {
      assertVerifiedNoticeRecipient(platform.grievanceEmail);
    } catch {
      results.push({ platformId, dispatched: false, reason: "verified_recipient_required" });
      continue;
    }

    const pendingSubmissions = [];
    for (const submission of submissions) {
      const existing = await db.hashDispatch.findUnique({
        where: { hashSubmissionId_platformId: { hashSubmissionId: submission.id, platformId } },
      });
      if (!existing) pendingSubmissions.push(submission);
    }
    if (pendingSubmissions.length === 0) {
      results.push({ platformId, dispatched: false, reason: "already_dispatched" });
      continue;
    }

    const sent = await sendNoticeDraft(platform.grievanceEmail, subject, emailBody, [
      {
        filename: `notice-${dbCase.referenceNumber}.pdf`,
        content: pdfBuffer,
      },
    ]);
    const messageId =
      "id" in sent && typeof sent.id === "string"
        ? sent.id
        : "data" in sent && sent.data?.id
          ? sent.data.id
          : `hash-advisory-${input.caseId.slice(0, 8)}-${platformId.slice(0, 8)}`;

    await db.hashDispatch.createMany({
      data: pendingSubmissions.map((s) => ({ hashSubmissionId: s.id, platformId })),
      skipDuplicates: true,
    });
    await db.hashSubmission.updateMany({
      where: { id: { in: pendingSubmissions.map((s) => s.id) }, status: "APPROVED" },
      data: { status: "DISPATCHED" },
    });
    await writeAuditLog({
      eventType: "HASH_DISPATCHED",
      entityType: "Case",
      entityId: input.caseId,
      actorId: input.actorId,
      data: {
        platformId,
        platformName: platform.name,
        messageId,
        hashCount: pendingSubmissions.length,
        templateVersion: template.version,
      },
    });
    results.push({ platformId, dispatched: true, messageId, hashCount: pendingSubmissions.length });
  }

  return results;
}
