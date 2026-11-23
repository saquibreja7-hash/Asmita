import { QuickExit } from "@/components/QuickExit";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { Icon } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";

export default async function StartPage() {
  const locale = await getLocale();
  // The watch entry point is offered only while the features it needs are on:
  // no dead links. /watch itself says the same if it is reached directly.
  const watchAvailable = process.env.ENABLE_HASH_UPLOAD === "true" && crawlerEnabled();

  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={false} />
      <div className="page-canvas">
        {/* Action first: title, one line, the start button and the two side
            paths, with the journey scene beside them (below on phones). */}
        <section className="hero" aria-label={t(locale, "start.title")}>
          <div className="hero-content container org-hero page-hero-split">
            <div className="max-w-xl">
              <h1 className="page-title">{t(locale, "start.title")}</h1>
              <p className="org-hero-lede">{t(locale, "start.hero.sub")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link className="btn btn-primary btn-arrow !m-0" href="/eligibility">
                  {t(locale, "start.adult.cta")}
                </Link>
                <Link href="/track" className="link-underline">
                  {t(locale, "start.track.link")}
                </Link>
              </div>
              <Link href="/start/minor" className="start-minor mt-8">
                <Icon name="shieldCheck" />
                <span>{t(locale, "start.minor.link")}</span>
                <Icon name="arrowRight" className="start-minor-arrow" />
              </Link>
            </div>
            <Illustration name="start-journey" eager className="page-hero-art" />
          </div>
        </section>

        {watchAvailable && (
          <section className="zone-white" aria-labelledby="start-watch">
            <div className="container org-section">
              <div className="org-empty">
                <div>
                  <h2 id="start-watch">{t(locale, "start.watch.title")}</h2>
                  <p>{t(locale, "start.watch.body")}</p>
                </div>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/watch">
                  {t(locale, "start.watch.cta")}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* SAFETY + CLOSING */}
        <section className="zone-sunset" aria-label={t(locale, "start.dangerCall.label")}>
          <div className="zone-sunset-content container org-cta-inner">
            <p className="max-w-[30ch] text-balance text-[length:var(--text-body-lg)] font-semibold leading-[1.4] text-[var(--ink)] md:text-[length:var(--text-subheading)]">
              {t(locale, "start.danger")}{" "}
              <a href="tel:112" aria-label={t(locale, "start.dangerCall.label")} className="link-underline text-[var(--ink)]">
                {t(locale, "start.dangerCta")}
              </a>{" "}
              {t(locale, "start.dangerSuffix")}
            </p>
            <p className="max-w-[44ch] text-base leading-[1.7] text-[var(--ink)]">
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
