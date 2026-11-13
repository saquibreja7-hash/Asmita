import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { z } from "zod";
import type { UrlStatus } from "@prisma/client";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";
import { hasRetiredPortalInstructions, renderNoticeTemplate } from "@/lib/notice-generator";
import { buildHashAnnexForSigning } from "@/lib/case-hash-annex";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { isPdfSafeText } from "@/lib/pdf-text";
import { templateDigest, templateRef } from "@/lib/signed-template";
import { SIGNABLE_NOTICE_BASES, templateTypeForNoticeBasis } from "@/lib/notice-basis";
import { isUrlExpired, urlRetentionCutoff } from "@/lib/url-retention";

const FORBIDDEN_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const schema = z.object({
  urlId: z.string().min(1).optional(),
  name: z.string().min(1).max(100),
  contact: z.string().trim().pipe(z.email().max(200)),
  signature: z.string().min(1).max(100),
  // The reference preview-notice returned for the text on screen. Required:
  // every signing form is in this repo and sends it.
  templateRef: z.string().min(1).max(200),
}).strict().refine(
  (d) => !FORBIDDEN_CONTROL.test(d.name) && !FORBIDDEN_CONTROL.test(d.contact) && !FORBIDDEN_CONTROL.test(d.signature),
  { message: "invalid_characters" },
);

type UrlRow = {
  id: string;
  status: string;
  urlEncrypted: string;
  submittedAt: Date;
  signedNoticePdf: string | null;
  case: { referenceNumber: string; declarationSignedAt: Date | null };
  platform: { id: string; name: string; noticeBasis: string; isActive: boolean; lastContactVerifiedByHuman: boolean; grievanceEmail: string | null } | null;
};

const URL_SELECT = {
  id: true,
  status: true,
  urlEncrypted: true,
  submittedAt: true,
  signedNoticePdf: true,
  case: { select: { referenceNumber: true, declarationSignedAt: true } },
  platform: {
    select: { id: true, name: true, noticeBasis: true, isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: true },
  },
};

async function findUrl(
  caseId: string,
  userId: string,
  urlId: string | undefined,
  allowedStatuses: UrlStatus[],
  skipLegalGate: boolean,
): Promise<UrlRow | null> {
  if (urlId) {
    return db.submittedUrl.findFirst({
      where: { id: urlId, caseId, case: { userId } },
      select: URL_SELECT,
    }) as Promise<UrlRow | null>;
  }
  return db.submittedUrl.findFirst({
    where: {
      caseId,
      case: { userId },
      status: { in: allowedStatuses },
      platformId: { not: null },
      signedNoticePdf: null,
      urlEncrypted: { not: "" },
      submittedAt: { gt: urlRetentionCutoff() },
      platform: {
        isActive: true,
        noticeBasis: { in: [...SIGNABLE_NOTICE_BASES] },
        grievanceEmail: { notIn: ["", "<TO_BE_VERIFIED_BY_HUMAN>"] },
        ...(skipLegalGate ? {} : { lastContactVerifiedByHuman: true }),
      },
    },
    select: URL_SELECT,
    orderBy: { submittedAt: "asc" },
  }) as Promise<UrlRow | null>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { caseId } = await params;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { urlId, contact } = parsed.data;
  // NFC so an accented Latin name typed as letter plus accent is still drawable.
  const name = parsed.data.name.normalize("NFC");
  const signature = parsed.data.signature.normalize("NFC");
  // The PDF font draws Latin letters only. Ask before signing, never transliterate.
  if (!isPdfSafeText(name) || !isPdfSafeText(signature)) {
    return NextResponse.json({ error: "name_script_unsupported" }, { status: 400 });
  }
  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const allowedStatuses: UrlStatus[] = skipLegalGate
    ? ["NOTICE_QUEUED", "PENDING_REVIEW"]
    : ["NOTICE_QUEUED"];

  const url = await findUrl(caseId, auth.session.sub, urlId, allowedStatuses, skipLegalGate);
  if (!url) {
    return NextResponse.json({ error: "url_not_found" }, { status: 404 });
  }
  if (!url.urlEncrypted || isUrlExpired(url.submittedAt)) {
    return NextResponse.json({ error: "url_expired" }, { status: 410 });
  }

  if (urlId && !allowedStatuses.includes(url.status as UrlStatus)) {
    return NextResponse.json({ error: "url_not_ready" }, { status: 409 });
  }

  if (!url.platform?.isActive || !url.platform.grievanceEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.platform.grievanceEmail) || (!skipLegalGate && url.platform.lastContactVerifiedByHuman !== true)) {
    return NextResponse.json({ error: "platform_not_verified" }, { status: 409 });
  }

  if (url.signedNoticePdf) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
  if (!templateType) {
    return NextResponse.json({ error: "unsupported_notice_basis" }, { status: 409 });
  }

  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType,
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
      OR: [{ platformId: url.platform.id }, { platformId: null }],
    },
    orderBy: [{ platformId: "desc" }, { version: "desc" }],
  });
  if (!template) {
    return NextResponse.json({ error: "reviewed_template_required" }, { status: 409 });
  }
  if (hasRetiredPortalInstructions(template.bodyTemplate)) {
    return NextResponse.json({ error: "notice_template_requires_review" }, { status: 409 });
  }
  // The signed document lists every fingerprint on the case. Their ids are
  // stored with it, and dispatch sends exactly those.
  const annex = await buildHashAnnexForSigning(caseId);
  // The survivor signs only what they previewed. If another template became
  // current, or a fingerprint was added or rejected, since the preview, they
  // review the new notice first.
  if (templateRef(template, annex.hashSubmissionIds) !== parsed.data.templateRef) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  const decryptedUrl = decryptField(url.urlEncrypted);
  const variables = {
    caseReference: url.case.referenceNumber,
    platformName: url.platform.name,
    url: decryptedUrl,
    declarationReference: url.case.referenceNumber,
  };

  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const body = annex.text
    ? `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex.text}`
    : renderNoticeTemplate(template.bodyTemplate, variables);

  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateNoticePdf({
      platformName: url.platform.name,
      caseReference: url.case.referenceNumber,
      noticeSubject: subject,
      noticeBody: body,
      date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      survivorName: name,
      survivorContact: contact,
      signature,
    });
  } catch (err) {
    const error = noticePdfErrorCode(err);
    return NextResponse.json({ error }, { status: error === "name_script_unsupported" ? 400 : 409 });
  }

  const encryptedPdf = encryptField(Buffer.from(pdfBytes).toString("base64"));
  // The template the survivor signed is pinned, so dispatch emails the same text.
  const saved = await db.submittedUrl.updateMany({
    where: { id: url.id, urlEncrypted: url.urlEncrypted, submittedAt: { gt: urlRetentionCutoff() } },
    data: {
      signedNoticePdf: encryptedPdf,
      signedHashSubmissionIds: annex.hashSubmissionIds,
      signedTemplateId: template.id,
      signedTemplateDigest: templateDigest(template),
    },
  });
  if (!saved.count) return NextResponse.json({ error: "url_expired" }, { status: 410 });
  // The declaration is signed here, by a signed document, never by a checkbox.
  await db.case.updateMany({
    where: { id: caseId, declarationSignedAt: null },
    data: { declarationSignedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
