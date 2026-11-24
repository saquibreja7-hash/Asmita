import type { Metadata } from "next";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { ESCALATION_HOURS } from "@/lib/escalation-engine";
import { Icon } from "@/components/Icon";
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
  "Quote the case reference (format: ASMITA-2026-…) in every reply, so we can find the case without asking the survivor for anything.",
  "Requests for more information about the complaint are passed to the survivor only if they are addressed to Notice@meriasmita.org and quote the case reference. The complainant is not named in the notice.",
  "Tell us the outcome — actioned, refused, or acknowledged — and she sees the answer on her case page.",
];

const Check = () => <Icon name="check" size={16} />;
const Lock = () => <Icon name="lock" size={16} />;

export default function TrustedFlaggerPage() {
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        backLabel="For platforms"
        backHref="/for-platforms"
        title="What a notice from Meri Asmita contains"
        intro={
          <p>
            Notices from this service are survivor-signed complaints about non-consensual intimate imagery. This page
            tells trust and safety teams exactly what arrives in your inbox, what we checked before sending it, and how
            to reach us about one.
          </p>
        }
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <a className="btn btn-primary btn-arrow !m-0" href="#deadlines">
            Deadlines
          </a>
          <Link className="btn btn-secondary !m-0" href="#reach">
            Reach us
          </Link>
        </div>
      </LabToolHero>

        <section className="zone-white" aria-labelledby="formed-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="formed-heading" className="section-title">
                From her report to your inbox
              </h2>
            </div>
            <ol className="org-steps">
              {formation.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="org-note">
              <Icon name="info" />
              <span>
                Some platforms have no verified grievance email. For those, the survivor is directed to your own
                reporting form with the notice text to paste in, fingerprints included — the same complaint, filed where
                your process expects it.
              </span>
            </p>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="contents-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="contents-heading" className="section-title">
                What the notice contains — and what it never contains
              </h2>
            </div>
            <div className="org-columns">
              <div>
                <h3>Each notice carries</h3>
                <ul className="org-check">
                  <li><Check /><span>The case reference and her declaration reference</span></li>
                  <li><Check /><span>The reported link on your service</span></li>
                  <li>
                    <Check />
                    <span>
                      The complaint the survivor signed, which asks for removal under Rule 3(2)(b) of the IT Rules,
                      2021 as amended in 2026 — the rule the notice itself cites
                    </span>
                  </li>
                  <li><Check /><span>The fingerprint annex, when the case has approved fingerprints</span></li>
                </ul>
              </div>
              <div>
                <h3>Never in a notice</h3>
                <ul className="org-check">
                  <li><Lock /><span>The survivor&apos;s name. She is not named, and we hold nothing to hand over but her signed declaration</span></li>
                  <li><Lock /><span>The content itself. Meri Asmita never retrieves, views or stores it</span></li>
                  <li><Lock /><span>Fingerprints the survivor did not sign, or that are not approved</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="zone-white" aria-labelledby="checks-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="checks-heading" className="section-title">
                What we check first
              </h2>
            </div>
            <ul className="org-rows org-rows-2">
              {checks.map((check) => (
                <li key={check.title}>
                  <div className="org-row">
                    <span className="org-row-icon" aria-hidden>
                      {icons[check.icon]}
                    </span>
                    <h3 className="org-row-title">{check.title}</h3>
                    <p className="org-row-body">{check.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="transform-section scroll-mt-20" id="deadlines" aria-labelledby="deadlines-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="deadlines-heading" className="section-title">
                What the notice asks, and when
              </h2>
            </div>
            <div>
              <dl className="org-columns">
                <div className="border-t-2 border-[var(--coral)] pt-5">
                  <dt className="text-[length:var(--text-heading-sm)] font-semibold leading-none tabular-nums text-[var(--ink)]">{PLATFORM_DEADLINE_HOURS} hours</dt>
                  <dd className="mt-3 text-[length:var(--text-body)] leading-[1.6] text-[var(--text)]">{PLATFORM_DEADLINE_TEXT}</dd>
                </div>
                <div className="border-t-2 border-[var(--coral)] pt-5">
                  <dt className="text-[length:var(--text-heading-sm)] font-semibold leading-none tabular-nums text-[var(--ink)]">{ESCALATION_HOURS[1]} hours</dt>
                  <dd className="mt-3 text-[length:var(--text-body)] leading-[1.6] text-[var(--text)]">{PLATFORM_FOLLOW_UP_TEXT}</dd>
                </div>
              </dl>
              <p className="mt-8 max-w-[62ch] text-[length:var(--text-body)] leading-[1.7] text-[var(--text)]">
                The follow-up is a covering letter that restates the same reviewed complaint text. It stops when your
                platform answers — acknowledged or refused — and everything stops when the content is removed or the
                case is resolved. The survivor&apos;s own next steps (a cybercrime.gov.in complaint, an appeal) continue on
                her case page either way.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white scroll-mt-20" id="reach" aria-labelledby="reach-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="reach-heading" className="section-title">
                How to talk to us about a notice
              </h2>
            </div>
            <div>
              <ul className="org-check !mt-0">
                {reach.map((item) => (
                  <li key={item}>
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[length:var(--text-body)] leading-[1.6] text-[var(--text)]">
                Trust and safety teams can write to us at{" "}
                <a className="text-link" href="mailto:grievance@meriasmita.org">
                  grievance@meriasmita.org
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="lab-sub-section" aria-labelledby="partner-heading">
          <div className="container">
            <div className="issue-close">
              <h2 id="partner-heading" className="lab-h2">
                Become a platform partner
              </h2>
              <p className="issue-close-body">
                Platforms that join the partner programme receive these notices through one agreed channel, with image
                fingerprints they can match, and a person to talk to when a case needs attention.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
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
    </LabToolShell>
  );
}
