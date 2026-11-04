"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetEligibility, rememberEligibleAdult } from "@/lib/eligibility";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

type Stop = "other" | "content" | null;
type Outcome = "next" | "minor" | Stop;

type Question = {
  title: MessageKey;
  sub?: MessageKey;
  options: { label: MessageKey; outcome: Outcome }[];
};

// One question per screen; tapping an answer moves on. Age comes first, so
// anyone who is under 18, or was (or is not sure they were) when the content
// was made, goes to the minor pathway before anything else is asked.
const QUESTIONS: Question[] = [
  {
    title: "eligibility.ageNow.title",
    sub: "eligibility.single.sub",
    options: [
      { label: "eligibility.ageNow.adult", outcome: "next" },
      { label: "eligibility.ageNow.minor", outcome: "minor" },
    ],
  },
  {
    title: "eligibility.ageThen.title",
    sub: "eligibility.ageThen.sub",
    options: [
      { label: "eligibility.ageThen.adult", outcome: "next" },
      { label: "eligibility.ageThen.minor", outcome: "minor" },
    ],
  },
  {
    title: "eligibility.who.title",
    options: [
      { label: "eligibility.who.myself", outcome: "next" },
      { label: "eligibility.who.other", outcome: "other" },
    ],
  },
  {
    title: "eligibility.intimate.title",
    sub: "eligibility.intimate.sub",
    options: [
      { label: "eligibility.intimate.yes", outcome: "next" },
      { label: "eligibility.intimate.no", outcome: "content" },
    ],
  },
];

export function EligibilityWizard({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [stop, setStop] = useState<Stop>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to each new question so screen readers announce it.
  useEffect(() => {
    if (index > 0 || stop) heading.current?.focus({ preventScroll: true });
  }, [index, stop]);

  function answer(outcome: Outcome) {
    if (outcome === "minor") {
      forgetEligibility();
      router.push("/minor-support");
      return;
    }
    if (outcome !== "next") return setStop(outcome);
    if (index < QUESTIONS.length - 1) return setIndex(index + 1);
    rememberEligibleAdult();
    router.push("/submit");
  }

  if (stop === "other") {
    return (
      <StopScreen
        locale={locale}
        headingRef={heading}
        title={t(locale, "eligibility.stop.other.title")}
        onBack={() => setStop(null)}
        orgsLabel={t(locale, "eligibility.stop.other.orgs")}
        intro={
          <>
            <p className="muted mt-3 text-base leading-[1.7]">{t(locale, "eligibility.stop.other.sub1")}</p>
            <p className="muted mt-3 text-base leading-[1.7]">{t(locale, "eligibility.stop.other.sub2")}</p>
          </>
        }
      >
        <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
          {t(locale, "eligibility.stop.other.icall.body")}
        </ResourceLink>
        <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
          {t(locale, "eligibility.stop.other.ncrp.body")}
        </ResourceLink>
      </StopScreen>
    );
  }

  if (stop === "content") {
    return (
      <StopScreen
        locale={locale}
        headingRef={heading}
        title={t(locale, "eligibility.stop.content.title")}
        onBack={() => setStop(null)}
        orgsLabel={t(locale, "eligibility.stop.content.orgs")}
        intro={<p className="muted mt-3 text-base leading-[1.7]">{t(locale, "eligibility.stop.content.sub")}</p>}
      >
        <ResourceLink name="National Cybercrime Portal" contact="cybercrime.gov.in" href="https://cybercrime.gov.in/" external>
          {t(locale, "eligibility.stop.content.ncrp.body")}
        </ResourceLink>
        <ResourceLink name="iCall - Psychosocial Support" contact="9152987821" href="tel:9152987821">
          {t(locale, "eligibility.stop.content.icall.body")}
        </ResourceLink>
      </StopScreen>
    );
  }

  const question = QUESTIONS[index];
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
        {index > 0 ? (
          <button className="underline underline-offset-4" onClick={() => setIndex(index - 1)} type="button">
            {t(locale, "eligibility.q.back")}
          </button>
        ) : (
          <span />
        )}
        <span>
          {t(locale, "eligibility.q.label")} {index + 1} / {QUESTIONS.length}
        </span>
      </div>

      <h2 ref={heading} tabIndex={-1} className="section-title mt-6 outline-none">
        {t(locale, question.title)}
      </h2>
      {question.sub && <p className="muted mt-3 text-base leading-[1.6]">{t(locale, question.sub)}</p>}

      <div className="mt-8 grid gap-3">
        {question.options.map((option) => (
          <button
            key={option.label}
            className="min-h-[64px] w-full rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-5 py-4 text-left text-[18px] font-medium leading-[1.35] text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--brand-soft)] focus-visible:border-[var(--ink)]"
            onClick={() => answer(option.outcome)}
            type="button"
          >
            {t(locale, option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function StopScreen({
  locale,
  headingRef,
  title,
  intro,
  orgsLabel,
  onBack,
  children,
}: {
  locale: Locale;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  intro: React.ReactNode;
  orgsLabel: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="section-title outline-none">
        {title}
      </h2>
      {intro}
      <p className="mt-8 text-sm font-medium text-[var(--text-muted)]">{orgsLabel}</p>
      <div className="mt-3 space-y-3">{children}</div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button className="btn btn-secondary" onClick={onBack} type="button">
          {t(locale, "eligibility.stop.other.goBack")}
        </button>
        <Link className="btn btn-secondary" href="/">{t(locale, "eligibility.stop.other.returnHome")}</Link>
      </div>
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
    <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-4">
      <p className="text-[16px] font-medium leading-[1.3] text-[var(--ink)]">{name}</p>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="mt-1 block text-[15px] text-[var(--brand-strong)] underline underline-offset-4"
      >
        {contact}
        {external && <span className="sr-only"> (opens in new tab)</span>}
      </a>
      <p className="muted mt-2 text-sm leading-[1.65]">{children}</p>
    </div>
  );
}
