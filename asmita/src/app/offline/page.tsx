import { AppShell } from "@/components/layout/AppShell";

export default function OfflinePage() {
  return (
    <AppShell>
      <section className="container py-16">
        <div className="panel max-w-2xl p-6" role="alert">
          <p className="text-sm font-bold uppercase text-[var(--muted)]">Network issue</p>
          <h1 className="mt-3 text-3xl font-black">Please check your connection and try again.</h1>
          <p className="muted mt-3 leading-7">
            Draft form data should stay in this browser tab. Avoid refreshing while you are offline.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
