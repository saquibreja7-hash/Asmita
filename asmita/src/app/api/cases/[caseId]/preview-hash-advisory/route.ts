import { NextRequest, NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { buildHashAnnex, renderNoticeTemplate } from "@/lib/notice-generator";
import { generateNoticePdf } from "@/lib/notice-pdf";

// GET /api/cases/[caseId]/preview-hash-advisory
// Returns a preview PDF of the platform-agnostic HASH_ADVISORY notice
// including the perceptual hash annex. No survivor details are included.
// The survivor reviews this before signing via sign-hash-advisory.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { caseId } = await params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_required" }, { status: 503 });
  }

  const submissions = await db.hashSubmission.findMany({
    where: { caseId, status: { notIn: ["REJECTED"] } },
    orderBy: { submittedAt: "asc" },
  });
  if (submissions.length === 0) {
    return NextResponse.json({ error: "no_hashes" }, { status: 409 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType: "HASH_ADVISORY",
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
    },
    orderBy: { version: "desc" },
  });
  if (!template) {
    return NextResponse.json({ error: "template_missing" }, { status: 409 });
  }

  const annex = buildHashAnnex({
    algorithm: "PDQ",
    hashes: submissions.map((s) => ({
      value: decryptField(s.hashEncrypted),
      quality: s.quality,
    })),
    clientVersion: submissions[0].clientVersion,
  });

  const variables = {
    caseReference: record.referenceNumber,
    declarationReference: record.referenceNumber,
    platformName: "your service",
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const body = renderNoticeTemplate(template.bodyTemplate, variables);
  const noticeBody = `${body}\n\n${annex}`;

  const pdfBytes = await generateNoticePdf({
    platformName: "Grievance Officer(s) / Trust and Safety Teams",
    caseReference: record.referenceNumber,
    noticeSubject: subject,
    noticeBody,
    date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  });

  return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="hash-advisory-preview-${record.referenceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
