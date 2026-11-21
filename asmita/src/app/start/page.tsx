import { QuickExit } from "@/components/QuickExit";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function StartPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={false} />
      <div className="page-canvas">
        <section className="container py-9 md:py-16">
          <div className="mx-auto max-w-xl">
            <h1 className="page-title">{t(locale, "start.title")}</h1>
            <p className="muted mt-4 max-w-prose text-base leading-relaxed">{t(locale, "start.hero.sub")}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link className="btn btn-primary btn-arrow" href="/eligibility">
                {t(locale, "start.adult.cta")}
              </Link>
              <Link href="/start/minor" className="link-underline">
                {t(locale, "start.minor.link")}
              </Link>
              <Link href="/track" className="link-underline">
                {t(locale, "start.track.link")}
              </Link>
            </div>
          </div>
        </section>

        {/* SAFETY + CLOSING */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-xl space-y-5">
            <p className="text-balance text-[18px] font-medium leading-[1.55] text-[var(--ink)] md:text-[20px]">
              {t(locale, "start.danger")}{" "}
              <a
                href="tel:112"
                aria-label={t(locale, "start.dangerCall.label")}
                className="link-underline text-[var(--ink)]"
              >
                {t(locale, "start.dangerCta")}
              </a>{" "}
              {t(locale, "start.dangerSuffix")}
            </p>
            <p className="muted text-balance text-base leading-[1.75]">
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
