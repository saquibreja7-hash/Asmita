import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { labPublicNumbers } from "@/lib/lab/lab-stats";
import { LAB_BETA_TOOLS, LAB_HUB_KEYS } from "@/lib/lab/beta-tools";

export const metadata: Metadata = {
  title: "AI Lab",
  description:
    "The Asmita AI Lab: research on stopping AI-made and morphed intimate images, tracking where they spread, and getting them taken down.",
};

export const dynamic = "force-dynamic";

// The Lab's public page (docs/lab/charter.md): what the Lab is, the
// experiments, and — only while ENABLE_LAB is on — the aggregate E2
// numbers. Every string is translated (en and hi); no service is ever named
// or linked here, and no other research data reaches this page.

const EXPERIMENTS = [
  { title: "lab.exp.e1.title", body: "lab.exp.e1.body" },
  { title: "lab.exp.e2.title", body: "lab.exp.e2.body" },
  { title: "lab.exp.e3.title", body: "lab.exp.e3.body" },
] as const;

export default async function LabPage() {
  const locale = await getLocale();
  const enabled = labEnabled();
  const numbers = enabled ? await labPublicNumbers() : null;

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "lab.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "lab.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "lab.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "lab.intro")}</p>
            </div>
          </div>
        </section>

        {enabled && (
          // WP96 (docs/lab/beta-spec.md): one card per beta tool, each with
          // the Beta badge and one line on what it does. The tools 404 while
          // ENABLE_LAB is off, so the section waits for the same switch — an
          // off Lab never advertises links that answer 404. The tool pages
          // themselves stay gated exactly as their WPs built them.
          <section className="section-pad" aria-labelledby="lab-tools">
            <div className="container">
              <h2 id="lab-tools" className="section-title">{t(locale, LAB_HUB_KEYS.title)}</h2>
              <p className="muted mx-auto mt-4 max-w-2xl text-sm leading-[1.7]">{t(locale, LAB_HUB_KEYS.note)}</p>
              <div className="mx-auto mt-8 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {LAB_BETA_TOOLS.map((tool) => (
                  <div key={tool.href} className="card">
                    <span className="inline-flex items-center rounded-full border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--brand-strong)]">
                      {t(locale, LAB_HUB_KEYS.beta)}
                    </span>
                    <h3 className="mt-3 font-semibold">
                      <Link className="text-link" href={tool.href}>{t(locale, tool.nameKey)}</Link>
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{t(locale, tool.lineKey)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="zone-white section-pad" aria-labelledby="lab-experiments">
          <div className="container">
            <h2 id="lab-experiments" className="section-title">{t(locale, "lab.experiments.title")}</h2>
            <div className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-3">
              {EXPERIMENTS.map((experiment) => (
                <div key={experiment.title} className="card">
                  <h3 className="font-semibold">{t(locale, experiment.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{t(locale, experiment.body)}</p>
                  {enabled && experiment.title === "lab.exp.e3.title" && (
                    <p className="mt-4">
                      <Link className="text-link" href="/lab/trace">{t(locale, "lab.exp.e3.cta")} <span aria-hidden>→</span></Link>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-pad" aria-labelledby="lab-numbers">
          <div className="container">
            <h2 id="lab-numbers" className="section-title">{t(locale, "lab.numbers.title")}</h2>
            {numbers ? (
              <div className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-3">
                <div className="card text-center">
                  <p className="text-3xl font-medium tabular-nums">{numbers.servicesTracked}</p>
                  <p className="mt-1 text-sm">{t(locale, "lab.numbers.services")}</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-medium tabular-nums">{numbers.servicesTakenDown}</p>
                  <p className="mt-1 text-sm">{t(locale, "lab.numbers.takenDown")}</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-medium tabular-nums">{numbers.medianDaysToDown === null ? "—" : numbers.medianDaysToDown.toFixed(1)}</p>
                  <p className="mt-1 text-sm">{t(locale, "lab.numbers.medianDays")}</p>
                </div>
              </div>
            ) : (
              <p className="muted mx-auto mt-8 max-w-2xl text-sm">{t(locale, "lab.numbers.pending")}</p>
            )}
            <p className="muted mx-auto mt-6 max-w-2xl text-sm">{t(locale, "lab.numbers.note")}</p>
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="lab-safety">
          <div className="container">
            <h2 id="lab-safety" className="section-title">{t(locale, "lab.safety.title")}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "lab.safety.body")}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
