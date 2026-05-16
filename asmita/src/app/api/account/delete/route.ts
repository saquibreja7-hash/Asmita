import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { deactivateUser } from "@/lib/case-ops";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const deletion = await deactivateUser(auth.session.sub);
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "User",
    entityId: auth.session.sub,
    data: { action: "account_deletion_scheduled", hardDeleteAfter: deletion.hardDeleteAfter },
  });
  const response = NextResponse.json({ success: true, ...deletion });
  response.cookies.set("asmita_session", "", { path: "/", maxAge: 0 });
  return response;
}
