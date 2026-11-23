import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { LabScene, type LabSceneKind, type LabTone } from "@/components/lab/LabScene";
import { LAB_BETA_TOOLS, LAB_HUB_KEYS, LAB_HUB_SECTIONS } from "@/lib/lab/beta-tools";

export const metadata: Metadata = {
  title: "AI Lab",
  description:
    "The Asmita AI Lab: research on stopping AI-made and morphed intimate images, tracking where they spread, and getting them taken down.",
};

export const dynamic = "force-dynamic";

// The Lab's public page (docs/lab/charter.md): what the Lab is, the
// experiments and the beta tools. Every string is translated (en and hi); no
// service is ever named or linked here, and no other research data reaches
// this page. The hub has its own look (.lab-theme, site-styles.css): a light
// gradient page with one decorative Three.js scene per tool (LabScene).
// ?look=night shows the dark "observatory" version of the same page, kept
// for comparison while the design is chosen.

const EXPERIMENTS = [
  { title: "lab.exp.e1.title", body: "lab.exp.e1.body", accent: "teal" },
  { title: "lab.exp.e2.title", body: "lab.exp.e2.body", accent: "violet" },
  { title: "lab.exp.e3.title", body: "lab.exp.e3.body", accent: "coral" },
] as const;

const SCENES: Record<string, LabSceneKind> = {
  "/lab/open-tools": "open-tools",
  "/lab/stacks": "stacks",
  "/lab/trace": "trace",
  "/lab/detectors": "detectors",
  "/lab/protect": "protect",
  "/lab/tracker": "tracker",
  "/lab/message-check": "message-check",
  "/lab/stamp": "stamp",
  "/lab/spot-the-fake": "spot-the-fake",
};

/** "E1 · Detector benchmark" → ["E1", "Detector benchmark"]; other shapes stay whole. */
function splitExperimentTitle(title: string): [string | null, string] {
  const parts = title.split(" · ");
  return parts.length === 2 ? [parts[0], parts[1]] : [null, title];
}

export default async function LabPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const tone: LabTone = (await searchParams)?.look === "night" ? "night" : "light";
  const enabled = labEnabled();
  const cards = [
    ...LAB_HUB_SECTIONS.map((entry) => ({ ...entry, beta: false })),
    ...LAB_BETA_TOOLS.map((entry) => ({ ...entry, beta: true })),
  ];

  return (
    <AppShell>
      <div className={`page-canvas lab-theme ${tone === "night" ? "lab-night" : "lab-light"}`}>
        <section className="lab-hero" aria-label={t(locale, "lab.eyebrow")}>
          <div className="container lab-hero-copy">
            <span className="lab-eyebrow">
              <span className="lab-pulse" aria-hidden="true" />
              {t(locale, "lab.eyebrow")}
            </span>
            <h1 className="lab-title">{t(locale, "lab.title")}</h1>
            <p className="lab-lede">{t(locale, "lab.intro")}</p>
          </div>
          <LabScene kind="hero" tone={tone} className="lab-hero-scene" />
        </section>

        {enabled && (
          // WP96 (docs/lab/beta-spec.md): one card per beta tool, each with
          // the Beta badge and one line on what it does. The tools 404 while
          // ENABLE_LAB is off, so the section waits for the same switch — an
          // off Lab never advertises links that answer 404.
          <section className="lab-section" aria-labelledby="lab-tools">
            <div className="container">
              <header className="lab-section-head">
                <span className="lab-index" aria-hidden="true">01</span>
                <h2 id="lab-tools" className="lab-h2">{t(locale, LAB_HUB_KEYS.title)}</h2>
                <p className="lab-section-note">{t(locale, LAB_HUB_KEYS.note)}</p>
              </header>
              <ul className="lab-grid" role="list">
                {cards.map((card, i) => (
                  <li key={card.href} className="lab-card" style={{ ["--i" as string]: i }}>
                    <LabScene kind={SCENES[card.href] ?? "open-tools"} tone={tone} className="lab-card-scene" />
                    <div className="lab-card-body">
                      {card.beta && <span className="lab-badge">{t(locale, LAB_HUB_KEYS.beta)}</span>}
                      <h3 className="lab-card-title">
                        <Link className="lab-card-link" href={card.href}>
                          {t(locale, card.nameKey)}
                        </Link>
                      </h3>
                      <p className="lab-card-line">{t(locale, card.lineKey)}</p>
                      <span className="lab-card-go" aria-hidden="true">
                        →
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="lab-section" aria-labelledby="lab-experiments">
          <div className="container">
            <header className="lab-section-head">
              <span className="lab-index" aria-hidden="true">{enabled ? "02" : "01"}</span>
              <h2 id="lab-experiments" className="lab-h2">{t(locale, "lab.experiments.title")}</h2>
            </header>
            <div className="lab-experiments">
              {EXPERIMENTS.map((experiment) => {
                const [code, title] = splitExperimentTitle(t(locale, experiment.title));
                return (
                  <article key={experiment.title} className={`lab-experiment lab-accent-${experiment.accent}`}>
                    {code && (
                      <span className="lab-experiment-code" aria-hidden="true">
                        {code}
                      </span>
                    )}
                    <h3 className="lab-card-title">
                      {code && <span className="sr-only">{code} · </span>}
                      {title}
                    </h3>
                    <p className="lab-card-line">{t(locale, experiment.body)}</p>
                    {enabled && experiment.title === "lab.exp.e3.title" && (
                      <p className="mt-5">
                        <Link className="lab-text-link" href="/lab/trace">
                          {t(locale, "lab.exp.e3.cta")} <span aria-hidden>→</span>
                        </Link>
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lab-section lab-section-last" aria-labelledby="lab-safety">
          <div className="container">
            <div className="lab-ethics">
              <span className="lab-index" aria-hidden="true">{enabled ? "03" : "02"}</span>
              <h2 id="lab-safety" className="lab-h2">{t(locale, "lab.safety.title")}</h2>
              <p className="lab-ethics-body">{t(locale, "lab.safety.body")}</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
