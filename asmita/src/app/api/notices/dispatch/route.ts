import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice } from "@/lib/notice-dispatch";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  buildHashAnnex,
  renderNoticeTemplate,
} from "@/lib/notice-generator";
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

  const skipLegalGate = process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_LEGAL_REVIEW === "true";
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

  // Generate a one-time portal token. The raw URL never appears in the email —
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
    declarationReference:
      submittedUrl.case.declarationSignedAt?.toISOString() ?? submittedUrl.case.referenceNumber,
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  let body = renderNoticeTemplate(template.bodyTemplate, variables);

  // If APPROVED hashes exist for this case, append the hash annex so the
  // platform receives both the URL notice and the perceptual hash in one email.
  const approvedHashes = await db.hashSubmission.findMany({
    where: { caseId: parsed.data.caseId, status: { in: ["APPROVED", "DISPATCHED"] } },
    orderBy: { submittedAt: "asc" },
  });
  if (approvedHashes.length > 0) {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: approvedHashes.map((h) => ({
        value: decryptField(h.hashEncrypted),
        quality: h.quality,
      })),
      clientVersion: approvedHashes[0].clientVersion,
    });
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
