import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabCallout, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
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
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.protect.back")}
        badge={t(locale, "lab.protect.beta")}
        title={t(locale, "lab.protect.title")}
        intro={
          <>
            <p>{t(locale, "lab.protect.intro")}</p>
            <p className="text-[15px] text-[var(--text)]">{t(locale, "lab.protect.cannotDo")}</p>
          </>
        }
        scene="protect"
      >
        <LabCallout icon="lock">{t(locale, "lab.protect.privacy")}</LabCallout>
      </LabToolHero>

      <LabWorkspace label={t(locale, "lab.protect.title")}>
        <ProtectPanel locale={locale} />
      </LabWorkspace>

      {/* HOW THIS WORKS */}
      <LabSection id="protect-explainer" index="01" title={t(locale, "lab.protect.explainer.title")} narrow>
        <LabSteps ordered={false} layout="stack" steps={[<p key="body">{t(locale, "lab.protect.explainer.body")}</p>]} />
      </LabSection>
    </LabToolShell>
  );
}
