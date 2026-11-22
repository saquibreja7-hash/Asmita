import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { deactivateUser } from "@/lib/case-ops";
import { writeAuditLog } from "@/lib/audit";
import { sessionCookieName, withLegacyFallback } from "@/lib/cookie-names";

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
  // Clear the current name and, for one release, the pre-__Host- name.
  // Secure is required to delete a __Host- cookie at all.
  for (const name of withLegacyFallback(sessionCookieName())) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
