import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpForEmail } from "@/lib/auth/otp";
import { isAdminEmail } from "@/lib/auth/admin-allowlist";
import { verifyCsrfRequest } from "@/lib/csrf";
import { sendOtp } from "@/lib/email";
import { hashEmail } from "@/lib/hash";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/admin/auth/request-otp" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !isAdminEmail(parsed.data.email)) {
    logSecurityEvent({ event: "admin_denied", route: "/api/admin/auth/request-otp" });
    return NextResponse.json({ error: "admin_not_allowed" }, { status: 403 });
  }

  const emailHash = hashEmail(parsed.data.email);
  let emailLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  try {
    emailLimit = await checkRateLimitAsync(`admin-otp:${emailHash}`, 5, 60 * 60_000);
    ipLimit = await checkRateLimitAsync(`admin-login-ip:${getClientIp(request)}`, 10, 60 * 60_000);
  } catch (error) {
    logSecurityEvent({
      event: "rate_limit_unavailable",
      actorHash: emailHash,
      route: "/api/admin/auth/request-otp",
      reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
    });
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  if (!emailLimit.allowed || !ipLimit.allowed) {
    logSecurityEvent({ event: "rate_limit_exceeded", actorHash: emailHash, route: "/api/admin/auth/request-otp" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let otp: Awaited<ReturnType<typeof createOtpForEmail>>;
  try {
    otp = await createOtpForEmail(parsed.data.email);
  } catch (error) {
    logSecurityEvent({
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
    logSecurityEvent({
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
