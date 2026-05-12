import { AppShell } from "@/components/layout/AppShell";

export default function LoadingCaseDashboard() {
  return (
    <AppShell>
      <section className="container py-16">
        <div className="panel max-w-2xl p-6" role="status">
          <p className="text-sm font-bold uppercase text-[var(--muted)]">Loading</p>
          <h1 className="mt-3 text-3xl font-black">Opening your case dashboard...</h1>
        </div>
      </section>
    </AppShell>
  );
}
