import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Asmita is an independent, tech-led response platform against image-based abuse in India, built by JAMSAQ Studio.",
};

const principles = [
  {
    title: "Privacy by architecture",
    body: "We built Asmita so your image does not have to leave your device. Fingerprints are computed on your phone; only a short code reaches us. Links are handled as text, never fetched.",
  },
  {
    title: "Honest about limits",
    body: "We say exactly what a takedown can and cannot do, before you act. We do not promise to erase content from the whole internet, because no one honestly can.",
  },
  {
    title: "You stay in control",
    body: "You review and sign every notice. You decide what happens next. Nothing goes out in your name without you seeing it first.",
  },
];

export default function AboutPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="About Asmita">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">About</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                A response platform, not a bystander
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Asmita helps people in India facing non-consensual or AI-made
                intimate images take back control, by removing content, blocking
                re-uploads, and connecting them to the right help.
              </p>
            </div>
          </div>
        </section>

        {/* WHO WE ARE / NOT */}
        <section className="zone-white section-pad" aria-labelledby="who-heading">
          <div className="container">
            <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 id="who-heading" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  Who we are
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  Asmita is a technology-led platform that fights image-based abuse
                  with working tools and plain-language knowledge. We are built by
                  JAMSAQ Studio and run independently.
                </p>
              </div>
              <div>
                <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  What we are not
                </h2>
                <ul className="mt-5 space-y-2 text-[16px] leading-[1.7] text-[var(--body)]">
                  <li>Not a government body. We route you to official channels, but we are independent of them.</li>
                  <li>Not a charity asking for donations.</li>
                  <li>Not a place your image is ever uploaded, stored, or seen.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section className="transform-section" aria-labelledby="principles-heading">
          <div className="transform-content container section-pad">
            <h2 id="principles-heading" className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
              What guides the work
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {principles.map((p) => (
                <div key={p.title} className="rounded-[var(--radius-lg)] bg-white/80 p-7 backdrop-blur-sm">
                  <h3 className="text-[18px] font-semibold text-[var(--heading)]">{p.title}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--body)]">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TEAM + PARTNERS (honest, no invented names) */}
        <section className="zone-white section-pad" aria-labelledby="team-heading">
          <div className="container">
            <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 id="team-heading" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  Who is behind Asmita
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  Asmita is built and run by JAMSAQ Studio, a small team building
                  practical tools for real problems. We work with legal and support
                  partners as the platform grows.
                </p>
                {/* TODO: add real team bios here once confirmed. Do not invent names. */}
              </div>
              <div>
                <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  Partners and infrastructure
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  Asmita runs on infrastructure supported by the Cloudflare for
                  Startups program. Our takedown work is grounded in the IT Rules
                  and the MeitY procedure for non-consensual intimate imagery.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Here to help you act.
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">Get help</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/what-we-do">What we do</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
