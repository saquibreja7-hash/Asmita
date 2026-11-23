import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabCallout, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { SpotTheFakeQuiz } from "./SpotTheFakeQuiz";

/*
 * WP95 (docs/lab/beta-spec.md): the public "Spot the fake" quiz page,
 * /lab/spot-the-fake. Ten rounds, one picture each, a Real / AI-made
 * answer, and one sentence on the tell after every round. The whole quiz
 * runs in the visitor's browser: the rounds are static files under
 * public/lab/spot-the-fake/ served as-is, nothing is stored, no account,
 * no API route, nothing sent anywhere. The page 404s while the Lab is off
 * (it is on in dev and test), like every lab page.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spot the fake: practise recognising AI-made images",
  description:
    "A ten-round practice game that teaches what manipulation looks like: hands, writing, earrings, light, straight lines and skin. Nothing is stored.",
};

// The six tells, in the spec's order, taught below the quiz: the quiz is
// practice, this list is the lesson a visitor can come back to.
const TELLS = [
  { title: "lab.spot-the-fake.tells.text.title", body: "lab.spot-the-fake.tells.text.body" },
  { title: "lab.spot-the-fake.tells.hands.title", body: "lab.spot-the-fake.tells.hands.body" },
  { title: "lab.spot-the-fake.tells.earrings.title", body: "lab.spot-the-fake.tells.earrings.body" },
  { title: "lab.spot-the-fake.tells.lighting.title", body: "lab.spot-the-fake.tells.lighting.body" },
  { title: "lab.spot-the-fake.tells.warping.title", body: "lab.spot-the-fake.tells.warping.body" },
  { title: "lab.spot-the-fake.tells.skin.title", body: "lab.spot-the-fake.tells.skin.body" },
] as const;

export default async function SpotTheFakePage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.spot-the-fake.back")}
        badge={t(locale, "lab.spot-the-fake.beta")}
        title={t(locale, "lab.spot-the-fake.title")}
        intro={
          <>
            <p>{t(locale, "lab.spot-the-fake.intro")}</p>
            <p className="text-[15px] text-[var(--text)]">{t(locale, "lab.spot-the-fake.cannot")}</p>
          </>
        }
        scene="spot-the-fake"
      >
        <LabCallout icon="shieldCheck">
          {t(locale, "lab.spot-the-fake.under18")}{" "}
          <Link href="/minor-support" className="text-link">
            {t(locale, "lab.spot-the-fake.under18.link")}
          </Link>
        </LabCallout>
      </LabToolHero>

      <LabWorkspace label={t(locale, "lab.spot-the-fake.title")}>
        <SpotTheFakeQuiz locale={locale} />
        <p className="mt-6 border-t border-[var(--line)] pt-5 text-xs leading-[1.7] text-[var(--text)]">
          {t(locale, "lab.spot-the-fake.notice.privacy")}
        </p>
      </LabWorkspace>

      {/* THE SIX TELLS: the quiz is practice, this list is the lesson a
          visitor can come back to. */}
      <LabSection id="spot-the-fake-tells" index="01" title={t(locale, "lab.spot-the-fake.tells.title")}>
        <LabSteps
          steps={TELLS.map((tell) => (
            <div key={tell.title}>
              <h3 className="text-[17px] font-semibold leading-[1.3] text-[var(--ink)]">{t(locale, tell.title)}</h3>
              <p className="mt-2">{t(locale, tell.body)}</p>
            </div>
          ))}
        />
      </LabSection>

      {/* WHAT THE GAME TEACHES, and the bridge to the tools that actually
          do something about a worrying real image. */}
      <LabSection id="spot-the-fake-about" index="02" title={t(locale, "lab.spot-the-fake.about.title")} narrow>
        <LabSteps
          ordered={false}
          layout="stack"
          steps={[
            <p key="1">{t(locale, "lab.spot-the-fake.about.body1")}</p>,
            <p key="2">{t(locale, "lab.spot-the-fake.about.body2")}</p>,
          ]}
        />
        <p className="mt-8 text-[16px] leading-[1.7] text-[var(--ink)]">{t(locale, "lab.spot-the-fake.worried")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/check-image">{t(locale, "lab.spot-the-fake.worried.check")}</Link>
          <Link className="btn btn-secondary" href="/get-help">{t(locale, "lab.spot-the-fake.worried.help")}</Link>
        </div>
      </LabSection>
    </LabToolShell>
  );
}
