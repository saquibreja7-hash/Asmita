import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/lib/auth/otp";
import { signSession } from "@/lib/auth/jwt";
import { writeAuditLog } from "@/lib/audit";
import { upsertVerifiedUser } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { hashEmail } from "@/lib/hash";

const schema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  ageOver18: z.boolean(),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/auth/verify-otp" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const emailHash = hashEmail(parsed.data.email);
  const valid = await verifyOtp(parsed.data.email, parsed.data.otp);
  if (!valid) {
    logSecurityEvent({ event: "auth_failed", actorHash: emailHash, route: "/api/auth/verify-otp", reason: "invalid_otp" });
    return NextResponse.json({ error: "invalid_otp" }, { status: 401 });
  }
  if (!parsed.data.ageOver18) {
    return NextResponse.json({ success: true, redirectTo: "/minor-support" });
  }
  const user = await upsertVerifiedUser(parsed.data.email, true);
  const session = await signSession({
    sub: user.id,
    role: "VICTIM",
    ageOver18: true,
    emailHash: user.emailHash,
  });
  await writeAuditLog({ eventType: "USER_VERIFIED", entityType: "User", entityId: user.emailHash });
  const response = NextResponse.json({ success: true, redirectTo: "/submit" });
  response.cookies.set("asmita_session", session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 4 * 60 * 60,
  });
  return response;
}
