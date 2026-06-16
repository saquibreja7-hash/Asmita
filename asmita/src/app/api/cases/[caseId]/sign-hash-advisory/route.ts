import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";
import { buildHashAnnex, renderNoticeTemplate } from "@/lib/notice-generator";
import { generateNoticePdf } from "@/lib/notice-pdf";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { writeAuditLog } from "@/lib/audit";

// POST /api/cases/[caseId]/sign-hash-advisory
// Survivor reviews the platform-agnostic hash advisory (via preview-hash-advisory),
// then submits their name/contact/signature and the target platform IDs here.
//
// Integrity: the notice body is rendered with the same variables as preview-hash-advisory
// (declarationReference = referenceNumber, platformName = "your service"). The signed
// PDF includes the perceptual hash annex, so the declaration explicitly covers the hashes.
// dispatchHashAdvisories attaches this same PDF to every outgoing email, so what the
// survivor signed == what each platform receives.

const FORBIDDEN_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const schema = z
  .object({
    name: z.string().min(1).max(100),
    contact: z.string().min(1).max(200),
    signature: z.string().min(1).max(100),
    platformIds: z.array(z.string().min(1)).min(1).max(20),
  })
  .strict()
  .refine(
    (d) =>
      !FORBIDDEN_CONTROL.test(d.name) &&
      !FORBIDDEN_CONTROL.test(d.contact) &&
      !FORBIDDEN_CONTROL.test(d.signature),
    { message: "invalid_characters" },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
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

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { name, contact, signature, platformIds } = parsed.data;

  const dbCase = await db.case.findUnique({
    where: { id: caseId },
    select: { signedHashAdvisoryPdf: true },
  });
  if (!dbCase) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (dbCase.signedHashAdvisoryPdf) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  const submissions = await db.hashSubmission.findMany({
    where: { caseId, status: { notIn: ["REJECTED"] } },
    orderBy: { submittedAt: "asc" },
  });
  if (submissions.length === 0) {
    return NextResponse.json({ error: "no_hashes" }, { status: 409 });
  }

  const skipLegalGate = process.env.DEV_SKIP_LEGAL_REVIEW === "true";
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

  // Render with the same variables as preview-hash-advisory so the signed PDF
  // content is byte-identical to what the survivor previewed.
  const variables = {
    caseReference: record.referenceNumber,
    declarationReference: record.referenceNumber,
    platformName: "your service",
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const noticeBody = `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex}`;

  const pdfBytes = await generateNoticePdf({
    platformName: "Grievance Officer(s) / Trust and Safety Teams",
    caseReference: record.referenceNumber,
    noticeSubject: subject,
    noticeBody,
    date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    survivorName: name,
    survivorContact: contact,
    signature,
  });

  const encryptedPdf = encryptField(Buffer.from(pdfBytes).toString("base64"));

  // Ensure declarationSignedAt is set (gates dispatch).
  await db.case.update({
    where: { id: caseId },
    data: {
      signedHashAdvisoryPdf: encryptedPdf,
      hashAdvisoryPlatformIds: platformIds,
      declarationSignedAt: new Date(),
    },
  });

  await writeAuditLog({
    eventType: "NOTICE_SIGNED",
    entityType: "Case",
    entityId: caseId,
    actorId: auth.session.sub,
    data: { type: "HASH_ADVISORY", platformCount: platformIds.length },
  });

  // In dev with DEV_SKIP_LEGAL_REVIEW, auto-approve PENDING_REVIEW hashes so
  // dispatch can run immediately. In production, hashes sit PENDING_REVIEW until
  // an admin approves them - dispatch is deferred to the admin panel.
  if (skipLegalGate) {
    await db.hashSubmission.updateMany({
      where: { caseId, status: "PENDING_REVIEW" },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
  }

  let dispatched = false;
  const formOnlyPlatforms: { id: string; name: string; formUrl: string }[] = [];

  if (skipLegalGate) {
    try {
      const dispatchResults = await dispatchHashAdvisories({
        caseId,
        platformIds,
        actorId: auth.session.sub,
      });
      dispatched = dispatchResults.some((r) => r.dispatched);
      for (const result of dispatchResults) {
        if (!result.dispatched && result.reason === "form_only" && result.formUrl) {
          const platform = await db.platform.findUnique({
            where: { id: result.platformId },
            select: { name: true, formUrl: true },
          });
          if (platform?.formUrl) {
            formOnlyPlatforms.push({ id: result.platformId, name: platform.name, formUrl: platform.formUrl });
          }
        }
      }
    } catch {
      // Dispatch failure is non-fatal here - PDF is signed and stored, admin can dispatch later.
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched,
    pendingReview: !skipLegalGate,
    formOnlyPlatforms,
  });
}
