import Link from "next/link";
import { LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
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
    <LabToolShell variant="calm">
      <LabToolHero
        title={`${t(locale, "check.hero.title.1")} ${t(locale, "check.hero.title.2")}`}
        intro={
          <>
            <p>{t(locale, "check.hero.sub")}</p>
            <p className="text-[var(--ink)]">{t(locale, "check.hero.report")}</p>
          </>
        }
      >
        <p className="mt-5 max-w-xl text-xs leading-[1.7] text-[var(--text)]">
          {t(locale, "check.research.line")}{" "}
          <a className="text-link" href={THORN_DEEPFAKE_SURVEY_URL} target="_blank" rel="noopener noreferrer">
            {t(locale, "check.research.read")} <span aria-hidden>↗</span>
          </a>
        </p>
      </LabToolHero>

      {/* CHECKER */}
      <LabWorkspace label={t(locale, "check.pill")}>
        <ImageChecker locale={locale} deepCheckEnabled={deepCheckEnabled} deepCheckConfigured={deepCheckConfigured} />
        {/* A pointer to Google's own verifier. Asmita sends nothing to
            Google; she checks the watermark herself, in Google's app. */}
        <div className="mt-6 grid gap-2 border-t border-[var(--line)] pt-5 text-xs leading-[1.7] text-[var(--text)] sm:grid-cols-2 sm:gap-6">
          <p>{t(locale, "check.google.line")}</p>
          <p>{t(locale, "check.privacy.note")}</p>
        </div>
      </LabWorkspace>

      {/* DISCLAIMER + NEXT STEPS */}
      <section className="lab-sub-section">
        <div className="container">
          <div className="issue-close">
            <p className="issue-close-body !mt-0">{t(locale, "check.disclaimer")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary !m-0" href="/start">
                {t(locale, "check.cta.takedown")}
              </Link>
              <Link className="btn btn-secondary !m-0" href="/how-it-works">
                {t(locale, "check.cta.how")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
