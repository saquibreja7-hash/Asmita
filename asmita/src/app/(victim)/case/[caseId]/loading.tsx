import { AppShell } from "@/components/layout/AppShell";

export default function LoadingCaseDashboard() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section
          className="container pb-24 pt-20 text-center md:pb-32 md:pt-32"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Loading
            </span>
            <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
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
