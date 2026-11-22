import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { DetectorPanel } from "./DetectorPanel";

export const metadata: Metadata = {
  title: "Detector panel",
  description:
    "An experimental Asmita AI Lab tool: upload one image and see what several AI-made and manipulated image detectors say about it, side by side.",
};

export const dynamic = "force-dynamic";

// The detector panel (docs/lab/beta-spec.md WP90). One image, several
// "AI-made or manipulated" detectors, side by side — a research tool that
// never claims certainty. Like every Lab tool page it answers 404 while
// ENABLE_LAB is off, carries the Beta badge, the one-sentence limits note
// and the site's under-18 pointer, and every string is translated (en, hi).
// WP113 adds the fourth row: GenD, the Lab's own open-model face-swap
// detector service, with the credits disclosure every research tool owes
// its sources.

export default async function DetectorPanelPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={t(locale, "lab.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-2xl text-center">
              <span className="eyebrow">{t(locale, "lab.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "lab.detectors.title")}</h1>
              <p className="mt-4">
                <span className="inline-flex items-center rounded-full border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--brand-strong)]">
                  {t(locale, "lab.detectors.beta")}
                </span>
              </p>
              <p className="font-size-large mx-auto mt-5 max-w-xl text-[var(--ink)]">{t(locale, "lab.detectors.intro")}</p>
              <p className="muted mx-auto mt-4 max-w-xl text-sm leading-[1.7]">{t(locale, "lab.detectors.cannotDo")}</p>
              <p className="mt-6">
                <Link href="/lab" className="btn btn-secondary">
                  {t(locale, "lab.detectors.back")}
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* PANEL */}
        <section className="section-pad" aria-label={t(locale, "lab.detectors.title")}>
          <div className="container">
            <DetectorPanel locale={locale} />
          </div>
        </section>

        {/* HOW TO READ THIS */}
        <section className="zone-white section-pad" aria-labelledby="detectors-explainer">
          <div className="container">
            <h2 id="detectors-explainer" className="section-title">{t(locale, "lab.detectors.explainer.title")}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-[1.7] text-[var(--text)]">
              {t(locale, "lab.detectors.explainer.body")}
            </p>
            <p className="muted mx-auto mt-4 max-w-2xl text-sm leading-[1.7]">
              {t(locale, "lab.detectors.gend.limits")}
            </p>
            <p className="muted mx-auto mt-6 max-w-2xl text-sm leading-[1.7]">{t(locale, "lab.detectors.privacy")}</p>
          </div>
        </section>

        {/* SOURCES AND CREDITS */}
        <section className="section-pad" aria-labelledby="detectors-credits">
          <div className="container">
            <h2 id="detectors-credits" className="section-title">{t(locale, "lab.detectors.credits.title")}</h2>
            <ul className="mx-auto mt-5 max-w-2xl space-y-4 text-[15px] leading-[1.7] text-[var(--text)]">
              <li>
                {t(locale, "lab.detectors.credits.gend")}{" "}
                <a
                  href="https://arxiv.org/abs/2508.06248"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                >
                  {t(locale, "lab.detectors.gend.paper")}
                </a>
                {" · "}
                <a
                  href="https://github.com/yermandy/GenD"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                >
                  {t(locale, "lab.detectors.gend.code")}
                </a>
              </li>
              <li>
                {t(locale, "lab.detectors.credits.yunet")}{" "}
                <a
                  href="https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                >
                  {t(locale, "lab.detectors.credits.zoo")}
                </a>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
