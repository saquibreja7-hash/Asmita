import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/auth/jwt";
import type { SessionClaims } from "@/lib/auth/jwt";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/admin-permissions";
import { resolveAdminRoleByHash } from "@/lib/auth/admin-allowlist";
import { getAdminMfaEnrolment } from "@/lib/auth/admin-mfa-store";
import { devFlagEnabled } from "@/lib/dev-flags";
import { logSecurityEvent } from "@/lib/security-log";

export function isAdminRole(role: SessionClaims["role"]) {
  return role === "ADMIN";
}

/**
 * Verifies the admin session, then authorizes it against ADMIN_EMAILS and
 * ADMIN_ROLES as configured now, not the role frozen in the token: a removed
 * admin is refused and a role change applies on the next request. The
 * returned session carries the current role.
 */
export async function requireAdminSetup() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(cookieStore.get("asmita_admin_session")?.value);
  if (!session) {
    return { ok: false as const, status: 403, error: "admin_required" };
  }
  // Every session issued since sub-roles exist carries one; a token without
  // it was not minted by this app's sign-in and gets nothing.
  const current = session.adminRole
    ? resolveAdminRoleByHash(session.emailHash)
    : { ok: false as const, reason: "session_role_missing" };
  if (!current.ok) {
    await logSecurityEvent({ event: "admin_denied", actorHash: session.emailHash || undefined, reason: current.reason });
    return { ok: false as const, status: 403, error: "admin_required" };
  }
  return { ok: true as const, session: { ...session, adminRole: current.role } };
}

export async function requireAdmin() {
  const auth = await requireAdminSetup();
  if (!auth.ok) return auth;
  if (auth.session.mfaComplete !== true) {
    return { ok: false as const, status: 403, error: "mfa_setup_required" };
  }
  // A reset must revoke already-issued full admin sessions immediately.
  if (!devFlagEnabled("DEV_SKIP_ADMIN_MFA") &&
      !(await getAdminMfaEnrolment(auth.session.emailHash))) {
    return { ok: false as const, status: 403, error: "mfa_setup_required" };
  }
  return auth;
}

/** Like requireAdmin, but also gates on a sub-role permission of the current role. */
export async function requireAdminPermission(permission: AdminPermission) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!hasAdminPermission(auth.session.adminRole, permission)) {
    return { ok: false as const, status: 403, error: "permission_denied" };
  }
  return auth;
}
