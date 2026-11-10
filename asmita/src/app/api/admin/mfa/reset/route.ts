import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { resolveAdminRole } from "@/lib/auth/admin-allowlist";
import { resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { issueAdminEnrolmentCode } from "@/lib/auth/admin-enrolment";
import { hashEmail } from "@/lib/hash";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({ email: z.email() });

/*
 * Resets or invites an admin: clears any authenticator enrolment and issues a
 * one-time enrolment code, returned once in this response, for the SUPER_ADMIN
 * to hand over out of band. The admin signs in with their email code plus that
 * code, then enrols a new authenticator. Requires users:manage.
 */
export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/reset" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("users:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // An allowlisted email with no valid role can never sign in, so an
  // enrolment code for it would be useless. The caller is a SUPER_ADMIN, so
  // the specific reason is safe to return.
  const role = resolveAdminRole(parsed.data.email);
  if (!role.ok) {
    return NextResponse.json({
      error: role.reason === "not_allowlisted" ? "not_an_admin" : "admin_role_invalid",
      message: role.reason === "not_allowlisted"
        ? "That email is not on the admin list (ADMIN_EMAILS). Add it there first."
        : "That email is on the admin list but has no valid role (ADMIN_ROLES). It could not sign in, so no code was issued.",
    }, { status: 400 });
  }

  const targetHash = hashEmail(parsed.data.email);
  const removed = await resetAdminMfa(targetHash);
  const { code, expiresAt } = await issueAdminEnrolmentCode(targetHash, auth.session.sub);

  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: `admin-${targetHash.slice(0, 24)}`,
    actorId: auth.session.sub,
    data: { action: "ADMIN_MFA_RESET", removed, enrolmentCodeIssued: true },
  });

  return NextResponse.json({ ok: true, removed, enrolmentCode: code, expiresAt: expiresAt.toISOString() });
}
