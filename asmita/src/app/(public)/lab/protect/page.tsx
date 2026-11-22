import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { ProtectPanel } from "./ProtectPanel";

export const metadata: Metadata = {
  title: "Photo protection",
  description:
    "An experimental Asmita AI Lab tool: add an invisible protective layer to a photo before posting it, meant to make AI morphing harder. The photo never leaves your device.",
};

export const dynamic = "force-dynamic";

// Photo protection (docs/lab/beta-spec.md WP91): before posting a photo, a
// visitor can add an invisible layer meant to make AI morphing harder. The
// layer is added entirely in the visitor's browser — no suitable model is
// available on the Worker (onnxruntime-node is native code workerd cannot
// load, and the SSCD weights are never in the repo), so the WP's fallback
// ladder lands on a documented simpler perturbation run client-side and the
// photo never leaves the device. Like every Lab tool page it answers 404
// while ENABLE_LAB is off, carries the Beta badge, the one-sentence limits
// note and the site's under-18 pointer, and every string is translated
// (en, hi).

export default async function ProtectPage() {
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
              <h1 className="page-title mt-5">{t(locale, "lab.protect.title")}</h1>
              <p className="mt-4">
                <span className="inline-flex items-center rounded-full border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--brand-strong)]">
                  {t(locale, "lab.protect.beta")}
                </span>
              </p>
              <p className="font-size-large mx-auto mt-5 max-w-xl text-[var(--ink)]">{t(locale, "lab.protect.intro")}</p>
              <p className="muted mx-auto mt-4 max-w-xl text-sm leading-[1.7]">{t(locale, "lab.protect.cannotDo")}</p>
              <p className="mt-6">
                <Link href="/lab" className="btn btn-secondary">
                  {t(locale, "lab.protect.back")}
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* PANEL */}
        <section className="section-pad" aria-label={t(locale, "lab.protect.title")}>
          <div className="container">
            <ProtectPanel locale={locale} />
          </div>
        </section>

        {/* HOW THIS WORKS */}
        <section className="zone-white section-pad" aria-labelledby="protect-explainer">
          <div className="container">
            <h2 id="protect-explainer" className="section-title">{t(locale, "lab.protect.explainer.title")}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-[1.7] text-[var(--text)]">
              {t(locale, "lab.protect.explainer.body")}
            </p>
            <p className="muted mx-auto mt-6 max-w-2xl text-sm leading-[1.7]">{t(locale, "lab.protect.privacy")}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
