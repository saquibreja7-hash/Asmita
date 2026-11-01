"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rememberEligibleAdult } from "@/lib/eligibility";
import { t, type Locale } from "@/lib/i18n";

type Stop = "other" | "content" | null;

// Every eligibility question on one screen. Anyone who is under 18, or was
// (or is not sure they were) when the content was made, goes to the minor
// pathway before anything else is asked.
export function EligibilityWizard({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [who, setWho] = useState<"myself" | "other" | "">("");
  const [intimate, setIntimate] = useState<"yes" | "no" | "">("");
  const [ageNow, setAgeNow] = useState<"adult" | "minor" | "">("");
  const [ageThen, setAgeThen] = useState<"adult" | "minor" | "">("");
  const [stop, setStop] = useState<Stop>(null);

  const answered = Boolean(who && intimate && (ageNow === "minor" || (ageNow && ageThen)));

  function next() {
    if (ageNow === "minor" || ageThen === "minor") {
      router.push("/minor-support");
      return;
    }
    if (who === "other") return setStop("other");
    if (intimate === "no") return setStop("content");
    rememberEligibleAdult();
    router.push("/submit");
  }

  if (stop === "other") {
    return (
      <WizardShell title={t(locale, "eligibility.stop.other.title")}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.other.sub1")}
        </p>
        <p className="muted mt-3 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.other.sub2")}
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
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
          <button className="btn btn-secondary" onClick={() => setStop(null)} type="button">
            {t(locale, "eligibility.stop.other.goBack")}
          </button>
          <Link className="btn btn-secondary" href="/">{t(locale, "eligibility.stop.other.returnHome")}</Link>
        </div>
      </WizardShell>
    );
  }

  if (stop === "content") {
    return (
      <WizardShell title={t(locale, "eligibility.stop.content.title")}>
        <p className="muted mt-1 text-sm leading-[1.75]">
          {t(locale, "eligibility.stop.content.sub")}
        </p>
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
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
          <button className="btn btn-secondary" onClick={() => setStop(null)} type="button">
            {t(locale, "eligibility.stop.other.goBack")}
          </button>
          <Link className="btn btn-secondary" href="/">{t(locale, "eligibility.stop.other.returnHome")}</Link>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell title={t(locale, "eligibility.single.title")}>
      <p className="muted mt-1 text-sm leading-[1.75]">
        {t(locale, "eligibility.single.sub")}
      </p>

      <details className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--background)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
          {t(locale, "eligibility.step.accept.title")}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        <p className="mt-3 text-sm leading-[1.7] text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">{t(locale, "eligibility.limits.bold")}</span>{" "}
          {t(locale, "eligibility.limits.rest")}
        </p>
      </details>

      <Question title={t(locale, "eligibility.step.who.title")}>
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
      </Question>

      <Question title={t(locale, "eligibility.step.intimate.title")}>
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
      </Question>

      <Question title={t(locale, "eligibility.ageNow.title")}>
        <ChoiceOption label={t(locale, "auth.ageAdult")} checked={ageNow === "adult"} onSelect={() => setAgeNow("adult")} />
        <ChoiceOption label={t(locale, "auth.ageMinor")} checked={ageNow === "minor"} onSelect={() => setAgeNow("minor")} />
      </Question>

      {ageNow !== "minor" && (
        <Question title={t(locale, "eligibility.ageThen.title")} sub={t(locale, "eligibility.ageThen.sub")}>
          <ChoiceOption label={t(locale, "auth.ageThenAdult")} checked={ageThen === "adult"} onSelect={() => setAgeThen("adult")} />
          <ChoiceOption label={t(locale, "auth.ageThenMinor")} checked={ageThen === "minor"} onSelect={() => setAgeThen("minor")} />
        </Question>
      )}

      <div className="mt-8 flex justify-end">
        <button className="btn btn-primary" disabled={!answered} onClick={next} type="button">
          {t(locale, "eligibility.cta.continueBtn")}
        </button>
      </div>
    </WizardShell>
  );
}

function Question({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 space-y-3">
      <legend className="text-[17px] font-medium leading-[1.3] text-[var(--foreground)]">{title}</legend>
      {sub && <p className="muted text-sm leading-[1.6]">{sub}</p>}
      {children}
    </fieldset>
  );
}

function WizardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[26px] font-medium leading-[1.2] tracking-tight md:text-[32px]">{title}</h2>
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
  sublabel?: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[24px] border p-4 text-left transition-colors ${
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
        <span className="block text-[15px] font-medium leading-[1.4] text-[var(--foreground)] md:text-[17px]">
          {label}
        </span>
        {sublabel && (
          <span className="mt-1 block text-sm leading-[1.6] text-[var(--muted)]">
            {sublabel}
          </span>
        )}
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
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[14px] font-medium leading-[1.3] text-[var(--foreground)]">
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
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[15px] font-medium leading-[1.3] text-[var(--foreground)]">
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
