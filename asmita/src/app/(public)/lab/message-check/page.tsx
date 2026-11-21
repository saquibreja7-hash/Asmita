import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { MessageCheckForm } from "./MessageCheckForm";

/*
 * WP93 (docs/lab/beta-spec.md): the public message check tool, /lab/message-check.
 * A visitor pastes the text of a threatening message; the pattern rules run
 * in code and the optional short summary comes from Sarvam. Text only — no
 * images, no links followed — and nothing is stored or logged. The page 404s
 * while the Lab is off (it is on in dev and test), like every lab page.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check a threatening message",
  description:
    "Paste the text of a threatening message or chat and see which sextortion patterns it matches, each explained in plain words. Nothing is stored or logged.",
};

const NEXT_STEPS = [
  "lab.message-check.next.noPay",
  "lab.message-check.next.noMore",
  "lab.message-check.next.evidence",
  "lab.message-check.next.block",
  "lab.message-check.next.report",
] as const;

const HELPLINES = [
  { key: "lab.message-check.helpline.cyber", number: "1930" },
  { key: "lab.message-check.helpline.women", number: "181" },
  { key: "lab.message-check.helpline.emergency", number: "112" },
] as const;

export default async function MessageCheckPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container py-8 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <span className="tag">{t(locale, "lab.message-check.beta")}</span>
            <h1 className="page-title mt-5">{t(locale, "lab.message-check.title")}</h1>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "lab.message-check.intro")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7] text-[var(--ink)]">
              {t(locale, "lab.message-check.cannot")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7]">
              <span className="text-[var(--ink)]">{t(locale, "lab.message-check.under18")}</span>{" "}
              <Link href="/minor-support" className="text-link">
                {t(locale, "lab.message-check.under18.link")}
              </Link>
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CHECKER */}
        <section className="container py-8 md:py-10">
          <MessageCheckForm locale={locale} />
          <p className="muted mx-auto mt-6 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "lab.message-check.notice.privacy")}
          </p>
          <p className="muted mx-auto mt-2 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "lab.message-check.notice.ai")}
          </p>
        </section>

        {/* WHAT TO DO NOW — visible before any check runs: someone in
            distress should not have to run the tool first to find help. */}
        <section className="zone-white section-pad" aria-labelledby="message-check-next">
          <div className="container">
            <div className="mx-auto max-w-2xl">
              <h2 id="message-check-next" className="section-title">{t(locale, "lab.message-check.next.title")}</h2>
              <ol className="mt-6 space-y-4 text-[15px] leading-[1.7] text-[var(--text)]">
                {NEXT_STEPS.map((key, index) => (
                  <li key={key} className="flex gap-3">
                    <span aria-hidden="true" className="min-w-[28px] shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)] pt-[3px]">
                      {index + 1}.
                    </span>
                    <span>{t(locale, key)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn btn-primary" href="/start">{t(locale, "lab.message-check.cta.start")}</Link>
                <Link className="btn btn-secondary" href="/get-help">{t(locale, "lab.message-check.cta.help")}</Link>
              </div>
              <div className="mt-8 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5">
                <p className="text-sm font-medium uppercase tracking-[-0.033em] text-[var(--ink)]">
                  {t(locale, "lab.message-check.helpline.title")}
                </p>
                <ul className="mt-4 grid gap-3 text-pretty sm:grid-cols-3">
                  {HELPLINES.map(({ key, number }) => (
                    <li key={number} className="text-[15px] leading-[1.5] text-[var(--text)]">
                      <strong>{t(locale, key)}:</strong> <a className="text-link" href={`tel:${number}`}>{number}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* BACK TO THE LAB */}
        <section className="container py-8 text-center">
          <Link href="/lab" className="text-link">
            {t(locale, "lab.message-check.back")} <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
