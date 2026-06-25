import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function StartPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "start.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "start.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "start.hero.title.em")}</em> {t(locale, "start.hero.title.2")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "start.hero.sub")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* PATH CARD */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-lg">

            <div
              className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {t(locale, "start.adult.eyebrow")}
              </p>
              <h2 className="mt-3 text-[20px] font-semibold leading-[1.25] tracking-tight text-[var(--foreground)] md:text-[23px]">
                {t(locale, "start.adult.title")}
              </h2>
              <p className="muted mt-3 text-sm leading-[1.75]">
                {t(locale, "start.adult.body")}
              </p>
              <Link className="btn btn-primary mt-7 w-full justify-center" href="/eligibility">
                {t(locale, "start.adult.cta")}
              </Link>
            </div>

            <p className="mt-5 text-center text-sm text-[var(--muted)]">
              <Link href="/start/minor" className="link-underline text-[var(--muted)] hover:text-[var(--foreground)]">
                {t(locale, "start.minor.link")}
              </Link>
            </p>

          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* SAFETY + CLOSING */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-xl space-y-5">
            <p className="text-[18px] font-semibold leading-[1.55] text-[var(--foreground)] md:text-[20px]">
              {t(locale, "start.danger")}{" "}
              <a
                href="tel:112"
                aria-label="Call emergency services 112"
                className="link-underline text-[var(--foreground)]"
              >
                {t(locale, "start.dangerCta")}
              </a>{" "}
              {t(locale, "start.dangerSuffix")}
            </p>
            <p className="muted text-base leading-[1.75]">
              {t(locale, "start.readMore")}{" "}
              <Link href="/how-it-works" className="link-underline text-[var(--foreground)]">
                {t(locale, "start.howLink")}
              </Link>{" "}
              {t(locale, "start.or")}{" "}
              <Link href="/privacy" className="link-underline text-[var(--foreground)]">
                {t(locale, "start.privacyLink")}
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
