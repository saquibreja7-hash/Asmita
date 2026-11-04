import { Illustration } from "@/components/Illustration";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { provenanceCheckEnabled } from "@/lib/dev-flags";
import { ImageChecker } from "./ImageChecker";

export default async function CheckImagePage() {
  const locale = await getLocale();
  const deepCheckEnabled = provenanceCheckEnabled();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "check.pill")}</span>
            <h1 className="page-title mt-8">
              {t(locale, "check.hero.title.1")}{" "}<em className="not-italic text-gradient">{t(locale, "check.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "check.hero.sub")}
            </p>
          </div>
          <Illustration name="page-check-image" eager className="page-hero-art" />
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CHECKER */}
        <section className="container section-pad" aria-label="Image check">
          <ImageChecker locale={locale} deepCheckEnabled={deepCheckEnabled} />
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
