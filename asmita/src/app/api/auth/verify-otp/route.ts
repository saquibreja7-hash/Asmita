import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/lib/auth/otp";
import { signSession } from "@/lib/auth/jwt";
import { writeAuditLog } from "@/lib/audit";
import { findVerifiedUserByEmail, listCaseIdsForUser, upsertVerifiedUser } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { hashEmail } from "@/lib/hash";
import { sessionCookieName } from "@/lib/cookie-names";

// "file" (the default) is the File a complaint flow, which asks her age first.
// "track" is Track your case: it never creates an account, and it sends her to
// her case (or the list of her cases) if this email already has one.
const schema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  ageOver18: z.boolean().optional(),
  purpose: z.enum(["file", "track"]).default("file"),
});

async function withSession(body: Record<string, unknown>, user: { id: string; emailHash: string }) {
  const session = await signSession({
    sub: user.id,
    role: "VICTIM",
    ageOver18: true,
    emailHash: user.emailHash,
  });
  const response = NextResponse.json(body);
  response.cookies.set(sessionCookieName(), session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 4 * 60 * 60,
  });
  return response;
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/auth/verify-otp" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || (parsed.data.purpose === "file" && parsed.data.ageOver18 === undefined)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const emailHash = hashEmail(parsed.data.email);
  const valid = await verifyOtp(parsed.data.email, parsed.data.otp);
  if (!valid) {
    await logSecurityEvent({ event: "auth_failed", actorHash: emailHash, route: "/api/auth/verify-otp", reason: "invalid_otp" });
    return NextResponse.json({ error: "invalid_otp" }, { status: 401 });
  }

  if (parsed.data.purpose === "track") {
    // Only the owner of the inbox gets this far, so saying "no case" reveals
    // nothing to anyone else. No account is created and no session is issued.
    const existing = await findVerifiedUserByEmail(parsed.data.email);
    if (!existing || !existing.ageOver18) {
      return NextResponse.json({ success: true, noCase: true, redirectTo: "/start" });
    }
    const caseIds = await listCaseIdsForUser(existing.id);
    if (caseIds.length === 0) {
      return NextResponse.json({ success: true, noCase: true, redirectTo: "/start" });
    }
    // Signing in again also cancels a pending deletion, as on the filing path.
    const user = await upsertVerifiedUser(parsed.data.email, true);
    await writeAuditLog({ eventType: "USER_VERIFIED", entityType: "User", entityId: user.emailHash });
    const redirectTo = caseIds.length === 1 ? `/case/${caseIds[0]}` : "/my-cases";
    return withSession({ success: true, redirectTo }, user);
  }

  if (!parsed.data.ageOver18) {
    return NextResponse.json({ success: true, redirectTo: "/minor-support" });
  }
  const user = await upsertVerifiedUser(parsed.data.email, true);
  await writeAuditLog({ eventType: "USER_VERIFIED", entityType: "User", entityId: user.emailHash });
  // hasCases lets the filing form offer her existing case instead of a duplicate.
  const hasCases = (await listCaseIdsForUser(user.id)).length > 0;
  return withSession({ success: true, redirectTo: "/submit", hasCases }, user);
}
