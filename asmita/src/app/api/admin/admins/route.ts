import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { requireStepUp } from "@/lib/auth/step-up";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";
import { hashEmail } from "@/lib/hash";
import { ALL_ADMIN_ROLES, type AdminRole } from "@/lib/auth/admin-permissions";
import {
  anyAdminHashByTargetKey,
  isEnvironmentAdminHash,
  listAllAdminEmails,
  resolveAnyAdminRole,
  resolveAnyAdminRoleByHash,
} from "@/lib/auth/admin-allowlist";
import { addConsoleAdmin, getConsoleAdmin, removeConsoleAdmin, setConsoleAdminRole } from "@/lib/auth/console-admins";
import { issueAdminEnrolmentCode } from "@/lib/auth/admin-enrolment";
import { resetAdminMfa } from "@/lib/auth/admin-mfa-store";

/*
 * Add, re-role and remove console admins (/admin/admins).
 *
 * users:manage (SUPER_ADMIN) with a fresh authenticator proof, CSRF, and an
 * audit entry for every change. Owners from ADMIN_EMAILS/ADMIN_ROLES are
 * never changed here. Two guards keep the console reachable: nobody changes
 * or removes their own access, and the last SUPER_ADMIN cannot be demoted
 * or removed. Adding an admin returns a one-time enrolment code, once, for
 * the SUPER_ADMIN to hand over out of band (as the MFA reset does).
 */

const roleSchema = z.enum(ALL_ADMIN_ROLES as unknown as [AdminRole, ...AdminRole[]]);
const addSchema = z.object({ email: z.email().max(254), role: roleSchema }).strict();
const changeSchema = z.object({ adminKey: z.string().regex(/^[a-f0-9]{16,128}$/), role: roleSchema }).strict();
const removeSchema = z.object({ adminKey: z.string().regex(/^[a-f0-9]{16,128}$/) }).strict();

async function guard(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/admins" });
    return { response: NextResponse.json({ error: "csrf_failed" }, { status: 403 }) };
  }
  const auth = await requireAdminPermission("users:manage");
  if (!auth.ok) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const stepUp = requireStepUp(auth.session);
  if (!stepUp.ok) return { response: NextResponse.json({ error: stepUp.error }, { status: 403 }) };
  return { session: auth.session };
}

/** How many admins hold SUPER_ADMIN now, across both sources. */
async function superAdminCount(): Promise<number> {
  let count = 0;
  for (const { email } of await listAllAdminEmails()) {
    const role = await resolveAnyAdminRole(email);
    if (role.ok && role.role === "SUPER_ADMIN") count += 1;
  }
  return count;
}

function audit(actorId: string, emailHash: string, data: Record<string, unknown>) {
  return writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: `admin-${emailHash.slice(0, 24)}`,
    actorId,
    data,
  });
}

/** Add an admin and issue their one-time enrolment code. */
export async function POST(request: Request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await resolveAnyAdminRole(email);
  if (existing.ok || isEnvironmentAdminHash(hashEmail(email)) || (await getConsoleAdmin(hashEmail(email)))) {
    return NextResponse.json({ error: "already_admin" }, { status: 409 });
  }

  const row = await addConsoleAdmin(email, parsed.data.role, g.session.sub);
  const { code, expiresAt } = await issueAdminEnrolmentCode(row.emailHash, g.session.sub);
  await audit(g.session.sub, row.emailHash, { action: "ADMIN_ADDED", role: parsed.data.role, enrolmentCodeIssued: true });
  return NextResponse.json({ ok: true, enrolmentCode: code, expiresAt: expiresAt.toISOString() });
}

/** Change a console admin's role. */
export async function PATCH(request: Request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const emailHash = await anyAdminHashByTargetKey(parsed.data.adminKey);
  if (!emailHash) return NextResponse.json({ error: "not_an_admin" }, { status: 404 });
  if (isEnvironmentAdminHash(emailHash)) return NextResponse.json({ error: "owner_managed_in_environment" }, { status: 409 });
  if (emailHash === g.session.emailHash) return NextResponse.json({ error: "cannot_change_self" }, { status: 409 });

  const current = await resolveAnyAdminRoleByHash(emailHash);
  if (current.ok && current.role === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN" && (await superAdminCount()) <= 1) {
    return NextResponse.json({ error: "last_super_admin" }, { status: 409 });
  }
  await setConsoleAdminRole(emailHash, parsed.data.role);
  await audit(g.session.sub, emailHash, { action: "ADMIN_ROLE_CHANGED", from: current.ok ? current.role : null, to: parsed.data.role });
  return NextResponse.json({ ok: true });
}

/** Remove a console admin; their authenticator enrolment goes with them. */
export async function DELETE(request: Request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const emailHash = await anyAdminHashByTargetKey(parsed.data.adminKey);
  if (!emailHash) return NextResponse.json({ error: "not_an_admin" }, { status: 404 });
  if (isEnvironmentAdminHash(emailHash)) return NextResponse.json({ error: "owner_managed_in_environment" }, { status: 409 });
  if (emailHash === g.session.emailHash) return NextResponse.json({ error: "cannot_change_self" }, { status: 409 });

  const current = await resolveAnyAdminRoleByHash(emailHash);
  if (current.ok && current.role === "SUPER_ADMIN" && (await superAdminCount()) <= 1) {
    return NextResponse.json({ error: "last_super_admin" }, { status: 409 });
  }
  await removeConsoleAdmin(emailHash);
  await resetAdminMfa(emailHash);
  await audit(g.session.sub, emailHash, { action: "ADMIN_REMOVED", role: current.ok ? current.role : null });
  return NextResponse.json({ ok: true });
}
