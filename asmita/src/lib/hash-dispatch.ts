import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { sendNoticeDraft } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { assertVerifiedNoticeRecipient } from "@/lib/notice-dispatch";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  buildHashAnnex,
  renderNoticeTemplate,
} from "@/lib/notice-generator";

// Phase 2 fan-out: turns APPROVED hash submissions into HASH_ADVISORY emails,
// one per target platform, each carrying the legal notice plus the perceptual
// hash annex. Hard gates, in order:
//   1. ENABLE_HASH_UPLOAD must be on (checked by callers' routes).
//   2. The HASH_ADVISORY template must be human-legally reviewed.
//   3. Only APPROVED (admin-reviewed) submissions are ever dispatched.
//   4. Recipients must be human-verified platform contacts.
//   5. Idempotent per (hashSubmission, platform) via the HashDispatch unique
//      constraint — re-runs never double-send.

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
    select: { id: true, referenceNumber: true, declarationSignedAt: true },
  });
  if (!dbCase) throw new Error("case_not_found");
  if (!dbCase.declarationSignedAt) throw new Error("declaration_required");

  const submissions = await db.hashSubmission.findMany({
    where: { caseId: input.caseId, status: { in: ["APPROVED", "DISPATCHED"] } },
    orderBy: { submittedAt: "asc" },
  });
  if (submissions.length === 0) throw new Error("no_approved_hashes");

  const skipLegalGate = process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_LEGAL_REVIEW === "true";
  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType: "HASH_ADVISORY",
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
    },
    orderBy: { version: "desc" },
  });
  if (!template) throw new Error("hash_advisory_template_missing");

  const annex = buildHashAnnex({
    algorithm: "PDQ",
    hashes: submissions.map((submission) => ({
      value: decryptField(submission.hashEncrypted),
      quality: submission.quality,
    })),
    clientVersion: submissions[0].clientVersion,
  });

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
      // Form-only platform: we can't email — return the form URL so the caller
      // can direct the survivor to paste the hash advisory manually.
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
        where: {
          hashSubmissionId_platformId: { hashSubmissionId: submission.id, platformId },
        },
      });
      if (!existing) pendingSubmissions.push(submission);
    }
    if (pendingSubmissions.length === 0) {
      results.push({ platformId, dispatched: false, reason: "already_dispatched" });
      continue;
    }

    const variables = {
      caseReference: dbCase.referenceNumber,
      platformName: platform.name,
      declarationReference: `${dbCase.referenceNumber}-DECL`,
    };
    const subject = renderNoticeTemplate(template.subjectTemplate, variables);
    const noticeBody = renderNoticeTemplate(template.bodyTemplate, variables);
    const body = `${noticeBody}\n\n${annex}`;
    assertNoticeSubjectSafe(subject);
    assertNoticeBodySafe(body);

    const sent = await sendNoticeDraft(platform.grievanceEmail, subject, body);
    const messageId =
      "id" in sent && typeof sent.id === "string"
        ? sent.id
        : "data" in sent && sent.data?.id
          ? sent.data.id
          : `hash-advisory-${input.caseId.slice(0, 8)}-${platformId.slice(0, 8)}`;

    await db.hashDispatch.createMany({
      data: pendingSubmissions.map((submission) => ({
        hashSubmissionId: submission.id,
        platformId,
      })),
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
    results.push({
      platformId,
      dispatched: true,
      messageId,
      hashCount: pendingSubmissions.length,
    });
  }

  return results;
}
