import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminLogoutButton } from "./AdminLogoutButton";

const adminLinks: Array<[string, string]> = [
  ["/admin/cases", "Cases"],
  ["/admin/queue", "Flagged"],
  ["/admin/hashes", "Hash queue"],
  ["/admin/platforms", "Platforms"],
  ["/admin/templates", "Templates"],
  ["/admin/metrics", "Response rates"],
  ["/admin/analytics", "Analytics"],
  ["/admin/milestones", "Milestones"],
  ["/admin/audit", "Audit"],
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    redirect("/admin/login");
  }

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container grid gap-10 py-10 md:grid-cols-[220px_1fr] md:py-14">
          <aside
            className="h-fit"
            aria-label="Admin navigation"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Admin
            </p>
            <nav className="mt-5 grid gap-2 text-sm leading-[1.8]">
              {adminLinks.map(([href, label]) => (
                <Link
                  className="link-underline text-[var(--foreground)]"
                  href={href}
                  key={href}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 border-t border-[var(--hairline)] pt-6">
              <AdminLogoutButton />
            </div>
          </aside>
          <div className="min-w-0 overflow-x-auto">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
