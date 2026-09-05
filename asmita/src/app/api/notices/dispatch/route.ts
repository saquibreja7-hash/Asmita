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
} from "@/lib/notice-generator";
import { buildCaseHashAnnex } from "@/lib/case-hash-annex";
import { createPortalToken } from "@/lib/url-portal";

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
      case: { select: { referenceNumber: true, declarationSignedAt: true } },
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

  // Generate a one-time portal token. The raw URL never appears in the email -
  // only the portal link. The platform officer enters an access code to view it
  // once; if they reply quoting the email, Asmita sees a spent token, not the URL.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://meriasmita.org";
  const { token, accessCode } = await createPortalToken(
    submittedUrl.id,
    submittedUrl.urlEncrypted,
  );
  const portalLink = `${baseUrl}/r/${token}`;

  const variables = {
    caseReference: submittedUrl.case.referenceNumber,
    platformName: platform.name,
    url: portalLink,
    // Same reference the signed PDF carries (see sign-notice), so the email
    // body and the attached declaration agree.
    declarationReference: submittedUrl.case.referenceNumber,
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  let body = renderNoticeTemplate(template.bodyTemplate, variables);

  // Append only fingerprints that were approved and already on the case when
  // the survivor signed, so the annex never exceeds what the signature covers.
  const annex = await buildCaseHashAnnex(parsed.data.caseId, {
    kind: "for-dispatch",
    signedAt: submittedUrl.case.declarationSignedAt,
  });
  if (annex) {
    body = `${body}\n\n${annex}`;
  }

  // Append access instructions. The portal link appears in the body above
  // (via {{ url }}); the access code is listed here so the officer can enter it.
  body = [
    body,
    "",
    "---",
    "SECURE URL ACCESS INSTRUCTIONS",
    "",
    "The URL of the reported content is accessible via the secure portal link",
    "shown above in this notice. To view the URL, visit the link and enter the",
    "following one-time access code:",
    "",
    `Access code: ${accessCode}`,
    "",
    "This link can be accessed only once. Once opened, it is permanently",
    "deactivated. If you require re-access, contact notice@meriasmita.org",
    "with the case reference number.",
    "---",
  ].join("\n");

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

  const signedNoticePdf = submittedUrl.signedNoticePdf
    ? Buffer.from(decryptField(submittedUrl.signedNoticePdf), "base64")
    : null;

  const result = await dispatchTier2Notice({
    caseId: parsed.data.caseId,
    urlId: parsed.data.urlId,
    recipientEmail: platform.grievanceEmail,
    subject,
    body,
    signedNoticePdf,
  });
  return NextResponse.json(result);
}
