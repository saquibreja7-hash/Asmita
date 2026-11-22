import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { TrainingRequestForm } from "@/components/org/TrainingRequestForm";
import { listPublicOrgEvents } from "@/lib/org-events";

// Training and workshops (docs/org/spec.md, 56.6): the programmes as
// content, upcoming and past published sessions, and the booking request
// form. Session length and cost are owner facts and stay placeholders
// until the owner fills them in.

export const metadata: Metadata = {
  title: "Training and workshops",
  description: "Sessions on image-based abuse for colleges, schools, police, workplaces, NGOs and media teams.",
};

const PROGRAMMES = ["college", "school", "police", "workplace", "ngo", "media"] as const;
const PROGRAMME_KEYS = {
  college: "org.training.programme.college.title",
  school: "org.training.programme.school.title",
  police: "org.training.programme.police.title",
  workplace: "org.training.programme.workplace.title",
  ngo: "org.training.programme.ngo.title",
  media: "org.training.programme.media.title",
} as const;
const PROGRAMME_BODIES = {
  college: "org.training.programme.college.body",
  school: "org.training.programme.school.body",
  police: "org.training.programme.police.body",
  workplace: "org.training.programme.workplace.body",
  ngo: "org.training.programme.ngo.body",
  media: "org.training.programme.media.body",
} as const;

const when = (iso: string, locale: "en" | "hi") =>
  new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

export default async function TrainingPage() {
  const locale = await getLocale();
  const { upcoming, past } = await listPublicOrgEvents();

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.training.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.training.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.training.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.training.sub")}</p>
            </div>
            <Illustration name="page-guides" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="programmes-heading">
          <div className="container">
            <h2 id="programmes-heading" className="section-title">
              {t(locale, "org.training.programmesTitle")}
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {PROGRAMMES.map((programme) => (
                <div key={programme} className="card p-7">
                  <h3 className="text-[20px] font-semibold text-[var(--ink)]">{t(locale, PROGRAMME_KEYS[programme])}</h3>
                  <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{t(locale, PROGRAMME_BODIES[programme])}</p>
                  <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm">
                    <Row label={t(locale, "org.training.formatLabel")} value={t(locale, "org.training.format.value")} />
                    <Row label={t(locale, "org.training.languagesLabel")} value={t(locale, "org.training.languages.value")} />
                    <Row label={t(locale, "org.training.lengthLabel")} value="<TO_FILL: session length>" />
                    <Row label={t(locale, "org.training.costLabel")} value="<TO_FILL: cost, or 'free for <TO_FILL>'>" />
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="sessions-heading">
          <div className="transform-content container section-pad">
            <h2 id="sessions-heading" className="section-title">
              {t(locale, "org.training.upcomingTitle")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="muted mt-5 text-[16px] leading-[1.65]">{t(locale, "org.training.noneUpcoming")}</p>
            ) : (
              <ul className="item-cards mt-8">
                {upcoming.map((event) => (
                  <li key={event.id} className="item-card">
                    <Icon name="presentation" className="mt-1 text-[var(--brand)]" />
                    <div>
                      <p className="font-semibold text-[var(--ink)]">{locale === "hi" && event.titleHi ? event.titleHi : event.titleEn}</p>
                      <p className="muted mt-1 text-sm">
                        <time dateTime={event.startsAt}>{when(event.startsAt, locale)}</time>
                        {event.city ? ` · ${event.city}` : ""} ·{" "}
                        {event.mode === "ONLINE"
                          ? t(locale, "org.training.event.online")
                          : event.mode === "IN_PERSON"
                            ? t(locale, "org.training.event.inPerson")
                            : t(locale, "org.training.event.hybrid")}
                      </p>
                      {event.registrationUrl && (
                        <a
                          className="arrow-link mt-3"
                          href={event.registrationUrl}
                          rel="noopener noreferrer"
                        >
                          {t(locale, "org.training.event.register")}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {past.length > 0 && (
              <>
                <h3 className="subsection-title mt-14">{t(locale, "org.training.pastTitle")}</h3>
                <ul className="mt-6 space-y-3">
                  {past.map((event) => (
                    <li key={event.id} className="muted text-sm">
                      {locale === "hi" && event.titleHi ? event.titleHi : event.titleEn} ·{" "}
                      <time dateTime={event.startsAt}>{when(event.startsAt, locale)}</time>
                      {event.city ? ` · ${event.city}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <section className="zone-white section-pad" id="request" aria-labelledby="request-heading">
          <div className="container max-w-3xl">
            <h2 id="request-heading" className="section-title">
              {t(locale, "org.training.requestTitle")}
            </h2>
            <TrainingRequestForm locale={locale} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="eyebrow !text-[12px]">{label}</dt>
      <dd className="text-[var(--text)]">{value}</dd>
    </div>
  );
}
