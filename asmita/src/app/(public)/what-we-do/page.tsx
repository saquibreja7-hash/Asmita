import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "What we do",
  description:
    "How Asmita works: legally grounded takedown notices, on-device fingerprint blocking, and an AI-image check, built so your image stays private.",
};

const capabilities = [
  {
    n: "01",
    title: "Legally grounded takedown notices",
    body: "We help you write a removal notice that cites the IT Rules and the MeitY procedure, and route it to the platform's grievance channel. You read it and sign it before anything is sent.",
    href: "/start",
    cta: "Start a report",
  },
  {
    n: "02",
    title: "On-device fingerprint blocking",
    body: "To block re-uploads, we use a fingerprint of the image computed on your own phone. Only a short code reaches us, never the picture itself.",
    href: "/get-help",
    cta: "How to get help",
  },
  {
    n: "03",
    title: "AI and deepfake check",
    body: "Check whether an image carries signals that it was made or edited by AI. A fake image is still abuse, and you can still report it.",
    href: "/check-image",
    cta: "Check an image",
  },
];

const flow = [
  { title: "You report", body: "Paste the links as text and tell us what happened. No image is uploaded." },
  { title: "We prepare a notice", body: "A legally grounded takedown notice, ready for you to review." },
  { title: "You sign, we route", body: "Once you sign, it goes to the right grievance channel." },
  { title: "We help block re-uploads", body: "Optionally, a fingerprint blocks matching copies on partner platforms." },
];

export default function WhatWeDoPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="What we do">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">What we do</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Tools that actually remove content
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Not just advice. Asmita is built to help you take real action, and
                built so your image never has to leave your device to do it.
              </p>
            </div>
          </div>
        </section>

        {/* CAPABILITIES */}
        <section className="zone-white section-pad" aria-label="Capabilities">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-3">
                {capabilities.map((c) => (
                  <div key={c.title} className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)]">
                    <span className="font-mono text-xs font-medium text-[var(--color-off-black)]">{c.n}</span>
                    <h2 className="mt-4 text-[19px] font-medium text-[var(--heading)]">{c.title}</h2>
                    <p className="mt-3 flex-1 text-sm leading-[1.65] text-[var(--body)]">{c.body}</p>
                    <div className="mt-6">
                      <Link href={c.href} className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                        {c.cta}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT FITS TOGETHER */}
        <section className="transform-section" aria-labelledby="flow-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">How it fits together</span>
              <h2 id="flow-heading" className="font-display mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
                From a link to a takedown
              </h2>
            </div>
            <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {flow.map((f, i) => (
                <li key={f.title} className="rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm">
                  <span className="font-display text-2xl font-medium text-[var(--color-off-black)]">{i + 1}</span>
                  <h3 className="mt-2 text-[16px] font-medium text-[var(--heading)]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-[1.6] text-[var(--body)]">{f.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* HONEST LIMITS */}
        <section className="zone-white section-pad" aria-labelledby="limits-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-8 md:p-10">
              <h2 id="limits-heading" className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]">
                What we will not do
              </h2>
              <ul className="mt-5 space-y-3 text-[16px] leading-[1.6] text-[var(--body)]">
                <li>We never fetch, preview, or store intimate content on our servers.</li>
                <li>We do not promise to erase content from the whole internet.</li>
                <li>We do not put a minor&rsquo;s image into the adult flow. That follows a separate, protected path.</li>
              </ul>
              <p className="mt-5 text-sm leading-[1.6] text-[var(--muted)]">
                Being honest about the limits is part of the tool. You always know exactly where things stand.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                See it work for your situation.
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">Get help</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/about">About Asmita</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
