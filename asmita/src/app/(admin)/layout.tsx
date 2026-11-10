import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminLogoutButton } from "./AdminLogoutButton";
import AdminLoginPage from "@/app/admin/login/page";
import SetupMfaPage from "@/app/admin/setup-mfa/page";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { countActionableCases } from "@/lib/admin-cases";
import { ADMIN_NAV } from "./admin-nav";

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

  // The role as configured now (require-admin.ts), not as signed in.
  const role = auth.session.adminRole;
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasAdminPermission(role, item.permission)),
  })).filter((group) => group.items.length > 0);
  const actionable = hasAdminPermission(role, "cases:read")
    ? await countActionableCases().catch(() => null)
    : null;

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container grid gap-10 py-10 md:grid-cols-[220px_1fr] md:py-14">
          <aside
            className="h-fit"
            aria-label="Admin navigation"
          >
            <p className="eyebrow">
              Admin
            </p>
            <nav className="mt-5 grid gap-5 text-sm leading-[1.8]">
              {groups.map((group) => (
                <div className="grid gap-2" key={group.heading ?? "home"}>
                  {group.heading && <p className="muted text-xs">{group.heading}</p>}
                  {group.items.map((item) => (
                    <Link
                      className="link-underline text-[var(--ink)]"
                      href={item.href}
                      key={item.href}
                    >
                      {item.label}
                      {item.href === "/admin" && actionable ? (
                        <span className="ml-2 rounded-full bg-[var(--ink)] px-2 text-xs text-[var(--page)] tabular-nums">
                          {actionable}
                          <span className="sr-only"> cases waiting</span>
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mt-8 border-t border-[var(--line)] pt-6">
              <AdminLogoutButton />
            </div>
          </aside>
          <div className="min-w-0 overflow-x-auto">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
