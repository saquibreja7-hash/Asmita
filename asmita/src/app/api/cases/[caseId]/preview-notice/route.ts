import { NextRequest, NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { isUrlExpired } from "@/lib/url-retention";
import { hasRetiredPortalInstructions, renderNoticeTemplate } from "@/lib/notice-generator";
import { buildHashAnnexForSigning } from "@/lib/case-hash-annex";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { SIGNABLE_NOTICE_BASES, templateTypeForNoticeBasis } from "@/lib/notice-basis";
import { findSignableNotice } from "@/lib/signable-notice";
import { TEMPLATE_REF_HEADER, templateRef } from "@/lib/signed-template";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // The memory-backed local store has no verified contacts or reviewed templates.
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "no_eligible_url" }, { status: 404 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");

  // ?urlId= renders that link's notice; without it, the next link to sign.
  const urlId = req.nextUrl.searchParams.get("urlId");
  const url = await findSignableNotice(caseId, skipLegalGate, urlId ?? undefined);

  if (!url?.platform) {
    // Nothing to sign, but a link on a form-only platform is waiting: the
    // survivor files that platform's own form.
    const formOnly = await db.submittedUrl.count({
      where: {
        caseId,
        status: skipLegalGate ? { in: ["NOTICE_QUEUED", "PENDING_REVIEW"] } : "NOTICE_QUEUED",
        platform: { noticeBasis: { notIn: [...SIGNABLE_NOTICE_BASES] } },
      },
    });
    return NextResponse.json({ error: formOnly > 0 ? "form_only_platform" : "no_eligible_url" }, { status: 404 });
  }

  const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
  if (!templateType) return NextResponse.json({ error: "form_only_platform" }, { status: 404 });

  // The template findSignableNotice chose (same selection as signing), so the
  // reference returned below names exactly the text rendered here.
  const template = url.template;
  if (hasRetiredPortalInstructions(template.bodyTemplate)) {
    return NextResponse.json({ error: "notice_template_requires_review" }, { status: 409 });
  }
  // ?templateRef= asks for the text the review screen already holds a
  // reference to. If another template is current now, show nothing rather
  // than different text under that reference.
  const ref = templateRef(template);
  const expectedRef = req.nextUrl.searchParams.get("templateRef");
  if (expectedRef !== null && expectedRef !== ref) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  if (!url.urlEncrypted || isUrlExpired(url.submittedAt)) {
    return NextResponse.json({ error: "url_expired" }, { status: 410 });
  }
  const decryptedUrl = decryptField(url.urlEncrypted);
  const variables = {
    caseReference: record.referenceNumber,
    platformName: url.platform.name,
    url: decryptedUrl,
    declarationReference: record.referenceNumber,
  };

  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const annex = await buildHashAnnexForSigning(caseId);
  const body = annex.text
    ? `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex.text}`
    : renderNoticeTemplate(template.bodyTemplate, variables);

  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateNoticePdf({
      platformName: url.platform.name,
      caseReference: record.referenceNumber,
      noticeSubject: subject,
      noticeBody: body,
      date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    });
  } catch (err) {
    return NextResponse.json({ error: noticePdfErrorCode(err) }, { status: 409 });
  }

  // Copy into an exact-sized buffer: Buffer.buffer may be Node's shared 8KB
  // pool with a non-zero offset, which serves garbage bytes around the PDF.
  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="notice-preview-${record.referenceNumber}.pdf"`,
      "Cache-Control": "no-store",
      // The review screen signs exactly this link, so the signature covers the
      // notice the survivor read.
      "X-Notice-Url-Id": url.id,
      // Sent back when signing; signing refuses if the template changed since.
      [TEMPLATE_REF_HEADER]: ref,
    },
  });
}
