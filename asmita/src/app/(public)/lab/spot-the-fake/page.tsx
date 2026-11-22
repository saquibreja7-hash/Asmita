import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
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
    "A ten-round practice game that teaches what manipulation looks like — hands, writing, earrings, light, straight lines and skin. Nothing is stored.",
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
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container py-8 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <span className="tag">{t(locale, "lab.spot-the-fake.beta")}</span>
            <h1 className="page-title mt-5">{t(locale, "lab.spot-the-fake.title")}</h1>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "lab.spot-the-fake.intro")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7] text-[var(--ink)]">
              {t(locale, "lab.spot-the-fake.cannot")}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.7]">
              <span className="text-[var(--ink)]">{t(locale, "lab.spot-the-fake.under18")}</span>{" "}
              <Link href="/minor-support" className="text-link">
                {t(locale, "lab.spot-the-fake.under18.link")}
              </Link>
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* THE QUIZ */}
        <section className="container py-8 md:py-10">
          <SpotTheFakeQuiz locale={locale} />
          <p className="muted mx-auto mt-6 max-w-xl text-center text-xs leading-[1.7]">
            {t(locale, "lab.spot-the-fake.notice.privacy")}
          </p>
        </section>

        {/* THE SIX TELLS + WHAT THE GAME TEACHES */}
        <section className="zone-white section-pad" aria-labelledby="spot-the-fake-tells">
          <div className="container">
            <div className="mx-auto max-w-2xl">
              <h2 id="spot-the-fake-tells" className="section-title">
                {t(locale, "lab.spot-the-fake.tells.title")}
              </h2>
              <ul className="mt-8 grid gap-x-10 sm:grid-cols-2">
                {TELLS.map((tell) => (
                  <li key={tell.title} className="border-t border-[var(--line)] py-4">
                    <h3 className="font-display text-[18px] font-normal leading-[1.3] tracking-tight text-[var(--ink)]">
                      {t(locale, tell.title)}
                    </h3>
                    <p className="muted mt-2 text-sm leading-[1.7]">{t(locale, tell.body)}</p>
                  </li>
                ))}
              </ul>

              <h2 className="section-title mt-14">{t(locale, "lab.spot-the-fake.about.title")}</h2>
              <p className="mt-6 text-[15px] leading-[1.75] text-[var(--text)]">{t(locale, "lab.spot-the-fake.about.body1")}</p>
              <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text)]">{t(locale, "lab.spot-the-fake.about.body2")}</p>

              {/* If the image that worries them is real: the bridge to the
                  tools that actually do something about it. */}
              <p className="mt-6 text-[15px] leading-[1.75] text-[var(--text)]">{t(locale, "lab.spot-the-fake.worried")}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="btn btn-primary" href="/check-image">{t(locale, "lab.spot-the-fake.worried.check")}</Link>
                <Link className="btn btn-secondary" href="/get-help">{t(locale, "lab.spot-the-fake.worried.help")}</Link>
              </div>
            </div>
          </div>
        </section>

        {/* BACK TO THE LAB */}
        <section className="container py-8 text-center">
          <Link href="/lab" className="text-link">
            {t(locale, "lab.spot-the-fake.back")} <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
