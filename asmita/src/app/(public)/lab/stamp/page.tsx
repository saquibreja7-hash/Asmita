import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { stampSigningConfigured } from "@/lib/lab/stamp/signing-config";
import { StampForm } from "./StampForm";

/*
 * WP94 (docs/lab/beta-spec.md): the public Content Credentials stamp tool,
 * /lab/stamp. A visitor adds a C2PA Content Credentials stamp to their own
 * photo so copies that keep the file can be traced back to it. The stamping
 * key comes from the environment (LAB_C2PA_CERT / LAB_C2PA_KEY); without
 * it the page explains that signing is not configured and offers nothing.
 * The page 404s while the Lab is off (it is on in dev and test), like
 * every lab page.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stamp your photo with Content Credentials",
  description:
    "Add a Content Credentials stamp to your photo before you post it: your name, the date, and a do-not-train statement inside the file. Nothing is stored or logged.",
};

export default async function StampPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();
  const configured = stampSigningConfigured();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container py-8 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <span className="tag">{t(locale, "lab.stamp.beta")}</span>
            <h1 className="page-title mt-5">{t(locale, "lab.stamp.title")}</h1>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "lab.stamp.intro")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7] text-[var(--ink)]">
              {t(locale, "lab.stamp.cannot")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7]">
              <span className="text-[var(--ink)]">{t(locale, "lab.stamp.under18")}</span>{" "}
              <Link href="/minor-support" className="text-link">
                {t(locale, "lab.stamp.under18.link")}
              </Link>
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* THE TOOL */}
        <section className="container py-8 md:py-10">
          {configured ? (
            <>
              <StampForm locale={locale} />
              <p className="muted mx-auto mt-6 max-w-xl text-center text-xs leading-[1.7]">
                {t(locale, "lab.stamp.notice.privacy")}
              </p>
            </>
          ) : (
            <div className="mx-auto max-w-xl">
              <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
                <h2 className="font-display text-[20px] font-normal leading-[1.3] tracking-tight text-[var(--ink)]">
                  {t(locale, "lab.stamp.notConfigured.title")}
                </h2>
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "lab.stamp.notConfigured.body")}</p>
              </div>
            </div>
          )}
        </section>

        {/* ABOUT THE STAMP */}
        <section className="zone-white section-pad" aria-labelledby="stamp-about">
          <div className="container">
            <div className="mx-auto max-w-2xl">
              <h2 id="stamp-about" className="section-title">{t(locale, "lab.stamp.about.title")}</h2>
              <p className="mt-6 text-[15px] leading-[1.75] text-[var(--text)]">{t(locale, "lab.stamp.about.body1")}</p>
              <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text)]">{t(locale, "lab.stamp.about.body2")}</p>
              <p className="muted mt-6 text-xs leading-[1.7]">{t(locale, "lab.stamp.about.note")}</p>
            </div>
          </div>
        </section>

        {/* BACK TO THE LAB */}
        <section className="container py-8 text-center">
          <Link href="/lab" className="text-link">
            {t(locale, "lab.stamp.back")} <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
