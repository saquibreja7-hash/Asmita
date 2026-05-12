import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireAdmin } from "@/lib/auth/require-admin";

const adminLinks = [
  ["/admin/cases", "Cases"],
  ["/admin/queue", "Flagged"],
  ["/admin/platforms", "Platforms"],
  ["/admin/templates", "Templates"],
  ["/admin/metrics", "Response rates"],
  ["/admin/audit", "Audit"],
  ["/milestones", "Milestones"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return (
      <AppShell>
        <main className="container py-12">
          <section className="panel max-w-2xl p-6">
            <p className="text-sm font-bold uppercase text-[var(--muted)]">Admin access</p>
            <h1 className="mt-3 text-3xl font-black">Restricted workspace</h1>
            <p className="mt-3 text-[var(--muted)]">
              This area is available only to verified Asmita administrators.
            </p>
            <Link className="btn btn-primary mt-6" href="/">
              Return home
            </Link>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container grid gap-6 py-10 md:grid-cols-[220px_1fr]">
        <aside className="panel h-fit p-4">
          <p className="mb-4 font-black">Admin</p>
          <nav className="grid gap-2 text-sm font-bold text-[var(--muted)]">
            {adminLinks.map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
