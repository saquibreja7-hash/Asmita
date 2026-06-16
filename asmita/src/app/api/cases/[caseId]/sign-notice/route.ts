import { NextResponse } from "next/server";
import { z } from "zod";
import type { UrlStatus } from "@prisma/client";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";
import { renderNoticeTemplate } from "@/lib/notice-generator";
import { generateNoticePdf } from "@/lib/notice-pdf";

const FORBIDDEN_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const schema = z.object({
  urlId: z.string().min(1).optional(),
  name: z.string().min(1).max(100),
  contact: z.string().min(1).max(200),
  signature: z.string().min(1).max(100),
}).strict().refine(
  (d) => !FORBIDDEN_CONTROL.test(d.name) && !FORBIDDEN_CONTROL.test(d.contact) && !FORBIDDEN_CONTROL.test(d.signature),
  { message: "invalid_characters" },
);

type UrlRow = {
  id: string;
  status: string;
  urlEncrypted: string;
  signedNoticePdf: string | null;
  case: { referenceNumber: string; declarationSignedAt: Date | null };
  platform: { id: string; name: string; noticeBasis: string; isActive: boolean; lastContactVerifiedByHuman: boolean } | null;
};

const URL_SELECT = {
  id: true,
  status: true,
  urlEncrypted: true,
  signedNoticePdf: true,
  case: { select: { referenceNumber: true, declarationSignedAt: true } },
  platform: {
    select: { id: true, name: true, noticeBasis: true, isActive: true, lastContactVerifiedByHuman: true },
  },
};

function templateTypeForNoticeBasis(noticeBasis: string) {
  if (noticeBasis === "IT_RULES_2021") return "IT_RULES_2021" as const;
  if (noticeBasis === "DMCA") return "DMCA" as const;
  if (noticeBasis === "IT_RULES_AND_DMCA") return "IT_RULES_AND_DMCA" as const;
  return null;
}

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
      platform: { isActive: true, ...(skipLegalGate ? {} : { lastContactVerifiedByHuman: true }) },
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

  const { urlId, name, contact, signature } = parsed.data;
  const skipLegalGate = process.env.DEV_SKIP_LEGAL_REVIEW === "true";
  const allowedStatuses: UrlStatus[] = skipLegalGate
    ? ["NOTICE_QUEUED", "PENDING_REVIEW"]
    : ["NOTICE_QUEUED"];

  const url = await findUrl(caseId, auth.session.sub, urlId, allowedStatuses, skipLegalGate);
  if (!url) {
    return NextResponse.json({ error: "url_not_found" }, { status: 404 });
  }

  if (urlId && !allowedStatuses.includes(url.status as UrlStatus)) {
    return NextResponse.json({ error: "url_not_ready" }, { status: 409 });
  }

  if (!url.platform?.isActive || (!skipLegalGate && url.platform.lastContactVerifiedByHuman !== true)) {
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

  const decryptedUrl = decryptField(url.urlEncrypted);
  const variables = {
    caseReference: url.case.referenceNumber,
    platformName: url.platform.name,
    url: decryptedUrl,
    declarationReference: url.case.referenceNumber,
  };

  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const body = renderNoticeTemplate(template.bodyTemplate, variables);

  const pdfBytes = await generateNoticePdf({
    platformName: url.platform.name,
    caseReference: url.case.referenceNumber,
    noticeSubject: subject,
    noticeBody: body,
    date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    survivorName: name,
    survivorContact: contact,
    signature,
  });

  const encryptedPdf = encryptField(Buffer.from(pdfBytes).toString("base64"));
  await db.submittedUrl.update({
    where: { id: url.id },
    data: { signedNoticePdf: encryptedPdf },
  });

  return NextResponse.json({ ok: true });
}
