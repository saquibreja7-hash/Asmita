import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabCallout, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
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
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.stamp.back")}
        badge={t(locale, "lab.stamp.beta")}
        title={t(locale, "lab.stamp.title")}
        intro={
          <>
            <p>{t(locale, "lab.stamp.intro")}</p>
            <p className="text-[15px] text-[var(--text)]">{t(locale, "lab.stamp.cannot")}</p>
          </>
        }
        scene="stamp"
      >
        <LabCallout icon="shieldCheck">
          {t(locale, "lab.stamp.under18")}{" "}
          <Link href="/minor-support" className="text-link">
            {t(locale, "lab.stamp.under18.link")}
          </Link>
        </LabCallout>
      </LabToolHero>

      <LabWorkspace label={t(locale, "lab.stamp.title")}>
        {configured ? (
          <>
            <StampForm locale={locale} />
            <p className="mt-6 border-t border-[var(--line)] pt-5 text-xs leading-[1.7] text-[var(--text)]">
              {t(locale, "lab.stamp.notice.privacy")}
            </p>
          </>
        ) : (
          <div className="mx-auto max-w-xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
            <h2 className="text-[20px] font-semibold leading-[1.3] text-[var(--ink)]">{t(locale, "lab.stamp.notConfigured.title")}</h2>
            <p className="mt-3 text-sm leading-[1.75] text-[var(--text)]">{t(locale, "lab.stamp.notConfigured.body")}</p>
          </div>
        )}
      </LabWorkspace>

      {/* ABOUT THE STAMP */}
      <LabSection id="stamp-about" index="01" title={t(locale, "lab.stamp.about.title")} narrow>
        <LabSteps
          ordered={false}
          layout="stack"
          steps={[<p key="1">{t(locale, "lab.stamp.about.body1")}</p>, <p key="2">{t(locale, "lab.stamp.about.body2")}</p>]}
        />
        <p className="mt-5 text-xs leading-[1.7] text-[var(--text)]">{t(locale, "lab.stamp.about.note")}</p>
      </LabSection>
    </LabToolShell>
  );
}
