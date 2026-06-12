import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireAdmin } from "@/lib/auth/require-admin";

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
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                Admin access · restricted
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                Restricted{" "}
                <em className="not-italic text-gradient">workspace</em>.
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                This area is available only to verified Asmita administrators.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/">
                  Return home
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
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
          </aside>
          <div>{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
