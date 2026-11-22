import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyAdminTotp } from "@/lib/auth/admin-mfa";
import { getAdminMfaSecret, touchAdminMfa } from "@/lib/auth/admin-mfa-store";
import { signAdminSession } from "@/lib/auth/jwt";
import { stepUpNow } from "@/lib/auth/step-up";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { adminSessionCookieName } from "@/lib/cookie-names";

const schema = z.object({ token: z.string().regex(/^\d{6}$/) });

/*
 * POST /api/admin/mfa/step-up — a fresh authenticator code for the actions
 * that need one (WP144: routing rules, queue access, roles, enrolment codes,
 * MFA reset, bulk decisions over 10 items). Verifies the code against the
 * admin's own secret — the same verification sign-in uses — and re-issues
 * the session with a fresh mfaAt claim. No secret is stored, logged or sent.
 */

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/step-up" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  // Guessing a 6-digit code needs many attempts; allow 5 per 15 minutes,
  // the same budget as the enrolment confirmation.
  const attempts = await checkRateLimitAsync(`admin-mfa-step-up:${auth.session.emailHash}`, 5, 15 * 60_000);
  if (!attempts.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", actorHash: auth.session.emailHash,
      route: "/api/admin/mfa/step-up" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // An enrolment whose secret cannot be decrypted (a corrupt or placeholder
  // row) behaves like a wrong code: the authenticator cannot be checked, so
  // the step-up is refused and logged, never a 500.
  let secret: string | null = null;
  try {
    secret = await getAdminMfaSecret(auth.session.emailHash);
  } catch {
    secret = null;
  }
  if (secret && !verifyAdminTotp({ token: parsed.data.token, secret })) {
    await logSecurityEvent({ event: "auth_failed", actorHash: auth.session.emailHash,
      route: "/api/admin/mfa/step-up", reason: "invalid_totp" });
    return NextResponse.json({ error: "invalid_totp" }, { status: 401 });
  }
  if (!secret) {
    await logSecurityEvent({ event: "auth_failed", actorHash: auth.session.emailHash,
      route: "/api/admin/mfa/step-up", reason: "secret_unreadable" });
    return NextResponse.json({ error: "invalid_totp" }, { status: 401 });
  }

  if (secret) await touchAdminMfa(auth.session.emailHash);

  const session = await signAdminSession({
    sub: auth.session.sub,
    emailHash: auth.session.emailHash,
    adminRole: auth.session.adminRole,
    mfaComplete: true,
    mfaAt: stepUpNow(),
  });
  await writeAuditLog({
    eventType: "ADMIN_ACTION", entityType: "Admin", entityId: auth.session.sub,
    actorId: auth.session.sub, data: { action: "ADMIN_MFA_STEP_UP" },
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), session, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 8 * 60 * 60,
  });
  return response;
}
