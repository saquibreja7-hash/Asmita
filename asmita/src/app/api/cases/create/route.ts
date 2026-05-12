import { NextResponse } from "next/server";
import { createCase, getVerifiedUserEmail } from "@/lib/store";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { sendVictimConfirmation } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/cases/create" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    logSecurityEvent({
      event: auth.error === "minor_pathway_required" ? "minor_route_blocked" : "auth_failed",
      route: "/api/cases/create",
      reason: auth.error,
    });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const record = await createCase(auth.session.sub);
  const email = getVerifiedUserEmail(auth.session.sub);
  if (email) {
    try {
      const dashboardUrl = new URL(`/case/${record.id}`, request.url).toString();
      await sendVictimConfirmation(email, record.referenceNumber, dashboardUrl);
      await writeAuditLog({
        eventType: "NOTICE_SENT",
        entityType: "Case",
        entityId: record.id,
        actorId: auth.session.sub,
        data: { messageType: "victim_confirmation" },
      });
    } catch {
      await writeAuditLog({
        eventType: "NOTICE_FAILED",
        entityType: "Case",
        entityId: record.id,
        actorId: auth.session.sub,
        data: { reason: "victim_confirmation_failed" },
      });
    }
  }
  return NextResponse.json({ caseId: record.id, referenceNumber: record.referenceNumber });
}
