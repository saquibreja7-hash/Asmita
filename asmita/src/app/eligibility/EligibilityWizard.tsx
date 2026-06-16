"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "accept" | "who" | "intimate" | "stop_other" | "stop_content";

const PROGRESS: Record<Step, number | null> = {
  accept: 0,
  who: 1,
  intimate: 2,
  stop_other: null,
  stop_content: null,
};

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
    if (step === "accept") setStep("who");
    else if (step === "who") {
      if (who === "other") setStep("stop_other");
      else setStep("intimate");
    } else if (step === "intimate") {
      if (intimate === "no") setStep("stop_content");
      else router.push("/register");
    }
  }

  if (step === "accept") {
    return (
      <WizardShell step={step} showBack={false} onBack={back} title="What Asmita can and cannot do.">
        <p className="muted mt-1 text-sm leading-[1.75]">
          Please read this before continuing. Asmita is only able to help in
          specific situations - this step makes sure it is the right tool for you.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <InfoBox title="Asmita can help if">
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>Links to non-consensual intimate content of you are circulating online</li>
              <li>Someone is threatening to post such content, even if not yet published</li>
              <li>The content is a deepfake or AI-generated image depicting you intimately</li>
              <li>You want platforms served with a legal takedown notice under IT Rules 2021</li>
            </ul>
          </InfoBox>
          <InfoBox title="Asmita cannot help if">
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>You are reporting on behalf of someone else</li>
              <li>The content does not depict you in an intimate way</li>
              <li>The content involves anyone under 18</li>
              <li>You only have screenshots of chats or audio recordings</li>
            </ul>
          </InfoBox>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm leading-[1.7] text-[var(--muted)]">
          <span className="font-semibold text-[var(--foreground)]">Honest limits:</span>{" "}
          Asmita reaches platforms with a verified grievance contact. It cannot
          help with encrypted messaging apps or content on unknown personal servers.
        </div>

        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" onClick={next} type="button">
            I understand - continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "who") {
    return (
      <WizardShell step={step} showBack onBack={back} title="Who is shown in the content?">
        <p className="muted mt-1 text-sm leading-[1.75]">
          Asmita can only accept cases filed by the person shown in the content.
        </p>
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Who is shown in the content</legend>
          <ChoiceOption
            label="I am in the content - it is of me."
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
        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" disabled={!who} onClick={next} type="button">
            Continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "intimate") {
    return (
      <WizardShell step={step} showBack onBack={back} title="Is the content intimate?">
        <p className="muted mt-1 text-sm leading-[1.75]">
          Asmita is designed for non-consensual intimate imagery. The content
          must meet this definition for us to be able to help.
        </p>
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Is the content intimate</legend>
          <ChoiceOption
            label="Yes - it shows me nude, semi-nude, or in a sexual situation."
            sublabel="Including deepfakes or AI-generated images of this kind."
            checked={intimate === "yes"}
            onSelect={() => setIntimate("yes")}
          />
          <ChoiceOption
            label="No - I am fully clothed, or it does not show intimate content."
            sublabel="For example: screenshots of chats, face-only photos, or non-sexual images."
            checked={intimate === "no"}
            onSelect={() => setIntimate("no")}
          />
        </fieldset>
        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" disabled={!intimate} onClick={next} type="button">
            Continue
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_other") {
    return (
      <WizardShell step={step} showBack={false} onBack={back} title="Only the person depicted can file a case.">
        <p className="muted mt-1 text-sm leading-[1.75]">
          Asmita requires the case to be filed by the person shown in the
          content. This rule exists to prevent the tool from being used to
          target or harm someone else.
        </p>
        <p className="muted mt-3 text-sm leading-[1.75]">
          If you know the person affected, share Asmita with them and help
          them reach a support organisation directly.
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Organisations that can help
          </p>
          <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
            Free counselling by trained professionals. Can help the person talk through options and next steps.
          </ResourceLink>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            The survivor can report directly here. A trusted person can accompany them to file.
          </ResourceLink>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("who")} type="button">
            ← Go back
          </button>
          <Link className="btn btn-secondary" href="/">Return to home</Link>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_content") {
    return (
      <WizardShell step={step} showBack={false} onBack={back} title="Asmita is designed for intimate imagery.">
        <p className="muted mt-1 text-sm leading-[1.75]">
          The content you described does not meet the definition of
          non-consensual intimate imagery. Other tools are better suited to help.
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Where to get help instead
          </p>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            For harassment, stalking, defamation, or non-intimate images shared without consent. Use the &ldquo;women and child&rdquo; path.
          </ResourceLink>
          <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
            Free, confidential support for anyone experiencing online abuse of any kind.
          </ResourceLink>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("intimate")} type="button">
            ← Go back
          </button>
          <Link className="btn btn-secondary" href="/">Return to home</Link>
        </div>
      </WizardShell>
    );
  }

  return null;
}

function ProgressBar({ step }: { step: Step }) {
  const current = PROGRESS[step];
  if (current === null) return <div className="hairline mb-8" />;
  const total = 3;
  const labels = ["Overview", "Who's depicted", "Content type"];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2">
        {labels.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                  i < current
                    ? "bg-[var(--teal)] text-white"
                    : i === current
                    ? "border-2 border-[var(--teal)] text-[var(--teal)]"
                    : "border border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {i < current ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`hidden text-[11px] sm:block ${i === current ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className="flex-1 h-px mx-1" style={{ background: i < current ? "var(--teal)" : "var(--hairline)" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WizardShell({
  step,
  showBack,
  onBack,
  title,
  children,
}: {
  step: Step;
  showBack: boolean;
  onBack: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <ProgressBar step={step} />
      <div className="mt-8 flex items-start justify-between gap-4">
        <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
          {title}
        </h2>
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            aria-label="Go back to previous step"
          >
            ← Back
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChoiceOption({
  label,
  sublabel,
  checked,
  onSelect,
}: {
  label: string;
  sublabel: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
        checked
          ? "border-[var(--teal)] bg-[var(--teal-soft)]"
          : "border-[var(--hairline)] bg-[var(--background)] hover:border-[var(--border)]"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--teal)]"
      />
      <span>
        <span className="font-display block text-[15px] leading-[1.4] tracking-tight text-[var(--foreground)] md:text-[17px]">
          {label}
        </span>
        <span className="mt-1 block text-sm leading-[1.6] text-[var(--muted)]">
          {sublabel}
        </span>
      </span>
    </label>
  );
}

function InfoBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="font-display text-[14px] font-semibold leading-[1.3] tracking-tight text-[var(--foreground)]">
        {title}
      </p>
      <div className="text-[var(--muted)]">{children}</div>
    </div>
  );
}

function ResourceLink({
  name,
  contact,
  href,
  external,
  children,
}: {
  name: string;
  contact: string;
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="font-display text-[15px] leading-[1.3] tracking-tight text-[var(--foreground)]">
        {name}
      </p>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="mt-1 block font-mono text-[14px] text-[var(--teal-dark)] underline decoration-transparent underline-offset-4 transition-colors hover:decoration-[var(--teal-dark)]"
      >
        {contact}
        {external && <span className="sr-only"> (opens in new tab)</span>}
      </a>
      <p className="muted mt-2 text-sm leading-[1.65]">{children}</p>
    </div>
  );
}
