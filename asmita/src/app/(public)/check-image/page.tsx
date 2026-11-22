import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { provenanceCheckEnabled } from "@/lib/dev-flags";
import { THORN_DEEPFAKE_SURVEY_URL } from "@/lib/ai-image-research";
import { ImageChecker } from "./ImageChecker";

export default async function CheckImagePage() {
  const locale = await getLocale();
  const deepCheckEnabled = provenanceCheckEnabled();
  // The deeper check only works when the owner has set the OpenAI key as a
  // Worker secret. When it is missing the button is hidden and the page says
  // the check is temporarily unavailable (the route answers the same way).
  const deepCheckConfigured = deepCheckEnabled ? Boolean(process.env.OPENAI_API_KEY) : true;

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container py-8 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <h1 className="page-title">
              {t(locale, "check.hero.title.1")}{" "}<em className="not-italic text-gradient">{t(locale, "check.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "check.hero.sub")}
            </p>
            <p className="mx-auto mt-5 max-w-lg text-base leading-[1.7] text-[var(--ink)]">
              {t(locale, "check.hero.report")}
            </p>
            <p className="muted mx-auto mt-4 max-w-md text-xs leading-[1.7]">
              {t(locale, "check.research.line")}{" "}
              <a className="text-link" href={THORN_DEEPFAKE_SURVEY_URL} target="_blank" rel="noopener noreferrer">
                {t(locale, "check.research.read")} <span aria-hidden>↗</span>
              </a>
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CHECKER */}
        <section className="container py-6 md:py-10" aria-label={t(locale, "check.pill")}>
          <ImageChecker locale={locale} deepCheckEnabled={deepCheckEnabled} deepCheckConfigured={deepCheckConfigured} />
          {/* A pointer to Google's own verifier. Asmita sends nothing to
              Google; she checks the watermark herself, in Google's app. */}
          <p className="muted mx-auto mt-6 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "check.google.line")}
          </p>
          <p className="muted mx-auto mt-4 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "check.privacy.note")}
          </p>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* DISCLAIMER + NEXT STEPS */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-[50ch]">
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
