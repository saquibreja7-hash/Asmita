import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { labHumanModelBase, labSscdModelUrl } from "@/lib/lab-models";
import { TraceClient } from "./TraceClient";

export const metadata: Metadata = {
  title: "AI Lab · Trace a morph to its source photo",
  description:
    "The Asmita AI Lab's morph-to-source trace: compare a suspect image with original photos entirely in your browser and see what the similarity does and does not prove.",
};

export const dynamic = "force-dynamic";

// The Lab's trace tool (docs/lab/charter.md, experiment E3): public, behind
// ENABLE_LAB, English and Hindi. The whole analysis runs in the visitor's
// browser — no image is ever uploaded — and the page says so. It is a
// research tool, separate from the survivor complaint filing workflow: the
// evidence PDF it can produce is a standalone document, not part of filing.

export default async function TracePage() {
  const locale = await getLocale();
  const enabled = labEnabled();

  if (!enabled) {
    // While the Lab is switched off the page explains itself instead of
    // running, exactly like the /lab page hides its numbers.
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="hero" aria-label={t(locale, "lab.trace.off.title")}>
            <div className="hero-content container section-pad page-hero-split">
              <div className="mx-auto max-w-3xl text-center">
                <span className="eyebrow">{t(locale, "lab.trace.pill")}</span>
                <h1 className="page-title mt-5">{t(locale, "lab.trace.off.title")}</h1>
                <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "lab.trace.off.body")}</p>
                <Link className="btn btn-primary mt-8" href="/lab">{t(locale, "lab.title")}</Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  // Where the browser fetches its models, if the owner configured them.
  const sscdModelUrl = labSscdModelUrl();
  const humanModelBase = labHumanModelBase();

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "lab.trace.title")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "lab.trace.pill")}</span>
              <h1 className="page-title mt-5">{t(locale, "lab.trace.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "lab.trace.intro")}</p>
              <p className="mx-auto mt-5 max-w-xl rounded-[var(--radius-box)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-[1.6] text-[var(--brand-strong)]">
                {t(locale, "lab.trace.privacy")}
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={t(locale, "lab.trace.results.title")}>
          <div className="container">
            <TraceClient locale={locale} sscdModelUrl={sscdModelUrl} humanModelBase={humanModelBase} />
          </div>
        </section>

        <section className="section-pad" aria-labelledby="lab-trace-method">
          <div className="container">
            <h2 id="lab-trace-method" className="section-title">{t(locale, "lab.trace.method.title")}</h2>
            <div className="mx-auto mt-5 max-w-2xl space-y-4 text-[16px] leading-[1.7] text-[var(--text)]">
              <p>{t(locale, "lab.trace.method.1")}</p>
              <p>{t(locale, "lab.trace.method.2")}</p>
              <p>{t(locale, "lab.trace.method.3")}</p>
              <p>{t(locale, "lab.trace.method.4")}</p>
            </div>
            <p className="mx-auto mt-8 max-w-2xl">
              <Link className="text-link" href="/lab">{t(locale, "lab.eyebrow")} →</Link>
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
