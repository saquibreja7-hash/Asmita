import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const steps = [
  {
    label: "Step 01",
    title: "Confirm safety.",
    body: "Age attestation comes first. Adults continue privately. If you are under 18, Asmita does not collect URLs — it routes you to CHILDLINE 1098, TakeItDown, and cybercrime.gov.in with guided instructions.",
  },
  {
    label: "Step 02",
    title: "Paste links as text.",
    body: "Asmita reads only the domain string from each URL. It never opens, fetches, renders, or previews the content the link points to. Up to ten URLs every twenty-four hours.",
  },
  {
    label: "Step 03",
    title: "Reviewed notices go out.",
    body: "Notice templates are reviewed by Internet Freedom Foundation and SFLC.in. Platform contacts are human-verified before they enter the routing table. You approve every notice before it is sent.",
  },
  {
    label: "Step 04",
    title: "Track and escalate.",
    body: "A private dashboard shows each platform, the response window, and an audit trail. If a platform doesn’t respond within the legal window, escalation is automatic.",
  },
];

const tiers = [
  {
    label: "Tier 01",
    title: "Direct API",
    body: "For the small set of platforms that publish a verified takedown endpoint, Asmita submits the notice through the API and waits on the structured response.",
  },
  {
    label: "Tier 02",
    title: "Grievance Officer email",
    body: "For Indian intermediaries covered by IT Rules 2021, Asmita sends a templated email to the platform’s designated Grievance Officer. This is the path most notices take.",
  },
  {
    label: "Tier 03",
    title: "Guided form handoff",
    body: "When a platform has no published contact, Asmita does not guess. It prepares a step-by-step handoff so you can submit through their web form yourself, with the notice text ready to paste.",
  },
];

const timeline = [
  {
    label: "Day 01",
    title: "Notice sent.",
    body: "First notice goes out the moment you approve it. The 24-hour clock under IT Rules begins.",
  },
  {
    label: "Day 02",
    title: "First escalation.",
    body: "If there is no response within 24 hours, Asmita escalates to the next contact tier and re-sends.",
  },
  {
    label: "Day 07",
    title: "FIR package ready.",
    body: "If 7 days pass without resolution, Asmita prepares a police-ready FIR package for cybercrime.gov.in built from the same evidence trail.",
  },
];

export default function HowItWorksPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              How it works
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Four steps.
              <br />
              <em className="not-italic text-gradient">One</em> screen at a time.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Each step happens on its own page. Nothing demands more than one
              decision from you at a time.
            </p>
          </div>
        </section>

        {/* THE FLOW — four sequential quiet blocks */}
        {steps.map((step) => (
          <section
            key={step.label}
            className="container py-14 text-center md:py-20"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {step.label}
              </p>
              <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
                {step.title}
              </h2>
              <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
                {step.body}
              </p>
            </div>
          </section>
        ))}

        {/* ROUTING — three ways a notice reaches the platform */}
        <section className="container pb-8 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Three ways a notice
              <br />
              reaches the platform.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Different platforms accept notices differently. Asmita uses the
              most reliable channel that exists — and never guesses when one
              doesn&rsquo;t.
            </p>
          </div>
        </section>

        {tiers.map((tier) => (
          <section
            key={tier.label}
            className="container py-12 text-center md:py-16"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {tier.label}
              </p>
              <h3 className="font-display mt-4 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
                {tier.title}
              </h3>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                {tier.body}
              </p>
            </div>
          </section>
        ))}

        {/* ESCALATION TIMELINE — 24h → 48h → 7 days */}
        <section className="container pb-8 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              When platforms
              <br />
              don&rsquo;t respond.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              The escalation timeline is automatic. You never have to chase a
              platform manually — but you can stop the clock at any time.
            </p>
          </div>
        </section>

        {timeline.map((item) => (
          <section
            key={item.label}
            className="container py-12 text-center md:py-16"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {item.label}
              </p>
              <h3 className="font-display mt-4 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
                {item.title}
              </h3>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                {item.body}
              </p>
            </div>
          </section>
        ))}

        {/* CLOSING — invitation */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Ready to begin?
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              There is no clock running. You can start, stop, and come back.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                Start a case
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                Read the FAQ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
