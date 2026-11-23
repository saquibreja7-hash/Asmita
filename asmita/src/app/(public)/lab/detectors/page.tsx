import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabCallout, LabLinkCards, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
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
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.detectors.back")}
        badge={t(locale, "lab.detectors.beta")}
        title={t(locale, "lab.detectors.title")}
        intro={
          <>
            <p>{t(locale, "lab.detectors.intro")}</p>
            <p className="text-[15px] text-[var(--text)]">{t(locale, "lab.detectors.cannotDo")}</p>
          </>
        }
        scene="detectors"
      />

      <LabWorkspace label={t(locale, "lab.detectors.title")}>
        <DetectorPanel locale={locale} />
      </LabWorkspace>

      {/* HOW TO READ THIS */}
      <LabSection id="detectors-explainer" index="01" title={t(locale, "lab.detectors.explainer.title")} narrow>
        <LabSteps
          ordered={false}
          layout="stack"
          steps={[
            <p key="body">{t(locale, "lab.detectors.explainer.body")}</p>,
            <p key="limits">{t(locale, "lab.detectors.gend.limits")}</p>,
          ]}
        />
        <LabCallout icon="lock">{t(locale, "lab.detectors.privacy")}</LabCallout>
      </LabSection>

      {/* SOURCES AND CREDITS */}
      <LabSection id="detectors-credits" index="02" title={t(locale, "lab.detectors.credits.title")}>
        <LabLinkCards
          cards={[
            { href: "https://arxiv.org/abs/2508.06248", label: t(locale, "lab.detectors.gend.paper"), note: t(locale, "lab.detectors.credits.gend"), icon: "book", external: true },
            { href: "https://github.com/yermandy/GenD", label: t(locale, "lab.detectors.gend.code"), note: "GenD", icon: "layers", external: true },
            {
              href: "https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet",
              label: t(locale, "lab.detectors.credits.zoo"),
              note: t(locale, "lab.detectors.credits.yunet"),
              icon: "scan",
              external: true,
            },
          ]}
        />
      </LabSection>
    </LabToolShell>
  );
}
