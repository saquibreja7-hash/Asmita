import { Illustration } from "@/components/Illustration";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { STATUS_URL } from "@/components/layout/Footer";
import { HELPLINE } from "@/lib/helpline";

const channels = [
  {
    title: "General questions",
    body: "Not sure where to write? Start here. We read every message and route it to the right person. Reply usually within 48 hours, in English or Hindi.",
    email: "hello@meriasmita.org",
  },
  {
    title: "Privacy grievance",
    body: "For anything covered by the privacy policy: access, correction, deletion, or a complaint about how we have handled your data. The named Grievance Officer reads every message at this address.",
    email: "grievance@meriasmita.org",
  },
  {
    title: "NGO partnership",
    body: "For survivor-support organisations that want to vouch for a survivor, or to coordinate template review and case escalations.",
    email: "partners@meriasmita.org",
  },
  {
    title: "Security disclosure",
    body: "For vulnerability reports or abuse signals. We acknowledge within 72 hours. PGP key available on request.",
    email: "security@meriasmita.org",
  },
  {
    title: "Press and research",
    body: "For journalists, academic researchers, and policy organisations. We share aggregate, anonymised data only.",
    email: "press@meriasmita.org",
  },
];

export default function ContactPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">Contact</span>
            <h1 className="page-title mt-8">
              Reach the{" "}
              <em className="not-italic text-gradient">Asmita</em> team.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Pick the inbox that matches what you need. If you are not sure, use the first one.
            </p>
            <p className="mx-auto mt-5 max-w-lg text-base leading-[1.7] md:text-lg">
              To talk now, call our 24/7 helpline{" "}
              <a href={`tel:${HELPLINE.tel}`} className="link-underline font-medium text-[var(--ink)]">
                {HELPLINE.display}
              </a>
              . An AI assistant helps you file a complaint step by step, in any Indian language.
            </p>
            <div className="mt-6 flex justify-center">
              {/* A full page load, not <Link>: /talk's own headers allow the microphone. */}
              <a className="btn btn-secondary" href="/talk">
                Talk to us from your browser
              </a>
            </div>
          </div>
          <Illustration name="page-contact" eager className="page-hero-art" />
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* WARNING */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-6 py-5" style={{ boxShadow: "var(--shadow-soft)" }}>
              <p className="text-base leading-[1.75] text-[var(--ink)]">
                <span className="font-medium">Please do not email intimate images or videos.</span>{" "}
                <span className="text-[var(--text-muted)]">Asmita only ever needs links as text, never the content itself.</span>
              </p>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CHANNELS */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-8 block">Write to us</span>
            <div className="divide-y divide-[var(--line)]">
              {channels.map((c) => (
                <div key={c.email} className="flex flex-col gap-3 py-8 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-12">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--ink)] text-base md:text-[17px]">{c.title}</p>
                    <p className="muted mt-2 text-sm leading-[1.75] max-w-md">{c.body}</p>
                  </div>
                  <a
                    href={`mailto:${c.email}`}
                    className="shrink-0 text-sm font-medium text-[var(--brand-strong)] underline decoration-[var(--brand-strong)]/30 underline-offset-4 transition-colors hover:decoration-[var(--brand-strong)] md:text-base"
                  >
                    {c.email}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* RESPONSE TIMES */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-8 block">Response times</span>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Privacy grievances", time: "72 h acknowledgement", detail: "Resolved or escalated within 14 days, per the DPDP Act." },
                { label: "Security disclosures", time: "72 h acknowledgement", detail: "We triage every report regardless of severity." },
                { label: "Everything else", time: "48 h on working days", detail: "English or Hindi, whichever is easier for you." },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <p className="font-medium text-[var(--ink)] text-sm">{row.label}</p>
                  <p className="mt-3 text-[22px] font-normal leading-[1.2] tracking-tight text-[var(--brand-strong)]">{row.time}</p>
                  <p className="muted mt-3 text-sm leading-[1.7]">{row.detail}</p>
                </div>
              ))}
            </div>
            <p className="muted mt-8 text-sm leading-[1.7]">
              Asmita is not an emergency service. If you are in immediate danger, call{" "}
              <a href="tel:112" className="link-underline text-[var(--ink)]">112</a>.
            </p>
            <p className="muted mt-3 text-sm leading-[1.7]">
              Site not loading, or a page failing? Check{" "}
              <a href={STATUS_URL} className="link-underline text-[var(--ink)]">status.meriasmita.org</a>{" "}
              to see whether we already know about it.
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="section-title">
              We will write back.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Every message reaches a person. We answer in English or Hindi, whichever is easier for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">Start a case</Link>
              <Link className="btn btn-secondary" href="/faq">Read the FAQ</Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
