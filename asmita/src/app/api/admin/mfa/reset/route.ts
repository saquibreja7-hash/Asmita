import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { anyAdminEmailByHash, anyAdminHashByTargetKey, resolveAnyAdminRole } from "@/lib/auth/admin-allowlist";
import { resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { issueAdminEnrolmentCode } from "@/lib/auth/admin-enrolment";
import { requireStepUp } from "@/lib/auth/step-up";
import { hashEmail } from "@/lib/hash";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z
  .object({
    email: z.email().optional(),
    // The Admins page targets an admin by their email hash, so no full
    // email address ever travels to the browser (WP144).
    emailHash: z.string().regex(/^[a-f0-9]{16,128}$/).optional(),
    // The page's own button goes one step further and posts only this
    // opaque key (the hash of the email hash), so the single-step hash is
    // never rendered or sent either. Server-side resolution only.
    adminKey: z.string().regex(/^[a-f0-9]{16,128}$/).optional(),
  })
  .strict()
  .refine((value) => [value.email, value.emailHash, value.adminKey].filter(Boolean).length === 1, {
    message: "one_target_required",
  });

/*
 * Resets or invites an admin: clears any authenticator enrolment and issues a
 * one-time enrolment code, returned once in this response, for the SUPER_ADMIN
 * to hand over out of band. The admin signs in with their email code plus that
 * code, then enrols a new authenticator. Requires users:manage and (WP144)
 * a fresh authenticator proof: issuing an enrolment code and resetting MFA
 * are both on the step-up list.
 */

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/reset" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("users:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stepUp = requireStepUp(auth.session);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // A hash is resolved back to its allowlisted email on the server, so the
  // Admins page never has to carry the address itself; a target key goes
  // through the same allowlist resolution one step further (hash of hash).
  const email = parsed.data.email
    ?? (await anyAdminEmailByHash(parsed.data.emailHash ?? ""))
    ?? (parsed.data.adminKey ? await anyAdminEmailByHash((await anyAdminHashByTargetKey(parsed.data.adminKey)) ?? "") : null);
  if (!email) {
    return NextResponse.json({ error: "not_an_admin" }, { status: 400 });
  }

  // An allowlisted email with no valid role can never sign in, so an
  // enrolment code for it would be useless. The caller is a SUPER_ADMIN, so
  // the specific reason is safe to return.
  const role = await resolveAnyAdminRole(email);
  if (!role.ok) {
    return NextResponse.json({
      error: role.reason === "not_allowlisted" ? "not_an_admin" : "admin_role_invalid",
      message: role.reason === "not_allowlisted"
        ? "That email is not on the admin list (ADMIN_EMAILS). Add it there first."
        : "That email is on the admin list but has no valid role (ADMIN_ROLES). It could not sign in, so no code was issued.",
    }, { status: 400 });
  }

  const targetHash = hashEmail(email);
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
