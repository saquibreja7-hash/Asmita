import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { dispatchPortalReissue } from "@/lib/notice-dispatch";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  renderNoticeTemplate,
} from "@/lib/notice-generator";
import { createPortalToken } from "@/lib/url-portal";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  request: Request,
  context: { params: Promise<{ urlId: string }> },
) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { urlId } = await context.params;

  const submittedUrl = await db.submittedUrl.findUnique({
    where: { id: urlId },
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
  if (submittedUrl.status !== "NOTICE_SENT") {
    return NextResponse.json({ error: "notice_not_yet_sent" }, { status: 409 });
  }

  const platform = submittedUrl.platform;
  if (!platform?.isActive || !platform.grievanceEmail || !platform.lastContactVerifiedByHuman) {
    return NextResponse.json({ error: "platform_not_dispatchable" }, { status: 409 });
  }

  const templateTypeMap: Record<string, string> = {
    IT_RULES_2021: "IT_RULES_2021",
    DMCA: "DMCA",
    IT_RULES_AND_DMCA: "IT_RULES_AND_DMCA",
  };
  const templateType = templateTypeMap[platform.noticeBasis];
  if (!templateType) {
    return NextResponse.json({ error: "email_notice_not_supported" }, { status: 409 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType: templateType as never,
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
      OR: [{ platformId: platform.id }, { platformId: null }],
    },
    orderBy: [{ platformId: "desc" }, { version: "desc" }],
  });
  if (!template) {
    return NextResponse.json({ error: "reviewed_template_required" }, { status: 409 });
  }

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
    declarationReference:
      submittedUrl.case.declarationSignedAt?.toISOString() ?? submittedUrl.case.referenceNumber,
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  let body = renderNoticeTemplate(template.bodyTemplate, variables);

  body = [
    body,
    "",
    "---",
    "SECURE URL ACCESS INSTRUCTIONS (RE-ISSUED)",
    "",
    "A new secure portal link has been issued for this case. The previous link",
    "has been permanently deactivated. To view the reported URL, visit the link",
    "above and enter the following one-time access code:",
    "",
    `Access code: ${accessCode}`,
    "",
    "This link can be accessed only once. If you require further re-access,",
    "contact notice@meriasmita.org with the case reference number.",
    "---",
  ].join("\n");

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

  const signedNoticePdf = submittedUrl.signedNoticePdf
    ? Buffer.from(decryptField(submittedUrl.signedNoticePdf), "base64")
    : null;

  const result = await dispatchPortalReissue({
    caseId: submittedUrl.caseId,
    urlId: submittedUrl.id,
    recipientEmail: platform.grievanceEmail,
    subject,
    body,
    signedNoticePdf,
  });

  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "SubmittedUrl",
    entityId: urlId,
    actorId: auth.session.sub,
    data: { action: "portal_token_reissued", token: token.slice(0, 8) + "..." },
  });

  return NextResponse.json(result);
}
