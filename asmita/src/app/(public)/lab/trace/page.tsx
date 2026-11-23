import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { labHumanModelBase, labSscdModelUrl } from "@/lib/lab-models";
import { TraceClient } from "./TraceClient";
import { LabCallout, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";

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
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.eyebrow")}
        badge={t(locale, "lab.trace.pill")}
        title={t(locale, "lab.trace.title")}
        intro={<p>{t(locale, "lab.trace.intro")}</p>}
        scene="trace"
      >
        <LabCallout icon="lock">{t(locale, "lab.trace.privacy")}</LabCallout>
      </LabToolHero>

      <LabWorkspace label={t(locale, "lab.trace.results.title")}>
        <TraceClient locale={locale} sscdModelUrl={sscdModelUrl} humanModelBase={humanModelBase} />
      </LabWorkspace>

      <LabSection id="lab-trace-method" index="01" title={t(locale, "lab.trace.method.title")}>
        <LabSteps
          layout="stack"
          steps={(["lab.trace.method.1", "lab.trace.method.2", "lab.trace.method.3", "lab.trace.method.4"] as const).map((key) => (
            <p key={key}>{t(locale, key)}</p>
          ))}
        />
      </LabSection>
    </LabToolShell>
  );
}
