import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { TalkToUs } from "./TalkToUs";

/*
 * Talk to the 24/7 helpline assistant from the browser. This is the only page
 * whose CSP allows Sarvam's WebSocket and whose Permissions-Policy allows the
 * microphone (next.config.ts). English only; Hindi waits for a native speaker.
 */

export const metadata: Metadata = {
  title: "Talk to us",
  description: "Talk to Asmita's 24/7 AI helpline assistant from your browser, in any Indian language.",
};

export default function TalkPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-24 pt-20 md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              24/7 helpline
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[60px] md:leading-[1.06]">
              Talk to us
            </h1>
            <p className="muted mt-6 max-w-lg text-base leading-[1.7] md:text-lg">
              Talk to our AI assistant from this page, without dialling. It listens, explains what Asmita can do, and
              guides you step by step through filing your complaint.
            </p>
            <div className="mt-10">
              <TalkToUs />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
