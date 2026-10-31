import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdminSetup } from "@/lib/auth/require-admin";
import { enrolAdminMfa } from "@/lib/auth/admin-mfa-store";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

/*
 * Creates this admin's own authenticator secret. It is returned exactly once,
 * in this response, and is never displayed again. Fails if already enrolled;
 * a SUPER_ADMIN must reset first.
 */
export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/enroll" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminSetup();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const secret = await enrolAdminMfa(auth.session.emailHash);
  if (!secret) {
    return NextResponse.json({ error: "already_enrolled" }, { status: 409 });
  }

  const issuer = "Asmita Admin";
  const account = auth.session.sub;
  const otpauthUri =
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  const qrSvg = await QRCode.toString(otpauthUri, { type: "svg", margin: 2 });

  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: auth.session.sub,
    actorId: auth.session.sub,
    data: { action: "ADMIN_MFA_ENROLLED" },
  });

  return NextResponse.json({ secret, otpauthUri, qrSvg });
}
