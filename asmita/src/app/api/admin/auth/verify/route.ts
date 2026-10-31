import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { z } from "zod";
import { createAdminIdentity, getAdminRole, isAdminEmail } from "@/lib/auth/admin-allowlist";
import { verifyAdminTotp } from "@/lib/auth/admin-mfa";
import { getAdminMfaSecret, touchAdminMfa } from "@/lib/auth/admin-mfa-store";
import { consumeAdminEnrolmentCode } from "@/lib/auth/admin-enrolment";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/auth/otp";
import { signAdminSession } from "@/lib/auth/jwt";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  // 6 digits: the admin's authenticator. 12 digits: a one-time enrolment code.
  totp: z.string().regex(/^(\d{6}|\d{12})$/),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/auth/verify" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !isAdminEmail(parsed.data.email)) {
    await logSecurityEvent({ event: "admin_denied", route: "/api/admin/auth/verify" });
    return NextResponse.json({ error: "admin_not_allowed" }, { status: 403 });
  }

  const admin = createAdminIdentity(parsed.data.email);
  const attempts = await checkRateLimitAsync(`admin-verify:${admin.emailHash}`, 5, 15 * 60_000);
  if (!attempts.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", actorHash: admin.emailHash, route: "/api/admin/auth/verify" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const otpOk = await verifyOtp(parsed.data.email, parsed.data.otp);
  const skipMfa = devFlagEnabled("DEV_SKIP_ADMIN_MFA");
  // Enrolled admins must use their own authenticator. An admin who has not
  // enrolled signs in once with a one-time enrolment code issued for them, and
  // is sent to /admin/setup-mfa. The code is only spent after the email code
  // checks out, so a wrong email code never burns it.
  const ownSecret = await getAdminMfaSecret(admin.emailHash);
  const enrolled = ownSecret !== null;
  const mfaOk =
    skipMfa ||
    (enrolled
      ? verifyAdminTotp({ token: parsed.data.totp, secret: ownSecret })
      : otpOk && (await consumeAdminEnrolmentCode(admin.emailHash, parsed.data.totp)));
  if (!otpOk || !mfaOk) {
    await logSecurityEvent({
      event: "auth_failed",
      actorHash: admin.emailHash,
      route: "/api/admin/auth/verify",
      reason: otpOk ? "invalid_totp" : "invalid_otp",
    });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (enrolled) await touchAdminMfa(admin.emailHash);

  const session = await signAdminSession({
    sub: admin.id,
    emailHash: admin.emailHash,
    adminRole: getAdminRole(parsed.data.email),
    mfaComplete: enrolled || skipMfa,
  });
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: admin.id,
    actorId: admin.id,
    data: { action: "ADMIN_LOGIN", mfa: enrolled ? "enrolled" : skipMfa ? "dev_skip" : "enrolment_code" },
  });
  const response = NextResponse.json({
    success: true,
    redirectTo: enrolled ? "/admin/cases" : "/admin/setup-mfa",
  });
  response.cookies.set("asmita_admin_session", session, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    // Admin APIs live under /api/admin/*, so the cookie must be site-wide.
    // Cross-use with the survivor session is prevented by the namespace claim.
    path: "/",
    maxAge: enrolled || skipMfa ? 8 * 60 * 60 : 10 * 60,
  });
  return response;
}
