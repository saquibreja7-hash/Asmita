import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpForEmail } from "@/lib/auth/otp";
import { resolveAdminRole } from "@/lib/auth/admin-allowlist";
import { verifyCsrfRequest } from "@/lib/csrf";
import { sendOtp } from "@/lib/email";
import { hashEmail } from "@/lib/hash";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/auth/request-otp" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // Whether this address is an admin must not show in the response: the same
  // rate limits apply to every address, and a non-admin gets the same success
  // reply, with no code stored or sent.
  const access = resolveAdminRole(parsed.data.email);
  const emailHash = hashEmail(parsed.data.email);
  const devBypass = process.env.NODE_ENV !== "production" && Boolean(process.env.DEV_OTP_CODE);
  if (!devBypass) {
    let emailLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
    let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
    try {
      emailLimit = await checkRateLimitAsync(`admin-otp:${emailHash}`, 5, 60 * 60_000);
      ipLimit = await checkRateLimitAsync(`admin-login-ip:${getClientIp(request)}`, 10, 60 * 60_000, { shared: true });
    } catch (error) {
      await logSecurityEvent({
        event: "rate_limit_unavailable",
        actorHash: emailHash,
        route: "/api/admin/auth/request-otp",
        reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
      });
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    if (!emailLimit.allowed || !ipLimit.allowed) {
      await logSecurityEvent({ event: "rate_limit_exceeded", actorHash: emailHash, route: "/api/admin/auth/request-otp" });
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  if (!access.ok) {
    // An allowlisted email without a valid ADMIN_ROLES entry is a
    // misconfiguration: record its hash and reason so operators can see it.
    const misconfigured = access.reason !== "not_allowlisted";
    await logSecurityEvent({
      event: "admin_denied",
      route: "/api/admin/auth/request-otp",
      ...(misconfigured ? { actorHash: emailHash, reason: access.reason } : {}),
    });
    return NextResponse.json({ success: true });
  }

  let otp: Awaited<ReturnType<typeof createOtpForEmail>>;
  try {
    otp = await createOtpForEmail(parsed.data.email);
  } catch (error) {
    await logSecurityEvent({
      event: "otp_persistence_failed",
      actorHash: emailHash,
      route: "/api/admin/auth/request-otp",
      reason: error instanceof Error ? error.message : "unknown_otp_error",
    });
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  try {
    await sendOtp(parsed.data.email, otp.token);
  } catch (error) {
    await logSecurityEvent({
      event: "email_failed",
      actorHash: emailHash,
      route: "/api/admin/auth/request-otp",
      reason: error instanceof Error ? error.message : "unknown_email_error",
    });
    return NextResponse.json({ error: "email_failed" }, { status: 502 });
  }
  return NextResponse.json({
    success: true,
    devOtp: process.env.RESEND_API_KEY || process.env.NODE_ENV === "production" ? undefined : otp.token,
  });
}
