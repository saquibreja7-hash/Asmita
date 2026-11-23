import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { OpenToolsDirectory } from "./OpenToolsDirectory";

export const metadata: Metadata = {
  title: "Open tools for trust and safety",
  description:
    "Free, open-source trust-and-safety tools (hashing, review, detection, provenance) explained by the Asmita AI Lab: what each one does, where it fits in a platform's workflow and how to start.",
};

export const dynamic = "force-dynamic";

// The open tools directory (docs/lab/open-tools-spec.md, Part C3). Like every
// Lab page it answers 404 while ENABLE_LAB is off. Static content only: the
// catalogue is typed data in the repository, nothing here stores user input
// or fetches anything at runtime, and the directory works without JavaScript
// (all cards server-rendered; the filters appear after hydration only).

export default async function OpenToolsPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO — left aligned, not centred (Part C3) */}
        <section className="page-hero" aria-label={t(locale, "lab.openTools.title")}>
          <div className="container">
            <span className="eyebrow">{t(locale, "lab.eyebrow")}</span>
            <h1 className="page-title mt-5">{t(locale, "lab.openTools.title")}</h1>
            <p className="ot-lede mt-6">{t(locale, "lab.openTools.lede")}</p>
            <p className="ot-hero-links mt-8">
              <Link className="text-link" href="/lab/stacks">
                {t(locale, "lab.openTools.stacksLink")} <span aria-hidden="true">→</span>
              </Link>
              <Link className="text-link" href="/lab/open-tools/how-we-choose">
                {t(locale, "lab.openTools.howLink")}
              </Link>
            </p>
          </div>
        </section>

        {/* THE DIRECTORY — workflow strip, filters and the grouped cards */}
        <section className="ot-directory" aria-label={t(locale, "lab.openTools.strip.label")}>
          <OpenToolsDirectory tools={OPEN_TOOLS} locale={locale} />
        </section>

        {/* CLOSING BAND — the one gradient the design rules allow */}
        <section className="ot-close" aria-labelledby="ot-suggest">
          <div className="container">
            <div className="ot-close-inner">
              <h2 id="ot-suggest" className="section-title">
                {t(locale, "lab.openTools.suggest.title")}
              </h2>
              <p>{t(locale, "lab.openTools.suggest.body")}</p>
              <Link className="btn btn-secondary" href="/feedback">
                {t(locale, "lab.openTools.suggest.cta")}
              </Link>
            </div>
          </div>
        </section>

        {/* The quiet footer lines, above the site footer */}
        <div className="ot-foot">
          <div className="container">
            <p className="ot-foot-line">{t(locale, "lab.openTools.footer.names")}</p>
            <p className="ot-foot-line">
              {t(locale, "lab.openTools.footer.helpPre")}{" "}
              <Link className="text-link" href="/get-help">
                {t(locale, "lab.openTools.footer.helpLink")}
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
