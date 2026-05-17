import { AppShell } from "@/components/layout/AppShell";

export default function OfflinePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section
          className="container pb-24 pt-24 text-center md:pb-32 md:pt-40"
          role="alert"
          aria-live="polite"
        >
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Offline
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              You appear to be{" "}
              <em className="not-italic text-gradient">offline</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Please check your connection and try again. Any draft form data
              should still be in this tab - avoid refreshing while you are
              offline.
            </p>
            <p className="font-mono mt-10 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Nothing has been lost · Reconnect to continue
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
