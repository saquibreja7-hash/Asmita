import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { PartnerForm } from "./PartnerForm";

// Written for platform Trust & Safety and grievance teams. English only, like
// the other pages addressed to professionals (see hi-review-status.json).
// Legal references come only from PRD Section 4 (CLAUDE.md).

export const metadata: Metadata = {
  title: "For platforms",
  description:
    "Join Asmita's partner programme: verified takedown notices, image fingerprints from survivors' cases, and crawler alerts for intimate images shared without consent.",
};

const offers = [
  {
    n: "01",
    title: "Fingerprint alerts",
    body: "When a survivor reports an image and agrees to share it, we send you its fingerprint: a PDQ hash, the open standard many platforms already match against. Use it to find copies and stop them coming back.",
  },
  {
    n: "02",
    title: "Crawler monitoring",
    body: "With your written permission, Asmita's crawler checks the public pages of your service for fingerprints from survivors' cases and alerts you to any match, within the limits we agree with you.",
  },
  {
    n: "03",
    title: "One takedown channel",
    body: "Notices reach one agreed inbox or endpoint in a consistent format: the reported link, the legal basis, the survivor's signed declaration and a case reference. Reply there and the survivor sees it.",
  },
  {
    n: "04",
    title: "Checks that content stays down",
    body: "After you remove something, we look at the reported link again over the following days and tell you if it comes back.",
  },
];

const steps = [
  { title: "Register", body: "Fill in the form below. It takes about three minutes." },
  { title: "We verify you", body: "We confirm that you speak for the platform and check your grievance contact." },
  { title: "Agree the details", body: "Which services are covered, how alerts reach you (email or API), crawl limits and a security contact." },
  { title: "Go live", body: "You receive notices and fingerprints, act within the legal timelines and tell us the outcome." },
];

const shared = [
  "The fingerprint (PDQ hash) of a reported image, only when the survivor agreed",
  "The link or links on your platform that were reported",
  "A case reference to quote in every reply",
  "For takedown notices: the legal basis and the survivor's signed declaration",
];

const neverShared = [
  "The image or video itself. Fingerprints are made on the survivor's device; we never hold the picture",
  "Fingerprints from survivors who did not agree to share them",
  "Anything about the survivor beyond what a notice they signed contains",
];

const asks = [
  "Act on notices within the legal timelines and tell us the outcome",
  "Use fingerprints only to find and remove reported content and block re-uploads, never to identify or profile anyone",
  "Keep fingerprints secure, and delete them when we withdraw them",
  "Have a person review fingerprint matches before acting on them",
  "Name a Trust & Safety contact and a security contact",
];

const faqs = [
  {
    q: "Does it cost anything?",
    a: "No. The partner programme is free for platforms.",
  },
  {
    q: "Is Asmita a government body?",
    a: "No. Asmita is an independent platform that helps survivors in India act against intimate images shared without their consent. It is not affiliated with any government body.",
  },
  {
    q: "Does this replace our duties under the IT Rules or our reporting to government channels?",
    a: "No. Your legal duties stay the same, and so does any reporting you do through government channels such as the National Cybercrime Reporting Portal (cybercrime.gov.in, 1930) and I4C. The programme adds survivor reports that arrive verified and ready to act on.",
  },
  {
    q: "Which fingerprint formats do you use?",
    a: "PDQ for images. It is the open-source perceptual hash published by Meta, which many platforms already run, for example through Hasher-Matcher-Actioner. Fingerprints for video (vPDQ) are being added.",
  },
  {
    q: "What if a fingerprint matches something that is not abuse?",
    a: "Perceptual hashes find images that look alike, so a person should review a match before acting on it. Tell us about any false match and we will review the fingerprint and withdraw it if needed.",
  },
  {
    q: "Can small or new platforms join?",
    a: "Yes. Any service that people in India can reach can join, whatever its size. The duty to act on these complaints applies to every intermediary.",
  },
];

export default function ForPlatformsPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label="For platforms">
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">For platforms</span>
              <h1 className="page-title mt-5">Help survivors faster. Keep abuse off your platform.</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                Asmita receives reports from survivors across India about intimate images shared without their consent. Partner platforms get
                those reports through one agreed channel, with fingerprints they can match, so content comes down quickly and stays down.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a className="btn btn-primary btn-arrow !m-0" href="#register">Become a partner</a>
                <a className="btn btn-secondary !m-0" href="#how">How it works</a>
              </div>
              <p className="muted mt-6 text-sm">The partner programme is opening now. We bring platforms on one at a time.</p>
            </div>
            <Illustration name="page-what-we-do" eager className="page-hero-art" />
          </div>
        </section>

        {/* WHY NOW */}
        <section className="zone-white section-pad" aria-labelledby="why-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Why it matters now</span>
              <h2 id="why-heading" className="section-title mt-4">The law expects fast action, and survivors need it.</h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
              <div className="rounded-[var(--radius-box)] surface-card p-6">
                <p className="font-display text-[34px] leading-none text-[var(--ink)]">24 hours</p>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">
                  Rule 3(2)(b) of the IT Rules, 2021 requires intermediaries to act on a complaint about non-consensual intimate content within 24
                  hours.
                </p>
              </div>
              <div className="rounded-[var(--radius-box)] surface-card p-6">
                <p className="font-display text-[34px] leading-none text-[var(--ink)]">2 hours</p>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">
                  The IT Rules Amendment of 2026 shortens that to two hours for non-consensual nudity.
                </p>
              </div>
              <div className="rounded-[var(--radius-box)] surface-card p-6">
                <p className="font-display text-[34px] leading-none text-[var(--ink)]">Stay down</p>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">
                  MeitY&apos;s Standard Operating Procedure of November 2025 sets out how intermediaries handle these complaints, including stopping
                  the same content from returning.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WHAT YOU GET */}
        <section className="section-pad" aria-labelledby="offer-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">What partners get</span>
              <h2 id="offer-heading" className="section-title mt-4">Four ways we work with you</h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2">
              {offers.map((offer) => (
                <div
                  key={offer.title}
                  className="flex flex-col rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-7 shadow-[var(--shadow-sm)]"
                >
                  <span className="text-xs font-medium text-[var(--ink)]">{offer.n}</span>
                  <h3 className="subsection-title mt-4">{offer.title}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{offer.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="transform-section" aria-labelledby="how-heading" id="how">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">How it works</span>
              <h2 id="how-heading" className="section-title mt-4">From sign-up to your first alert</h2>
            </div>
            <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-[var(--radius-box)] surface-card p-6">
                  <span className="step-badge">{i + 1}</span>
                  <h3 className="mt-2 text-[16px] font-medium text-[var(--ink)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-[1.6] text-[var(--text)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* WHAT WE SHARE */}
        <section className="zone-white section-pad" aria-labelledby="share-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Privacy by design</span>
              <h2 id="share-heading" className="section-title mt-4">What we share with you, and what we never share</h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-2">
              <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-7 md:p-8">
                <h3 className="subsection-title">We share</h3>
                <ul className="mt-5 space-y-3 text-[15px] leading-[1.6] text-[var(--text)]">
                  {shared.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-7 md:p-8">
                <h3 className="subsection-title">We never share</h3>
                <ul className="mt-5 space-y-3 text-[15px] leading-[1.6] text-[var(--text)]">
                  {neverShared.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mx-auto mt-4 max-w-5xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-7 md:p-8">
              <h3 className="subsection-title">What we ask of partners</h3>
              <ul className="mt-5 grid gap-x-8 gap-y-3 text-[15px] leading-[1.6] text-[var(--text)] md:grid-cols-2">
                {asks.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* THE FORM */}
        <section className="section-pad scroll-mt-20" id="register" aria-labelledby="register-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <span className="eyebrow">Join the programme</span>
                <h2 id="register-heading" className="section-title mt-4">Tell us about your platform</h2>
                <p className="muted mx-auto mt-5 max-w-xl text-base leading-[1.7]">
                  We will write back to confirm who you are and agree the details. Nothing is shared with your platform before that.
                </p>
              </div>
              <PartnerForm />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="zone-white section-pad" aria-labelledby="faq-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <span className="eyebrow mb-3 block">Questions</span>
              <h2 id="faq-heading" className="section-title">What platforms usually ask</h2>
              <div className="mt-8 border-t border-[var(--line)]">
                {faqs.map((faq) => (
                  <details key={faq.q} className="faq-item">
                    <summary>{faq.q}</summary>
                    <div className="faq-answer">{faq.a}</div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section className="zone-sunset" aria-label="Contact">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">Prefer to talk first?</h2>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
                Write to us and tell us a little about your platform. We are happy to walk your Trust &amp; Safety team through how it works.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a className="btn btn-primary btn-arrow !m-0" href="mailto:hello@meriasmita.org?subject=Platform%20partner%20programme">
                  hello@meriasmita.org
                </a>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/what-we-do">
                  What Asmita does
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
