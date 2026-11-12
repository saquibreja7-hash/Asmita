import { requireAdminPermission } from "@/lib/auth/require-admin";
import type { AdminPermission } from "@/lib/auth/admin-permissions";

const NEEDS: Record<AdminPermission, string> = {
  "cases:read": "read cases",
  "cases:review": "review cases",
  "cases:note": "write case notes",
  "templates:edit": "edit templates",
  "templates:activate": "activate templates",
  "platforms:edit": "edit platforms",
  "metrics:read": "read metrics",
  "users:manage": "manage admins",
  "audit:read": "read the audit log",
};

/**
 * For an admin page: null when the signed-in role has the permission,
 * otherwise the message to render instead of the page. The layout has
 * already required a signed-in admin with MFA.
 */
export async function deniedFor(permission: AdminPermission): Promise<React.ReactNode | null> {
  const auth = await requireAdminPermission(permission);
  if (auth.ok) return null;
  return (
    <section>
      <p className="eyebrow">Console</p>
      <h1 className="mt-3">Not available</h1>
      <p className="muted mt-6 text-sm">Your admin role cannot {NEEDS[permission]}.</p>
    </section>
  );
}
