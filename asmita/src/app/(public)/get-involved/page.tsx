import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedCaseStudies } from "@/lib/org-posts";
import { listPublicOrgEvents } from "@/lib/org-events";

// The get-involved hub (docs/org/spec.md, 56.3): one card per way to join,
// the Stories strip from published case studies (56.8), and the small
// 'other ways to help' section that needs no form at all.

export const metadata: Metadata = {
  title: "Get involved",
  description: "Volunteer, partner, work with us, join a workshop or follow the newsletter — help Meri Asmita end image-based abuse.",
};

const CARDS: { href: string; icon: Parameters<typeof Icon>[0]["name"]; titleKey: Parameters<typeof t>[1]; bodyKey: Parameters<typeof t>[1] }[] = [
  { href: "/partners", icon: "handshake", titleKey: "org.getInvolved.cardPartnerTitle", bodyKey: "org.getInvolved.cardPartnerBody" },
  { href: "/volunteer", icon: "users", titleKey: "org.getInvolved.cardVolunteerTitle", bodyKey: "org.getInvolved.cardVolunteerBody" },
  { href: "/careers", icon: "briefcase", titleKey: "org.getInvolved.cardCareersTitle", bodyKey: "org.getInvolved.cardCareersBody" },
  { href: "/training", icon: "presentation", titleKey: "org.getInvolved.cardTrainingTitle", bodyKey: "org.getInvolved.cardTrainingBody" },
  { href: "/news", icon: "newspaper", titleKey: "org.getInvolved.cardNewsTitle", bodyKey: "org.getInvolved.cardNewsBody" },
];

export default async function GetInvolvedPage() {
  const locale = await getLocale();
  const stories = await listPublishedCaseStudies(3);
  const { upcoming } = await listPublicOrgEvents();
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.getInvolved.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.getInvolved.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.getInvolved.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.getInvolved.sub")}</p>
            </div>
            <Illustration name="page-about" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={t(locale, "org.getInvolved.eyebrow")}>
          <div className="container">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {CARDS.map((card) => (
                <Link key={card.href} href={card.href} className="card p-7 transition-colors hover:border-[var(--brand)]">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile" aria-hidden>
                      <Icon name={card.icon} />
                    </span>
                    <h2 className="text-[20px] font-semibold text-[var(--ink)]">{t(locale, card.titleKey)}</h2>
                  </div>
                  <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{t(locale, card.bodyKey)}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Stories strip (56.8): published case studies, with an honest empty state. */}
        <section className="transform-section" aria-labelledby="stories-heading">
          <div className="transform-content container section-pad">
            <span className="eyebrow">{t(locale, "org.getInvolved.storiesEyebrow")}</span>
            <h2 id="stories-heading" className="section-title mt-3">
              {t(locale, "org.getInvolved.storiesTitle")}
            </h2>
            {stories.length === 0 ? (
              <p className="muted mt-5 max-w-2xl text-[16px] leading-[1.65]">{t(locale, "org.getInvolved.storiesEmpty")}</p>
            ) : (
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {stories.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Upcoming sessions (56.6): published events also surface on the hub. */}
        {upcoming.length > 0 && (
          <section className="zone-white section-pad" aria-labelledby="hub-events-heading">
            <div className="container">
              <h2 id="hub-events-heading" className="section-title">
                {t(locale, "org.training.upcomingTitle")}
              </h2>
              <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.slice(0, 3).map((event) => (
                  <li key={event.id} className="card p-7">
                    <p className="text-[17px] font-semibold text-[var(--ink)]">
                      {locale === "hi" && event.titleHi ? event.titleHi : event.titleEn}
                    </p>
                    <p className="muted mt-2 text-sm">
                      <time dateTime={event.startsAt}>{when(event.startsAt)}</time>
                      {event.city ? ` · ${event.city}` : ""}
                    </p>
                    {event.registrationUrl && (
                      <a className="arrow-link mt-4" href={event.registrationUrl} rel="noopener noreferrer">
                        {t(locale, "org.training.event.register")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-8">
                <Link className="arrow-link" href="/training">
                  {t(locale, "org.training.eyebrow")}
                </Link>
              </p>
            </div>
          </section>
        )}

        <section className="transform-section" aria-labelledby="other-ways-heading">
          <div className="transform-content container section-pad">
            <h2 id="other-ways-heading" className="section-title">
              {t(locale, "org.getInvolved.otherTitle")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="surface-card p-7">
                <p className="text-[17px] font-medium text-[var(--ink)]">{t(locale, "org.getInvolved.otherShare")}</p>
                <Link className="arrow-link mt-4" href="/resources">
                  {locale === "hi" ? "संसाधन देखिए" : "See the resources"}
                </Link>
              </div>
              <div className="surface-card p-7">
                <p className="text-[17px] font-medium text-[var(--ink)]">{t(locale, "org.getInvolved.otherFollow")}</p>
                {/* A plain icon for now, not a link: the LinkedIn address is added when it is supplied. */}
                <span className="mt-4 inline-flex text-[var(--brand)]" role="img" aria-label="LinkedIn">
                  <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
                  </svg>
                </span>
              </div>
              <div className="surface-card p-7">
                <p className="text-[17px] font-medium text-[var(--ink)]">{t(locale, "org.getInvolved.otherTell")}</p>
                <Link className="arrow-link mt-4" href="/get-help">
                  {locale === "hi" ? "मदद के पृष्ठ" : "Get help pages"}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label={t(locale, "org.getInvolved.otherTell")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">{t(locale, "org.getInvolved.otherTell")}</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                  {locale === "hi" ? "मदद लें" : "Get help"}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/volunteer">
                  {t(locale, "org.getInvolved.cardVolunteerTitle")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
