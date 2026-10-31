import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSetup } from "@/lib/auth/require-admin";
import { confirmAdminMfa } from "@/lib/auth/admin-mfa-store";
import { signAdminSession } from "@/lib/auth/jwt";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({ token: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/confirm" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminSetup();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (!(await confirmAdminMfa(auth.session.emailHash, parsed.data.token))) {
    await logSecurityEvent({ event: "auth_failed", actorHash: auth.session.emailHash,
      route: "/api/admin/mfa/confirm", reason: "invalid_totp" });
    return NextResponse.json({ error: "invalid_totp" }, { status: 401 });
  }

  const session = await signAdminSession({
    sub: auth.session.sub,
    emailHash: auth.session.emailHash,
    adminRole: auth.session.adminRole,
    mfaComplete: true,
  });
  await writeAuditLog({
    eventType: "ADMIN_ACTION", entityType: "Admin", entityId: auth.session.sub,
    actorId: auth.session.sub, data: { action: "ADMIN_MFA_CONFIRMED" },
  });
  const response = NextResponse.json({ ok: true, redirectTo: "/admin/cases" });
  response.cookies.set("asmita_admin_session", session, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 8 * 60 * 60,
  });
  return response;
}
