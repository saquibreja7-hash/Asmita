import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminIdentity, isAdminEmail } from "@/lib/auth/admin-allowlist";
import { verifyAdminTotp } from "@/lib/auth/admin-mfa";
import { verifyOtp } from "@/lib/auth/otp";
import { signAdminSession } from "@/lib/auth/jwt";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  totp: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/admin/auth/verify" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !isAdminEmail(parsed.data.email)) {
    logSecurityEvent({ event: "admin_denied", route: "/api/admin/auth/verify" });
    return NextResponse.json({ error: "admin_not_allowed" }, { status: 403 });
  }

  const admin = createAdminIdentity(parsed.data.email);
  const otpOk = await verifyOtp(parsed.data.email, parsed.data.otp);
  const mfaOk = verifyAdminTotp({ token: parsed.data.totp });
  if (!otpOk || !mfaOk) {
    logSecurityEvent({
      event: "auth_failed",
      actorHash: admin.emailHash,
      route: "/api/admin/auth/verify",
      reason: otpOk ? "invalid_totp" : "invalid_otp",
    });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const session = await signAdminSession({ sub: admin.id, emailHash: admin.emailHash });
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: admin.id,
    actorId: admin.id,
    data: { action: "ADMIN_LOGIN" },
  });
  const response = NextResponse.json({ success: true, redirectTo: "/admin/cases" });
  response.cookies.set("asmita_admin_session", session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
