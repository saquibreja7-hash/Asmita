import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { Illustration } from "@/components/Illustration";

export default async function StartPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "start.pill")}</span>
            <h1 className="page-title mt-8">
              {t(locale, "start.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "start.hero.title.em")}</em> {t(locale, "start.hero.title.2")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "start.hero.sub")}
            </p>
            {/* The way in sits right under the promise, where she is already reading. */}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link className="btn btn-primary btn-arrow" href="/eligibility">
                {t(locale, "start.adult.cta")}
              </Link>
              <Link className="btn btn-secondary" href="/track">
                {t(locale, "start.track.cta")}
              </Link>
            </div>
            <p className="mt-5 text-sm text-[var(--text-muted)]">
              <Link href="/start/minor" className="link-underline text-[var(--text-muted)] hover:text-[var(--ink)]">
                {t(locale, "start.minor.link")}
              </Link>
            </p>
          </div>
          <Illustration name="start-journey" eager className="page-hero-art" />
        </section>

        {/* SAFETY + CLOSING */}
        <section className="container section-pad">
          <div className="mx-auto grid max-w-3xl gap-6">
            <div
              role="note"
              className="flex flex-col gap-4 rounded-[var(--radius-box)] border border-[var(--line)] border-l-4 border-l-[var(--danger)] bg-[var(--card)] p-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[18px] font-semibold leading-[1.4] text-[var(--ink)]">{t(locale, "start.danger.title")}</p>
                <p className="muted mt-1 text-[15px] leading-[1.6]">{t(locale, "start.danger.body")}</p>
              </div>
              <a href="tel:112" className="btn btn-primary shrink-0 justify-center" aria-label={t(locale, "start.danger.callLabel")}>
                {t(locale, "start.danger.call")}
              </a>
            </div>
            <p className="muted text-[15px] leading-[1.7]">
              {t(locale, "start.readMore")}{" "}
              <Link href="/how-it-works" className="link-underline text-[var(--ink)]">
                {t(locale, "start.howLink")}
              </Link>{" "}
              {t(locale, "start.or")}{" "}
              <Link href="/privacy" className="link-underline text-[var(--ink)]">
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
