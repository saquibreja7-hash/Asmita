import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { ImageChecker } from "./ImageChecker";

export default async function CheckImagePage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "check.pill")}
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              {t(locale, "check.langNote")}{" "}
              <span lang={locale === "hi" ? "en" : "hi"}>
                {locale === "hi" ? "English" : "हिंदी"}
              </span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[60px] md:leading-[1.06]">
              {t(locale, "check.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "check.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "check.hero.sub")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CHECKER */}
        <section className="container py-14 md:py-20">
          <ImageChecker locale={locale} deepCheckEnabled={process.env.ENABLE_PROVENANCE_CHECK === "true"} />
          <p className="muted mx-auto mt-8 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "check.privacy.note")}
          </p>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* DISCLAIMER + NEXT STEPS */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="muted text-sm leading-[1.8]">{t(locale, "check.disclaimer")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                {t(locale, "check.cta.takedown")}
              </Link>
              <Link className="btn btn-secondary" href="/how-it-works">
                {t(locale, "check.cta.how")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
