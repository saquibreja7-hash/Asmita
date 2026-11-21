import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { PartnerForm } from "./PartnerForm";
import { icons, type IconName } from "./icons";

// Written for platform Trust & Safety and grievance teams. English only, like
// the other pages addressed to professionals (see hi-review-status.json).
// Legal references come only from PRD Section 4 (CLAUDE.md).
// Accents use the logo's flame orange (.pf-* classes in globals.css); no
// coloured left-border stripes anywhere (owner rule).

export const metadata: Metadata = {
  title: "For platforms",
  description:
    "Join Asmita's partner programme: verified takedown notices, image fingerprints from survivors' cases, and crawler alerts for intimate images shared without consent.",
};

const laws: { icon: IconName; figure: string; body: string }[] = [
  {
    icon: "clock",
    figure: "24 hours",
    body: "Rule 3(2)(b) of the IT Rules, 2021 requires intermediaries to act on a complaint about non-consensual intimate content within 24 hours.",
  },
  {
    icon: "timer",
    figure: "2 hours",
    body: "The IT Rules Amendment of 2026 shortens that to two hours for non-consensual nudity.",
  },
  {
    icon: "shield",
    figure: "Stay down",
    body: "MeitY's Standard Operating Procedure of November 2025 sets out how intermediaries handle these complaints, including stopping the same content from returning.",
  },
];

const offers: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "fingerprint",
    title: "Fingerprint alerts",
    body: "When a survivor reports an image and agrees to share it, we send you its fingerprint: a PDQ hash, the open standard many platforms already match against. Use it to find copies and stop them coming back.",
  },
  {
    icon: "radar",
    title: "Crawler monitoring",
    body: "With your written permission, Asmita's crawler checks the public pages of your service for fingerprints from survivors' cases and alerts you to any match, within the limits we agree with you.",
  },
  {
    icon: "inbox",
    title: "One takedown channel",
    body: "Notices reach one agreed inbox or endpoint in a consistent format: the reported link, the legal basis, the survivor's signed declaration and a case reference. Reply there and the survivor sees it.",
  },
  {
    icon: "recheck",
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

function Chip({ icon, tone = "flame" }: { icon: IconName; tone?: "flame" | "teal" }) {
  return <span className={`pf-chip pf-chip-${tone}`}>{icons[icon]}</span>;
}

function SectionHead({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id} className="section-title mt-4">
        {title}
      </h2>
      <span aria-hidden="true" className="pf-rule mx-auto mt-5" />
    </div>
  );
}

export default function ForPlatformsPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO (unchanged by design) */}
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

        {/* WHY NOW: warm band, three law cards */}
        <section className="pf-warm section-pad" aria-labelledby="why-heading">
          <div className="container">
            <SectionHead eyebrow="Why it matters now" title="The law expects fast action, and survivors need it." id="why-heading" />
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
              {laws.map((law) => (
                <div key={law.figure} className="pf-card p-7">
                  <Chip icon={law.icon} />
                  <p className="pf-figure mt-5">{law.figure}</p>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{law.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHAT YOU GET: illustration beside four offer cards */}
        <section className="section-pad" aria-labelledby="offer-heading">
          <div className="container">
            <SectionHead eyebrow="What partners get" title="Four ways we work with you" id="offer-heading" />
            <div className="mx-auto mt-12 grid max-w-5xl auto-rows-fr gap-5 md:grid-cols-2">
              {offers.map((offer, i) => (
                <div key={offer.title} className="pf-card pf-offer flex flex-col p-7 md:p-8">
                  <span aria-hidden="true" className="pf-offer-n">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Chip icon={offer.icon} />
                  <h3 className="mt-5 text-[20px] font-medium leading-[1.3] text-[var(--ink)]">{offer.title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-[var(--text)]">{offer.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS: a joined-up timeline */}
        <section className="pf-mist section-pad scroll-mt-20" aria-labelledby="how-heading" id="how">
          <div className="container">
            <SectionHead eyebrow="How it works" title="From sign-up to your first alert" id="how-heading" />
            <ol className="pf-steps mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-4 lg:gap-6">
              {steps.map((step, i) => (
                <li key={step.title} className="pf-step">
                  <span className="pf-step-dot">{i + 1}</span>
                  <div>
                    <h3 className="text-[17px] font-medium text-[var(--ink)]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-[1.6] text-[var(--text)]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* WHAT WE SHARE: illustration beside the two lists, then the asks */}
        <section className="section-pad" aria-labelledby="share-heading">
          <div className="container">
            <SectionHead eyebrow="Privacy by design" title="What we share with you, and what we never share" id="share-heading" />
            <div className="pf-split mx-auto mt-12 grid max-w-5xl md:grid-cols-2">
              <div className="pf-split-half p-7 md:p-9">
                <div className="flex items-center gap-3">
                  <Chip icon="check" tone="teal" />
                  <h3 className="subsection-title">We share</h3>
                </div>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.6] text-[var(--text)]">
                  {shared.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="pf-tick pf-tick-teal">{icons.check}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pf-split-half pf-split-never p-7 md:p-9">
                <div className="flex items-center gap-3">
                  <Chip icon="lock" />
                  <h3 className="subsection-title">We never share</h3>
                </div>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.6] text-[var(--text)]">
                  {neverShared.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="pf-tick pf-tick-flame">{icons.lock}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pf-asks mx-auto mt-6 max-w-5xl p-7 md:p-9">
              <h3 className="subsection-title">What we ask of partners</h3>
              <ul className="mt-5 grid gap-x-10 gap-y-3 text-[15px] leading-[1.6] text-[var(--text)] md:grid-cols-2">
                {asks.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="pf-tick pf-tick-flame">{icons.check}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* THE FORM, on a warm band */}
        <section className="pf-warm section-pad scroll-mt-20" id="register" aria-labelledby="register-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <span className="eyebrow">Join the programme</span>
                <h2 id="register-heading" className="section-title mt-4">
                  Tell us about your platform
                </h2>
                <span aria-hidden="true" className="pf-rule mx-auto mt-5" />
                <p className="muted mx-auto mt-5 max-w-xl text-base leading-[1.7]">
                  We will write back to confirm who you are and agree the details. Nothing is shared with your platform before that.
                </p>
              </div>
              <PartnerForm />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section-pad" aria-labelledby="faq-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <span className="eyebrow mb-3 block">Questions</span>
              <h2 id="faq-heading" className="section-title">
                What platforms usually ask
              </h2>
              <div className="pf-faq mt-8 border-t border-[var(--line)]">
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

        {/* CONTACT, with the envelope */}
        <section className="zone-sunset" aria-labelledby="contact-heading">
          <div className="zone-sunset-content container section-pad">
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <h2 id="contact-heading" className="section-title">
                  Prefer to talk first?
                </h2>
                <span aria-hidden="true" className="pf-rule mx-auto mt-5" />
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
          </div>
        </section>
      </div>
    </AppShell>
  );
}
