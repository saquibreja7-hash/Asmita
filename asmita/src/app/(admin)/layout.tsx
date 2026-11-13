import "./admin.css";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { AdminNav } from "./AdminNav";
import AdminLoginPage from "@/app/admin/login/page";
import SetupMfaPage from "@/app/admin/setup-mfa/page";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { countActionableCases } from "@/lib/admin-cases";
import { ADMIN_NAV } from "./admin-nav";

// The console is staff-only and case-bearing: never indexable.
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    // Signed in with an enrolment code but not enrolled yet: the only thing
    // this session may do is set up its authenticator, on any admin path.
    if (auth.error === "mfa_setup_required") return <SetupMfaPage />;
    return <AdminLoginPage />;
  }

  // Sessions minted before sub-roles existed are founders (require-admin.ts).
  const role = auth.session.adminRole ?? "SUPER_ADMIN";
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasAdminPermission(role, item.permission)),
  })).filter((group) => group.items.length > 0);
  const actionable = hasAdminPermission(role, "cases:read")
    ? await countActionableCases().catch(() => null)
    : null;

  return (
    // The console has its own shell: no public header, banner or footer.
    <div className="admin a-shell">
      <AdminNav actionable={actionable} groups={groups}>
        <AdminLogoutButton />
      </AdminNav>
      <main className="a-main">{children}</main>
    </div>
  );
}
