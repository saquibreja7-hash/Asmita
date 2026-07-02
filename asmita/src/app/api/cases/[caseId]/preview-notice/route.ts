import { NextRequest, NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { renderNoticeTemplate } from "@/lib/notice-generator";
import { generateNoticePdf } from "@/lib/notice-pdf";

function templateTypeForNoticeBasis(noticeBasis: string) {
  if (noticeBasis === "IT_RULES_2021") return "IT_RULES_2021" as const;
  if (noticeBasis === "DMCA") return "DMCA" as const;
  if (noticeBasis === "IT_RULES_AND_DMCA") return "IT_RULES_AND_DMCA" as const;
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");

  const url = await db.submittedUrl.findFirst({
    where: {
      caseId,
      status: skipLegalGate ? { in: ["NOTICE_QUEUED", "PENDING_REVIEW"] } : "NOTICE_QUEUED",
      platformId: { not: null },
      platform: {
        isActive: true,
        ...(skipLegalGate ? {} : { lastContactVerifiedByHuman: true }),
      },
    },
    include: {
      platform: { select: { id: true, name: true, noticeBasis: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  if (!url?.platform) return NextResponse.json({ error: "no_eligible_url" }, { status: 404 });

  const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
  if (!templateType) return NextResponse.json({ error: "form_only_platform" }, { status: 404 });

  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType,
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
      OR: [{ platformId: url.platform.id }, { platformId: null }],
    },
    orderBy: [{ platformId: "desc" }, { version: "desc" }],
  });
  if (!template) return NextResponse.json({ error: "no_template" }, { status: 404 });

  const decryptedUrl = decryptField(url.urlEncrypted);
  const variables = {
    caseReference: record.referenceNumber,
    platformName: url.platform.name,
    url: decryptedUrl,
    declarationReference: record.referenceNumber,
  };

  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const body = renderNoticeTemplate(template.bodyTemplate, variables);

  const pdfBytes = await generateNoticePdf({
    platformName: url.platform.name,
    caseReference: record.referenceNumber,
    noticeSubject: subject,
    noticeBody: body,
    date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  });

  return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="notice-preview-${record.referenceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
