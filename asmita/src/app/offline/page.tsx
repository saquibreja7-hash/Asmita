import { AppShell } from "@/components/layout/AppShell";

export default function OfflinePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section
          className="container page-hero text-center"
          role="alert"
          aria-live="polite"
        >
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">Offline</span>
            <h1 className="page-title mt-8">
              You appear to be{" "}
              <em className="not-italic text-gradient">offline</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Please check your connection and try again. Any draft form data
              should still be in this tab - avoid refreshing while you are
              offline.
            </p>
            <p className="eyebrow mt-10">
              Nothing has been lost · Reconnect to continue
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
