import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpForEmail } from "@/lib/auth/otp";
import { sendOtp } from "@/lib/email";
import { hashEmail } from "@/lib/hash";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { getClientIp } from "@/lib/request-ip";

const schema = z.object({ email: z.email() });

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "rediffmail.com", "zoho.com", "zohomail.in", "aol.com",
]);

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/auth/request-otp" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const emailHash = hashEmail(parsed.data.email);
  const devBypass = process.env.NODE_ENV !== "production" && Boolean(process.env.DEV_OTP_CODE);
  if (!devBypass) {
    let emailLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
    let domainLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
    let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
    try {
      emailLimit = await checkRateLimitAsync(`otp:${emailHash}`, 10, 60 * 60_000);
      const domain = parsed.data.email.split("@")[1]?.toLowerCase() || "unknown";
      // Public mail providers are shared by millions of survivors; a per-domain
      // bucket there lets three requests lock everyone out. Only throttle
      // unusual domains, which is where bulk fake signups come from.
      domainLimit = PUBLIC_MAIL_DOMAINS.has(domain)
        ? { allowed: true, remaining: Number.MAX_SAFE_INTEGER }
        : await checkRateLimitAsync(`registration-domain:${domain}`, 10, 24 * 60 * 60_000);
      // Carrier-grade NAT on Indian mobile networks puts many people behind one IP.
      ipLimit = await checkRateLimitAsync(`registration-ip:${getClientIp(request)}`, 30, 60 * 60_000);
    } catch (error) {
      logSecurityEvent({
        event: "rate_limit_unavailable",
        actorHash: emailHash,
        route: "/api/auth/request-otp",
        reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
      });
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    if (!emailLimit.allowed || !domainLimit.allowed || !ipLimit.allowed) {
      logSecurityEvent({ event: "rate_limit_exceeded", actorHash: emailHash, route: "/api/auth/request-otp" });
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }
  let otp: Awaited<ReturnType<typeof createOtpForEmail>>;
  try {
    otp = await createOtpForEmail(parsed.data.email);
  } catch (error) {
    logSecurityEvent({
      event: "otp_persistence_failed",
      actorHash: emailHash,
      route: "/api/auth/request-otp",
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
      route: "/api/auth/request-otp",
      reason: error instanceof Error ? error.message : "unknown_email_error",
    });
    return NextResponse.json({ error: "email_failed" }, { status: 502 });
  }
  await writeAuditLog({ eventType: "USER_REGISTERED", entityType: "User", entityId: emailHash });
  return NextResponse.json({
    success: true,
    devOtp: process.env.RESEND_API_KEY || process.env.NODE_ENV === "production" ? undefined : otp.token,
  });
}
