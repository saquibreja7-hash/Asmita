import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { SCORECARD_MIN_NOTICES } from "@/lib/scorecard";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { ScorecardTable } from "@/components/org/ScorecardTable";
import {
  getPublishedScorecard,
  latestPublishedScorecard,
  listPublishedScorecardPeriods,
  type ScorecardSnapshot,
} from "@/lib/scorecard-snapshots";

// The platform scorecard (docs/org/spec.md, WP58 58.3): the latest published
// snapshot as a sortable table, with earlier periods in a selector, a CSV
// download and the methodology. Before the first publish the route shows the
// honest empty state and nothing links here (AppShell reads
// hasPublishedScorecard for the nav; /research links in only then too).

export const metadata: Metadata = {
  title: "Platform scorecard",
  description:
    "How platforms respond to Meri Asmita's takedown notices: notices sent, share actioned, response times and follow-ups, published quarterly.",
  alternates: { canonical: "/research/platform-scorecard" },
};

// Read from the constants, so the page and the escalation ladder can never
// disagree (the unit test pins this, like the trusted-flagger page's).
export const SCORECARD_DEADLINE_TEXT = t("en", "org.scorecard.m3.body").replace("{hours}", String(PLATFORM_DEADLINE_HOURS));
export const SCORECARD_MIN_NOTICES_TEXT = t("en", "org.scorecard.m4.body").replace("{min}", String(SCORECARD_MIN_NOTICES));

const when = (iso: string, locale: "en" | "hi") =>
  new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );

export default async function PlatformScorecardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const raw = (await searchParams) || {};
  const periods = await listPublishedScorecardPeriods();

  // Drafts are never public; an unknown or unpublished period falls back to
  // the empty state, never to a draft.
  const requested = typeof raw.period === "string" ? raw.period : "";
  const snapshot: ScorecardSnapshot | null = requested
    ? await getPublishedScorecard(requested)
    : await latestPublishedScorecard();

  if (!snapshot) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="hero" aria-label={t(locale, "org.scorecard.eyebrow")}>
            <div className="hero-content container section-pad page-hero-split">
              <div className="mx-auto max-w-3xl text-center">
                <span className="eyebrow">{t(locale, "org.scorecard.eyebrow")}</span>
                <h1 className="page-title mt-5">{t(locale, "org.scorecard.title")}</h1>
              </div>
            </div>
          </section>
          <section className="zone-white section-pad" aria-label={t(locale, "org.scorecard.emptyTitle")}>
            <div className="container">
              <div className="mx-auto max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h2 className="section-title">{t(locale, "org.scorecard.emptyTitle")}</h2>
                <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.65] text-[var(--text)]">
                  {t(locale, "org.scorecard.emptyBody")}
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Link className="btn btn-primary btn-arrow !m-0" href="/research">
                    {t(locale, "org.research.publicationsTitle")}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const note = locale === "hi" ? snapshot.notesHi ?? snapshot.notesEn : snapshot.notesEn;
  const caption = t(locale, "org.scorecard.tableCaption").replace("{period}", snapshot.period);

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.scorecard.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.scorecard.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.scorecard.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                {t(locale, "org.scorecard.sub")}
              </p>
              <p className="muted mt-4 text-sm">
                {t(locale, "org.scorecard.computedOn").replace("{date}", when(snapshot.computedAt, locale))}
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={snapshot.period}>
          <div className="container">
            {/* Earlier periods */}
            {periods.length > 1 && (
              <nav
                aria-label={t(locale, "org.scorecard.periodLabel")}
                className="flex flex-wrap justify-center gap-3"
              >
                {periods.map((period) => (
                  <Link
                    key={period}
                    href={period === periods[0] ? "/research/platform-scorecard" : `/research/platform-scorecard?period=${period}`}
                    aria-current={period === snapshot.period ? "page" : undefined}
                    className={`pill hover:border-[var(--brand)] ${period === snapshot.period ? "border-[var(--brand)] bg-[var(--brand-soft)]" : ""}`}
                  >
                    {period}
                  </Link>
                ))}
              </nav>
            )}

            <div className="mx-auto mt-10 max-w-6xl overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] surface-card p-2 md:p-4">
              <ScorecardTable
                rows={snapshot.data.platforms}
                locale={locale}
                deadlineHours={snapshot.data.deadlineHours}
                caption={caption}
              />
            </div>

            <p className="mt-8 text-center">
              <a
                className="btn btn-secondary btn-arrow !m-0"
                href={`/research/platform-scorecard.csv${snapshot.period === periods[0] ? "" : `?period=${snapshot.period}`}`}
                download
              >
                {t(locale, "org.scorecard.csvLabel")}
              </a>
            </p>

            {note && (
              <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-6">
                <h2 className="text-[17px] font-medium">{t(locale, "org.scorecard.noteTitle")}</h2>
                <p className="mt-2 text-[15px] leading-[1.65] text-[var(--text)]">{note}</p>
              </div>
            )}
          </div>
        </section>

        {/* Methodology */}
        <section className="transform-section" aria-labelledby="scorecard-methodology">
          <div className="transform-content container section-pad">
            <h2 className="section-title" id="scorecard-methodology">
              {t(locale, "org.scorecard.methodologyTitle")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {(
                [
                  ["org.scorecard.m1.title", "org.scorecard.m1.body"],
                  ["org.scorecard.m2.title", "org.scorecard.m2.body"],
                  ["org.scorecard.m3.title", "org.scorecard.m3.body"],
                  ["org.scorecard.m4.title", "org.scorecard.m4.body"],
                  ["org.scorecard.m5.title", "org.scorecard.m5.body"],
                ] as const
              ).map(([titleKey, bodyKey]) => (
                <div key={titleKey} className="rounded-[var(--radius-box)] surface-card p-7">
                  <h3 className="text-[18px] font-medium text-[var(--ink)]">{t(locale, titleKey)}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">
                    {t(locale, bodyKey)
                      .replace("{hours}", String(snapshot.data.deadlineHours))
                      .replace("{min}", String(SCORECARD_MIN_NOTICES))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
