"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "accept" | "who" | "intimate" | "stop_other" | "stop_content";

export function EligibilityWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("accept");
  const [who, setWho] = useState<"myself" | "other" | "">("");
  const [intimate, setIntimate] = useState<"yes" | "no" | "">("");

  function back() {
    if (step === "who") setStep("accept");
    else if (step === "intimate") setStep("who");
  }

  function next() {
    if (step === "accept") {
      setStep("who");
    } else if (step === "who") {
      if (who === "other") setStep("stop_other");
      else setStep("intimate");
    } else if (step === "intimate") {
      if (intimate === "no") setStep("stop_content");
      else router.push("/register");
    }
  }

  if (step === "accept") {
    return (
      <WizardShell stepLabel="Before you begin" showBack={false} onBack={back}>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
          What Asmita can and cannot do.
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
          Please read this before continuing. Asmita is only able to help in
          specific situations — this step makes sure it is the right tool for you.
        </p>

        <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
          <InfoBox title="We accept" variant="teal">
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>Intimate images or videos of you that you did not consent to being shared</li>
              <li>Content that is being used to threaten or blackmail you — even if not yet posted</li>
              <li>Deepfakes or AI-generated intimate images of you</li>
              <li>Images that are nude, semi-nude, or show a sexual act involving you</li>
            </ul>
          </InfoBox>
          <InfoBox title="We cannot accept" variant="rose">
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>Content you are reporting on behalf of someone else</li>
              <li>Commercial or professional images</li>
              <li>Screenshots of text conversations</li>
              <li>Audio recordings</li>
              <li>Content involving anyone under 18</li>
            </ul>
          </InfoBox>
        </div>

        <div className="mt-8 rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] p-4 text-left text-sm leading-[1.7] text-[var(--muted)]">
          <span className="font-semibold text-[var(--foreground)]">Honest limits:</span>{" "}
          Asmita reaches platforms that have a verified grievance contact. It
          cannot help with encrypted messaging apps or content on unknown personal servers.
        </div>

        <div className="mt-10 flex justify-center">
          <button className="btn btn-primary" onClick={next} type="button">
            I understand — continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "who") {
    return (
      <WizardShell stepLabel="Step 01 of 02" showBack onBack={back}>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
          Who is shown in the content?
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
          Asmita can only accept cases filed by the person shown in the content.
        </p>
        <fieldset className="mt-10 space-y-3">
          <legend className="sr-only">Who is shown in the content</legend>
          <ChoiceOption
            label="I am in the content — it is of me."
            sublabel="You are the person depicted."
            checked={who === "myself"}
            onSelect={() => setWho("myself")}
          />
          <ChoiceOption
            label="Someone else is in it, or I am reporting for someone else."
            sublabel="You are not the person depicted, or filing on another person's behalf."
            checked={who === "other"}
            onSelect={() => setWho("other")}
          />
        </fieldset>
        <div className="mt-10 flex justify-center">
          <button className="btn btn-primary" disabled={!who} onClick={next} type="button">
            Continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "intimate") {
    return (
      <WizardShell stepLabel="Step 02 of 02" showBack onBack={back}>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
          Is the content intimate?
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
          Asmita is designed for non-consensual intimate imagery. The content
          must meet this definition for us to be able to help.
        </p>
        <fieldset className="mt-10 space-y-3">
          <legend className="sr-only">Is the content intimate</legend>
          <ChoiceOption
            label="Yes — it shows me nude, semi-nude, or in a sexual situation."
            sublabel="Including deepfakes or AI-generated images of this kind."
            checked={intimate === "yes"}
            onSelect={() => setIntimate("yes")}
          />
          <ChoiceOption
            label="No — I am fully clothed, or it does not show intimate content."
            sublabel="For example: screenshots of chats, face-only photos, or non-sexual images."
            checked={intimate === "no"}
            onSelect={() => setIntimate("no")}
          />
        </fieldset>
        <div className="mt-10 flex justify-center">
          <button className="btn btn-primary" disabled={!intimate} onClick={next} type="button">
            Continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_other") {
    return (
      <WizardShell stepLabel="We cannot help directly" showBack={false} onBack={back}>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
          Only the person depicted can file a case.
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
          Asmita requires the case to be filed by the person shown in the
          content. This rule exists to prevent the tool from being used to
          target or harm someone else.
        </p>
        <p className="muted mx-auto mt-4 max-w-lg text-base leading-[1.75]">
          If you know the person affected, share Asmita with them and help
          them reach a support organisation directly.
        </p>
        <div className="mt-10 space-y-4 text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Organisations that can help
          </p>
          <ResourceLink name="iCall — Psychosocial Support" contact="9152987821" href="tel:9152987821">
            Free counselling by trained professionals. Can help the person talk through options and next steps.
          </ResourceLink>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            The survivor can report directly here. A trusted person can accompany them to file.
          </ResourceLink>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("who")} type="button">← Go back</button>
          <Link className="btn btn-secondary" href="/">Return to home</Link>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_content") {
    return (
      <WizardShell stepLabel="We cannot help with this" showBack={false} onBack={back}>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
          Asmita is designed for intimate imagery.
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">
          The content you described does not meet the definition of
          non-consensual intimate imagery. Other tools are better suited to help.
        </p>
        <div className="mt-10 space-y-4 text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Where to get help instead
          </p>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            For harassment, stalking, defamation, or non-intimate images shared without consent. Use the &ldquo;women and child&rdquo; path.
          </ResourceLink>
          <ResourceLink name="iCall — Psychosocial Support" contact="9152987821" href="tel:9152987821">
            Free, confidential support for anyone experiencing online abuse of any kind.
          </ResourceLink>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("intimate")} type="button">← Go back</button>
          <Link className="btn btn-secondary" href="/">Return to home</Link>
        </div>
      </WizardShell>
    );
  }

  return null;
}

function WizardShell({ stepLabel, showBack, onBack, children }: {
  stepLabel: string; showBack: boolean; onBack: () => void; children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3">
        {showBack && (
          <button type="button" onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Go back to previous step">
            ← Back
          </button>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stepLabel}</p>
      </div>
      {children}
    </div>
  );
}

function ChoiceOption({ label, sublabel, checked, onSelect }: {
  label: string; sublabel: string; checked: boolean; onSelect: () => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-[14px] border p-4 text-left transition-colors ${checked ? "border-[var(--teal)] bg-[var(--teal-soft)]" : "border-[var(--hairline)] bg-white hover:border-[var(--border)]"}`}>
      <input type="radio" checked={checked} onChange={onSelect} className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--teal)]" />
      <span>
        <span className="font-display block text-[16px] leading-[1.4] tracking-tight text-[var(--foreground)] md:text-[18px]">{label}</span>
        <span className="mt-1 block text-sm leading-[1.6] text-[var(--muted)]">{sublabel}</span>
      </span>
    </label>
  );
}

function InfoBox({ title, variant, children }: { title: string; variant: "teal" | "rose"; children: React.ReactNode; }) {
  const styles = variant === "teal" ? "border-[var(--teal)] bg-[var(--teal-soft)]" : "border-[var(--rose)] bg-[#fff5f5]";
  return (
    <div className={`rounded-[14px] border p-5 ${styles}`}>
      <p className="font-display text-[15px] font-semibold leading-[1.3] tracking-tight text-[var(--foreground)]">{title}</p>
      <div className="text-[var(--muted)]">{children}</div>
    </div>
  );
}

function ResourceLink({ name, contact, href, external, children }: {
  name: string; contact: string; href: string; external?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-white p-4">
      <p className="font-display text-[16px] leading-[1.3] tracking-tight text-[var(--foreground)]">{name}</p>
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
        className="mt-1 block font-mono text-[15px] text-[var(--teal-dark)] underline decoration-transparent underline-offset-4 transition-colors hover:decoration-[var(--teal-dark)]">
        {contact}{external && <span className="sr-only"> (opens in new tab)</span>}
      </a>
      <p className="muted mt-2 text-sm leading-[1.65]">{children}</p>
    </div>
  );
}
