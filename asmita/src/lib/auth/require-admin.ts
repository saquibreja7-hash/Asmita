import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/auth/jwt";
import type { SessionClaims } from "@/lib/auth/jwt";

export function isAdminRole(role: SessionClaims["role"]) {
  return role === "ADMIN";
}

export async function requireAdmin() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(cookieStore.get("asmita_admin_session")?.value);
  if (!session) {
    return { ok: false as const, status: 403, error: "admin_required" };
  }
  return { ok: true as const, session };
}
