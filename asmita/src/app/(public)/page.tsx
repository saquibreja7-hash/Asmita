import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const steps = [
  ["Confirm safety", "Adults can continue to the private case flow. Minors are redirected to support resources without storing URL data."],
  ["Paste links as text", "Asmita identifies platforms from the URL string only. The app never opens or previews the content."],
  ["Generate reviewed notices", "Notices remain gated until legal review is complete and platform contacts are human verified."],
  ["Track progress", "A case dashboard shows each platform, status, audit trail, and next escalation window."],
];

const protections = [
  "No uploads",
  "No server-side URL fetching",
  "Email OTP, no passwords",
  "Encrypted personal data",
  "Minor pathway blocks adult routes",
  "Legal review flags on templates",
];

export default function HomePage() {
  return (
    <AppShell>
      <section className="bg-white py-20 md:py-28">
        <div className="container grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">
              Free, confidential, India-focused
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
              Asmita helps you act without facing this alone.
            </h1>
            <p className="muted mt-6 max-w-2xl text-lg leading-8">
              A trauma-informed flow for reporting non-consensual intimate content, preparing
              takedown notices, and tracking platform responses while protecting your privacy.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href="/start">
                Start a case
              </Link>
              <Link className="btn btn-secondary" href="/how-it-works">
                See the process
              </Link>
            </div>
          </div>
          <div className="panel p-6">
            <p className="text-sm font-bold text-[var(--teal)]">Privacy promise</p>
            <h2 className="mt-3 text-2xl font-black">URLs are text tokens only.</h2>
            <p className="muted mt-3 leading-7">
              The platform extracts a domain, matches it locally, and creates a case record. It
              never downloads, renders, proxies, or stores the actual content.
            </p>
            <div className="mt-6 grid gap-3">
              {protections.map((item) => (
                <div key={item} className="rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container">
          <h2 className="text-3xl font-black">What happens next</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {steps.map(([title, body], index) => (
              <article className="panel p-5" key={title}>
                <p className="text-sm font-black text-[var(--saffron)]">0{index + 1}</p>
                <h3 className="mt-3 font-black">{title}</h3>
                <p className="muted mt-3 text-sm leading-6">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-[var(--teal-soft)] py-16">
        <div className="container grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Support</p>
            <h2 className="mt-3 text-3xl font-black">Help stays visible everywhere.</h2>
          </div>
          <p className="muted md:col-span-2 leading-8">
            Every screen includes a persistent Support button with emergency and counselling
            contacts. The minor pathway prominently shows CHILDLINE 1098 and avoids adult case
            collection entirely.
          </p>
        </div>
      </section>
      <section className="bg-white py-16">
        <div className="container grid gap-8 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Legal basis</p>
            <h2 className="mt-3 text-3xl font-black">Draft notices stay gated until review.</h2>
            <p className="muted mt-4 leading-7">
              Phase 1 supports IT Rules and DMCA-style routing metadata, but live dispatch remains blocked until
              legal templates and platform contacts are human approved.
            </p>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Privacy</p>
            <h2 className="mt-3 text-3xl font-black">The system avoids content collection.</h2>
            <p className="muted mt-4 leading-7">
              Asmita stores routing records and evidence metadata, not intimate media. Confirmation emails use only
              case references and dashboard links.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container">
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-3xl font-black">Ready to begin?</h2>
              <p className="muted mt-3 max-w-2xl leading-7">
                Start with age attestation. Adults continue to the private flow; minors go directly to referral resources.
              </p>
            </div>
            <Link className="btn btn-primary" href="/start">
              Start safely
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
