import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser, getVerifiedUserEmail } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { devFlagEnabled } from "@/lib/dev-flags";
import { findSignableNotice } from "@/lib/signable-notice";
import { sendVictimConfirmation } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

// Called only after the survivor submits an investigation request or signs
// the final available notice. Case creation itself only prepares the preview.
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { caseId } = await params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const hasDb = Boolean(process.env.DATABASE_URL);
  if (hasDb && await findSignableNotice(caseId, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"))) {
    return NextResponse.json({ error: "notice_pending" }, { status: 409 });
  }
  if (hasDb) {
    if (record.urls.length === 0) {
      const hashCase = await db.case.findUnique({ where: { id: caseId }, select: { signedHashAdvisoryPdf: true } });
      const emailHashes = await db.hashSubmission.count({ where: { caseId, requestedPlatform: { noticeBasis: { not: "FORM_ONLY" }, isActive: true } } });
      if (emailHashes > 0 && !hashCase?.signedHashAdvisoryPdf) return NextResponse.json({ error: "notice_pending" }, { status: 409 });
    }
    const sent = await db.auditLog.findFirst({ where: { entityId: caseId, entityType: "Case", eventType: "NOTICE_SENT", data: { path: ["messageType"], equals: "victim_confirmation" } }, select: { id: true } });
    if (sent) return NextResponse.json({ ok: true });
  }
  const email = await getVerifiedUserEmail(auth.session.sub);
  if (!email) return NextResponse.json({ error: "email_unavailable" }, { status: 409 });
  try {
    await sendVictimConfirmation(email, record.referenceNumber, new URL(`/case/${caseId}`, request.url).toString());
    await writeAuditLog({ eventType: "NOTICE_SENT", entityType: "Case", entityId: caseId, actorId: auth.session.sub, data: { messageType: "victim_confirmation" } });
    return NextResponse.json({ ok: true });
  } catch {
    await writeAuditLog({ eventType: "NOTICE_FAILED", entityType: "Case", entityId: caseId, actorId: auth.session.sub, data: { reason: "victim_confirmation_failed" } });
    return NextResponse.json({ error: "email_failed" }, { status: 502 });
  }
}
