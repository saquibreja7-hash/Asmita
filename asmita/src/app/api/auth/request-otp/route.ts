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
  const emailLimit = await checkRateLimitAsync(`otp:${emailHash}`, 10, 60 * 60_000);
  const domain = parsed.data.email.split("@")[1]?.toLowerCase() || "unknown";
  const domainLimit = await checkRateLimitAsync(`registration-domain:${domain}`, 3, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(`registration-ip:${getClientIp(request)}`, 3, 60 * 60_000);
  if (!emailLimit.allowed || !domainLimit.allowed || !ipLimit.allowed) {
    logSecurityEvent({ event: "rate_limit_exceeded", actorHash: emailHash, route: "/api/auth/request-otp" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const otp = await createOtpForEmail(parsed.data.email);
  await sendOtp(parsed.data.email, otp.token);
  await writeAuditLog({ eventType: "USER_REGISTERED", entityType: "User", entityId: emailHash });
  return NextResponse.json({
    success: true,
    devOtp: process.env.RESEND_API_KEY || process.env.NODE_ENV === "production" ? undefined : otp.token,
  });
}
