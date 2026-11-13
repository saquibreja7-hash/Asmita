import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/encryption";
import { renderNoticeTemplate } from "@/lib/notice-generator";
import { buildHashAnnexForSigning } from "@/lib/case-hash-annex";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { isPdfSafeText } from "@/lib/pdf-text";
import { templateDigest, templateRef } from "@/lib/signed-template";
import { findHashAdvisoryTemplate } from "@/lib/signable-notice";
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
    contact: z.string().trim().pipe(z.email().max(200)),
    signature: z.string().min(1).max(100),
    platformIds: z.array(z.string().min(1)).min(1).max(20),
    // The reference preview-hash-advisory returned for the text on screen.
    templateRef: z.string().min(1).max(200),
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

  const { contact, platformIds } = parsed.data;
  // NFC so an accented Latin name typed as letter plus accent is still drawable.
  const name = parsed.data.name.normalize("NFC");
  const signature = parsed.data.signature.normalize("NFC");
  // The PDF font draws Latin letters only. Ask before signing, never transliterate.
  if (!isPdfSafeText(name) || !isPdfSafeText(signature)) {
    return NextResponse.json({ error: "name_script_unsupported" }, { status: 400 });
  }

  const dbCase = await db.case.findUnique({
    where: { id: caseId },
    select: { signedHashAdvisoryPdf: true, declarationSignedAt: true },
  });
  if (!dbCase) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (dbCase.signedHashAdvisoryPdf) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  // The ids listed here are stored with the signed advisory, and dispatch
  // sends exactly these fingerprints.
  const annex = await buildHashAnnexForSigning(caseId);
  if (annex.hashSubmissionIds.length === 0) {
    return NextResponse.json({ error: "no_hashes" }, { status: 409 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const template = await findHashAdvisoryTemplate(skipLegalGate);
  if (!template) {
    return NextResponse.json({ error: "template_missing" }, { status: 409 });
  }
  // The survivor signs only the text and fingerprints they previewed.
  if (templateRef(template, annex.hashSubmissionIds) !== parsed.data.templateRef) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  // Render with the same variables as preview-hash-advisory so the signed PDF
  // content is byte-identical to what the survivor previewed.
  const variables = {
    caseReference: record.referenceNumber,
    declarationReference: record.referenceNumber,
    platformName: "your service",
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  const noticeBody = `${renderNoticeTemplate(template.bodyTemplate, variables)}\n\n${annex.text}`;

  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateNoticePdf({
      platformName: "Grievance Officer(s) / Trust and Safety Teams",
      caseReference: record.referenceNumber,
      noticeSubject: subject,
      noticeBody,
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

  // declarationSignedAt records the first signature on the case; a later
  // signature never moves it.
  // Only while still unsigned, so two submissions (a double click, or the
  // case page and the creation flow open at once) never overwrite a signature.
  const saved = await db.case.updateMany({
    where: { id: caseId, signedHashAdvisoryPdf: null },
    data: {
      signedHashAdvisoryPdf: encryptedPdf,
      hashAdvisoryPlatformIds: platformIds,
      hashAdvisorySignedHashIds: annex.hashSubmissionIds,
      // Pinned so dispatch emails the template text that was signed.
      hashAdvisorySignedTemplateId: template.id,
      hashAdvisorySignedTemplateDigest: templateDigest(template),
      ...(dbCase.declarationSignedAt ? {} : { declarationSignedAt: new Date() }),
    },
  });
  if (saved.count === 0) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

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
