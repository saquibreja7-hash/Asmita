import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { ESCALATION_HOURS } from "@/lib/escalation-engine";
import { icons, type IconName } from "../icons";

// Trusted-flagger page (docs/org/spec.md, WP57), for platform Trust & Safety
// and grievance teams. English only, like /for-platforms (hi-review-status
// lists it). Every statement here describes what the code and templates
// actually do (notice-dispatch.ts, escalation-engine.ts, case-hash-annex.ts,
// hash-dispatch.ts, template-seeds.ts); the timings are read from the
// constants so this page can never drift from them.

export const metadata: Metadata = {
  title: "Notices from Meri Asmita",
  description:
    "What a takedown notice from Meri Asmita contains, what we check before sending, the deadlines it sets, and how to reach us about one.",
};

// The deadline sentences, built from the constants the engine uses. A test
// asserts these still match the constants, so the page cannot drift.
export const PLATFORM_DEADLINE_TEXT = `The notice asks the platform to remove the content within ${PLATFORM_DEADLINE_HOURS} hours of receiving it.`;
export const PLATFORM_FOLLOW_UP_TEXT = `If there is no answer, one automated follow-up is sent ${ESCALATION_HOURS[1]} hours after the notice.`;

const formation = [
  {
    title: "A survivor reports the link",
    body: "She files a case on this website, verifies her email address, and reports the link on your service. The notice is issued by Meri Asmita on her behalf.",
  },
  {
    title: "She reviews and signs it",
    body: "She sees the complaint text before anything is sent and signs a digital declaration. The signed PDF is what we send: nothing leaves without her signature.",
  },
  {
    title: "You receive one email",
    body: "The email body carries the complaint text, and the signed PDF is attached as notice.pdf — the same content in both. It is sent once; retries never send twice.",
  },
  {
    title: "A fingerprint annex, when there is one",
    body: "If she also fingerprinted images (PDQ, or vPDQ for video) and those fingerprints are approved, the signed notice lists exactly those fingerprints in an annex. Nothing added after she signed is ever sent.",
  },
];

const checks = [
  {
    icon: "inbox" as IconName,
    title: "A verified contact",
    body: "Notices go only to a grievance email address that a human on our side has verified — never to an address we found and never checked.",
  },
  {
    icon: "check" as IconName,
    title: "A reviewed template",
    body: "The complaint text comes from a template that has been legally reviewed. If the template changes after she signed, the notice is held, not sent.",
  },
  {
    icon: "lock" as IconName,
    title: "Her signature, first",
    body: "Dispatch is refused without the signed notice PDF, and refused again if a fingerprint she signed is not approved. The email always matches the PDF she saw.",
  },
  {
    icon: "timer" as IconName,
    title: "Sent once",
    body: "Every notice and follow-up carries an idempotency key. A resend after a failure never results in two identical emails to your inbox.",
  },
];

const reach = [
  "Reply to the notice email. The sign-off address is Notice@meriasmita.org, and replies about a case are answered.",
  "Quote the case reference (format: MA-…) in every reply, so we can find the case without asking the survivor for anything.",
  "Requests for more information about the complaint are passed to the survivor only if they are addressed to Notice@meriasmita.org and quote the case reference. The complainant is not named in the notice.",
  "Tell us the outcome — actioned, refused, or acknowledged — and she sees the answer on her case page.",
];

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

export default function TrustedFlaggerPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Notices from Meri Asmita">
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">For platforms</span>
              <h1 className="page-title mt-5">What a notice from Meri Asmita contains</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                Notices from this service are survivor-signed complaints about non-consensual intimate imagery. This
                page tells trust and safety teams exactly what arrives in your inbox, what we checked before sending
                it, and how to reach us about one.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a className="btn btn-primary btn-arrow !m-0" href="#deadlines">
                  Deadlines
                </a>
                <Link className="btn btn-secondary !m-0" href="#reach">
                  Reach us
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="pf-warm section-pad" aria-labelledby="formed-heading">
          <div className="container">
            <SectionHead eyebrow="How a notice is formed" title="From her report to your inbox" id="formed-heading" />
            <ol className="pf-steps mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-4 lg:gap-6">
              {formation.map((step, i) => (
                <li className="pf-step" key={step.title}>
                  <span className="pf-step-dot">{i + 1}</span>
                  <div>
                    <h3 className="text-[17px] font-medium text-[var(--ink)]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-[1.6] text-[var(--text)]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="muted mx-auto mt-10 max-w-3xl text-center text-sm leading-[1.7]">
              Some platforms have no verified grievance email. For those, the survivor is directed to your own
              reporting form with the notice text to paste in, fingerprints included — the same complaint, filed where
              your process expects it.
            </p>
          </div>
        </section>

        <section className="section-pad" aria-labelledby="contents-heading">
          <div className="container">
            <SectionHead eyebrow="What arrives" title="What the notice contains — and what it never contains" id="contents-heading" />
            <div className="pf-split mx-auto mt-12 grid max-w-5xl md:grid-cols-2">
              <div className="pf-split-half p-7 md:p-9">
                <div className="flex items-center gap-3">
                  <span className="pf-chip pf-chip-teal">{icons.check}</span>
                  <h3 className="subsection-title">Each notice carries</h3>
                </div>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.6] text-[var(--text)]">
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-teal">{icons.check}</span>
                    <span>The case reference and her declaration reference</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-teal">{icons.check}</span>
                    <span>The reported link on your service</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-teal">{icons.check}</span>
                    <span>
                      The complaint the survivor signed, which asks for removal under Rule 3(2)(b) of the IT Rules,
                      2021 as amended in 2026 — the rule the notice itself cites
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-teal">{icons.check}</span>
                    <span>The fingerprint annex, when the case has approved fingerprints</span>
                  </li>
                </ul>
              </div>
              <div className="pf-split-half pf-split-never p-7 md:p-9">
                <div className="flex items-center gap-3">
                  <span className="pf-chip">{icons.lock}</span>
                  <h3 className="subsection-title">Never in a notice</h3>
                </div>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.6] text-[var(--text)]">
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-flame">{icons.lock}</span>
                    <span>The survivor&apos;s name. She is not named, and we hold nothing to hand over but her signed declaration</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-flame">{icons.lock}</span>
                    <span>The content itself. Meri Asmita never retrieves, views or stores it</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="pf-tick pf-tick-flame">{icons.lock}</span>
                    <span>Fingerprints the survivor did not sign, or that are not approved</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="pf-mist section-pad" aria-labelledby="checks-heading">
          <div className="container">
            <SectionHead eyebrow="Before anything is sent" title="What we check first" id="checks-heading" />
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
              {checks.map((check) => (
                <div className="pf-card p-7" key={check.title}>
                  <span className="pf-chip pf-chip-teal">{icons[check.icon]}</span>
                  <h3 className="mt-5 text-[20px] font-medium leading-[1.3] text-[var(--ink)]">{check.title}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{check.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-pad scroll-mt-20" id="deadlines" aria-labelledby="deadlines-heading">
          <div className="container">
            <SectionHead eyebrow="Deadlines" title="What the notice asks, and when" id="deadlines-heading" />
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
              <div className="pf-card p-7">
                <span className="pf-chip pf-chip-teal">{icons.clock}</span>
                <p className="pf-figure mt-5">{PLATFORM_DEADLINE_HOURS} hours</p>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{PLATFORM_DEADLINE_TEXT}</p>
              </div>
              <div className="pf-card p-7">
                <span className="pf-chip pf-chip-teal">{icons.recheck}</span>
                <p className="pf-figure mt-5">{ESCALATION_HOURS[1]} hours</p>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{PLATFORM_FOLLOW_UP_TEXT}</p>
              </div>
            </div>
            <p className="muted mx-auto mt-8 max-w-3xl text-center text-sm leading-[1.7]">
              The follow-up is a covering letter that restates the same reviewed complaint text. It stops when your
              platform answers — acknowledged or refused — and everything stops when the content is removed or the
              case is resolved. The survivor&apos;s own next steps (a cybercrime.gov.in complaint, an appeal) continue on
              her case page either way.
            </p>
          </div>
        </section>

        <section className="pf-warm section-pad scroll-mt-20" id="reach" aria-labelledby="reach-heading">
          <div className="container">
            <SectionHead eyebrow="Reach us" title="How to talk to us about a notice" id="reach-heading" />
            <div className="pf-asks mx-auto mt-12 max-w-5xl p-7 md:p-9">
              <ul className="grid gap-x-10 gap-y-3 text-[15px] leading-[1.6] text-[var(--text)] md:grid-cols-2">
                {reach.map((item) => (
                  <li className="flex gap-3" key={item}>
                    <span className="pf-tick pf-tick-flame">{icons.check}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm font-medium leading-[1.6] text-[var(--danger)]">
                &lt;TO_FILL: trust and safety contact&gt;
              </p>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-labelledby="partner-heading">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 id="partner-heading" className="section-title">
                Become a platform partner
              </h2>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
                Platforms that join the partner programme receive these notices through one agreed channel, with image
                fingerprints they can match, and a person to talk to when a case needs attention.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/for-platforms">
                  Join the programme
                </Link>
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
