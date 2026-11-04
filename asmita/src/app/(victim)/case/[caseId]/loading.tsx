import { AppShell } from "@/components/layout/AppShell";

export default function LoadingCaseDashboard() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section
          className="container page-hero text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">Loading</span>
            <h1 className="page-title-sm mt-8">
              Opening your case
              <br />
              <em className="not-italic text-gradient">dashboard</em>…
            </h1>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
