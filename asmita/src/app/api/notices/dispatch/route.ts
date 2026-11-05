import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice } from "@/lib/notice-dispatch";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  renderNoticeTemplate,
  hasRetiredPortalInstructions,
} from "@/lib/notice-generator";
import { buildSignedHashAnnex, voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";
import { isUrlExpired } from "@/lib/url-retention";

const schema = z.object({
  caseId: z.string().min(1),
  urlId: z.string().min(1),
}).strict();

function templateTypeForNoticeBasis(noticeBasis: string) {
  if (noticeBasis === "IT_RULES_2021") return "IT_RULES_2021";
  if (noticeBasis === "DMCA") return "DMCA";
  if (noticeBasis === "IT_RULES_AND_DMCA") return "IT_RULES_AND_DMCA";
  return null;
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const submittedUrl = await db.submittedUrl.findFirst({
    where: { id: parsed.data.urlId, caseId: parsed.data.caseId },
    include: {
      case: { select: { referenceNumber: true } },
      platform: {
        select: {
          id: true,
          name: true,
          noticeBasis: true,
          grievanceEmail: true,
          lastContactVerifiedByHuman: true,
          isActive: true,
        },
      },
    },
  });
  if (!submittedUrl) {
    return NextResponse.json({ error: "url_not_found" }, { status: 404 });
  }
  if (!submittedUrl.urlEncrypted || isUrlExpired(submittedUrl.submittedAt)) {
    return NextResponse.json({ error: "url_expired" }, { status: 410 });
  }
  if (submittedUrl.status !== "NOTICE_QUEUED") {
    return NextResponse.json({ error: "url_not_ready_for_dispatch" }, { status: 409 });
  }
  // Notice integrity: nothing goes out in the survivor's name that they have
  // not reviewed and signed.
  if (!submittedUrl.signedNoticePdf) {
    return NextResponse.json({ error: "signature_required" }, { status: 409 });
  }

  const platform = submittedUrl.platform;
  if (!platform?.isActive) {
    return NextResponse.json({ error: "platform_not_dispatchable" }, { status: 409 });
  }
  if (!platform.grievanceEmail || !platform.lastContactVerifiedByHuman) {
    return NextResponse.json({ error: "verified_platform_contact_required" }, { status: 409 });
  }

  const templateType = templateTypeForNoticeBasis(platform.noticeBasis);
  if (!templateType) {
    return NextResponse.json({ error: "email_notice_not_supported" }, { status: 409 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType,
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
      OR: [{ platformId: platform.id }, { platformId: null }],
    },
    orderBy: [{ platformId: "desc" }, { version: "desc" }],
  });
  if (!template) {
    return NextResponse.json({ error: "reviewed_template_required" }, { status: 409 });
  }
  if (hasRetiredPortalInstructions(template.bodyTemplate)) {
    return NextResponse.json({ error: "notice_template_requires_review" }, { status: 409 });
  }

  // Exactly the fingerprints the signed PDF lists, and only once all of them
  // are approved, so the email never differs from what the survivor signed.
  // Checked before the portal token is created so a refusal leaves no trace.
  const signedAnnex = await buildSignedHashAnnex(submittedUrl.signedHashSubmissionIds);
  if (!signedAnnex.ok) {
    // A signature listing a rejected fingerprint can never go out: void it so
    // the survivor signs again (heals a failed or raced void at rejection).
    if (signedAnnex.reason === "signed_fingerprints_changed") {
      await voidSignaturesWithRejectedFingerprints(parsed.data.caseId, { trigger: "dispatch", actorId: auth.session.sub });
    }
    return NextResponse.json({ error: signedAnnex.reason }, { status: 409 });
  }

  const variables = {
    caseReference: submittedUrl.case.referenceNumber,
    platformName: platform.name,
    url: "[Reported URL is in the attached signed notice]",
    // Same reference the signed PDF carries (see sign-notice), so the email
    // body and the attached declaration agree.
    declarationReference: submittedUrl.case.referenceNumber,
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  let body = renderNoticeTemplate(template.bodyTemplate, variables);

  if (signedAnnex.annex.text) {
    body = `${body}\n\n${signedAnnex.annex.text}`;
  }

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

  const signedNoticePdf = submittedUrl.signedNoticePdf
    ? Buffer.from(decryptField(submittedUrl.signedNoticePdf), "base64")
    : null;

  try {
    const result = await dispatchTier2Notice({
      caseId: parsed.data.caseId,
      urlId: parsed.data.urlId,
      recipientEmail: platform.grievanceEmail,
      subject,
      body,
      signedNoticePdf,
      fingerprintIds: signedAnnex.annex.hashSubmissionIds,
    });
    return NextResponse.json(result);
  } catch (err) {
    // An earlier attempt in the last 24 hours reached Resend but was not
    // recorded. Sending again would email the platform twice.
    if (err instanceof Error && err.message === "email_already_sent") {
      return NextResponse.json({ error: "email_already_sent" }, { status: 409 });
    }
    throw err;
  }
}
