"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

type Step = "accept" | "who" | "intimate" | "stop_other" | "stop_content";

const PROGRESS: Record<Step, number | null> = {
  accept: 0,
  who: 1,
  intimate: 2,
  stop_other: null,
  stop_content: null,
};

export function EligibilityWizard({ locale }: { locale: Locale }) {
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
      <WizardShell step={step} showBack={false} onBack={back} title={t(locale, "eligibility.step.accept.title")} locale={locale}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.step.accept.sub")}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <InfoBox title={t(locale, "eligibility.canHelp.title")}>
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>{t(locale, "eligibility.canHelp.item1")}</li>
              <li>{t(locale, "eligibility.canHelp.item2")}</li>
              <li>{t(locale, "eligibility.canHelp.item3")}</li>
              <li>{t(locale, "eligibility.canHelp.item4")}</li>
            </ul>
          </InfoBox>
          <InfoBox title={t(locale, "eligibility.cannotHelp.title")}>
            <ul className="mt-3 space-y-2 text-sm leading-[1.65]">
              <li>{t(locale, "eligibility.cannotHelp.item1")}</li>
              <li>{t(locale, "eligibility.cannotHelp.item2")}</li>
              <li>{t(locale, "eligibility.cannotHelp.item3")}</li>
              <li>{t(locale, "eligibility.cannotHelp.item4")}</li>
            </ul>
          </InfoBox>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm leading-[1.7] text-[var(--muted)]">
          <span className="font-semibold text-[var(--foreground)]">{t(locale, "eligibility.limits.bold")}</span>{" "}
          {t(locale, "eligibility.limits.rest")}
        </div>

        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" onClick={next} type="button">
            {t(locale, "eligibility.cta.continue")}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "who") {
    return (
      <WizardShell step={step} showBack onBack={back} title={t(locale, "eligibility.step.who.title")} locale={locale}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.step.who.sub")}
        </p>
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">{t(locale, "eligibility.step.who.title")}</legend>
          <ChoiceOption
            label={t(locale, "eligibility.who.myself.label")}
            sublabel={t(locale, "eligibility.who.myself.sub")}
            checked={who === "myself"}
            onSelect={() => setWho("myself")}
          />
          <ChoiceOption
            label={t(locale, "eligibility.who.other.label")}
            sublabel={t(locale, "eligibility.who.other.sub")}
            checked={who === "other"}
            onSelect={() => setWho("other")}
          />
        </fieldset>
        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" disabled={!who} onClick={next} type="button">
            {t(locale, "eligibility.cta.continueBtn")}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "intimate") {
    return (
      <WizardShell step={step} showBack onBack={back} title={t(locale, "eligibility.step.intimate.title")} locale={locale}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.step.intimate.sub")}
        </p>
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">{t(locale, "eligibility.step.intimate.title")}</legend>
          <ChoiceOption
            label={t(locale, "eligibility.intimate.yes.label")}
            sublabel={t(locale, "eligibility.intimate.yes.sub")}
            checked={intimate === "yes"}
            onSelect={() => setIntimate("yes")}
          />
          <ChoiceOption
            label={t(locale, "eligibility.intimate.no.label")}
            sublabel={t(locale, "eligibility.intimate.no.sub")}
            checked={intimate === "no"}
            onSelect={() => setIntimate("no")}
          />
        </fieldset>
        <div className="mt-8 flex justify-end">
          <button className="btn btn-primary" disabled={!intimate} onClick={next} type="button">
            {t(locale, "eligibility.cta.continueBtn")}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_other") {
    return (
      <WizardShell step={step} showBack={false} onBack={back} title={t(locale, "eligibility.stop.other.title")} locale={locale}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.other.sub1")}
        </p>
        <p className="muted mt-3 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.other.sub2")}
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            {t(locale, "eligibility.stop.other.orgs")}
          </p>
          <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
            {t(locale, "eligibility.stop.other.icall.body")}
          </ResourceLink>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            {t(locale, "eligibility.stop.other.ncrp.body")}
          </ResourceLink>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("who")} type="button">
            {t(locale, "eligibility.stop.other.goBack")}
          </button>
          <Link className="btn btn-secondary" href="/">{t(locale, "eligibility.stop.other.returnHome")}</Link>
        </div>
      </WizardShell>
    );
  }

  if (step === "stop_content") {
    return (
      <WizardShell step={step} showBack={false} onBack={back} title={t(locale, "eligibility.stop.content.title")} locale={locale}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.content.sub")}
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            {t(locale, "eligibility.stop.content.orgs")}
          </p>
          <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
            {t(locale, "eligibility.stop.content.ncrp.body")}
          </ResourceLink>
          <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
            {t(locale, "eligibility.stop.content.icall.body")}
          </ResourceLink>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="btn btn-secondary" onClick={() => setStep("intimate")} type="button">
            {t(locale, "eligibility.stop.other.goBack")}
          </button>
          <Link className="btn btn-secondary" href="/">{t(locale, "eligibility.stop.other.returnHome")}</Link>
        </div>
      </WizardShell>
    );
  }

  return null;
}

function ProgressBar({ step, locale }: { step: Step; locale: Locale }) {
  const current = PROGRESS[step];
  if (current === null) return <div className="hairline mb-8" />;
  const labels = [
    t(locale, "eligibility.progress.overview"),
    t(locale, "eligibility.progress.whosDepicted"),
    t(locale, "eligibility.progress.contentType"),
  ];
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
  locale,
}: {
  step: Step;
  showBack: boolean;
  onBack: () => void;
  title: string;
  children: React.ReactNode;
  locale: Locale;
}) {
  return (
    <div>
      <ProgressBar step={step} locale={locale} />
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
            {t(locale, "eligibility.back")}
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
