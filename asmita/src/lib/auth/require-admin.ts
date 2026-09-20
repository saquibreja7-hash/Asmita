import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/auth/jwt";
import type { SessionClaims } from "@/lib/auth/jwt";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/admin-permissions";
import { getAdminMfaEnrolment } from "@/lib/auth/admin-mfa-store";
import { devFlagEnabled } from "@/lib/dev-flags";

export function isAdminRole(role: SessionClaims["role"]) {
  return role === "ADMIN";
}

export async function requireAdminSetup() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(cookieStore.get("asmita_admin_session")?.value);
  if (!session) {
    return { ok: false as const, status: 403, error: "admin_required" };
  }
  return { ok: true as const, session };
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

/**
 * Like requireAdmin, but also gates on a sub-role permission. Sessions minted
 * before the adminRole claim existed carry no sub-role; they are treated as
 * SUPER_ADMIN because every admin today is an allowlisted founder - revisit
 * before opening admin access beyond founders.
 */
export async function requireAdminPermission(permission: AdminPermission) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const adminRole = auth.session.adminRole ?? "SUPER_ADMIN";
  if (!hasAdminPermission(adminRole, permission)) {
    return { ok: false as const, status: 403, error: "permission_denied" };
  }
  return auth;
}
