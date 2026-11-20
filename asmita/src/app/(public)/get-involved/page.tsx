import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedCaseStudies } from "@/lib/org-posts";

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
  { href: "/newsletter", icon: "mail", titleKey: "org.getInvolved.cardNewsletterTitle", bodyKey: "org.getInvolved.cardNewsletterBody" },
  { href: "/news", icon: "newspaper", titleKey: "org.getInvolved.cardNewsTitle", bodyKey: "org.getInvolved.cardNewsBody" },
];

export default async function GetInvolvedPage() {
  const locale = await getLocale();
  const stories = await listPublishedCaseStudies(3);

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
                  <span className="icon-tile" aria-hidden>
                    <Icon name={card.icon} />
                  </span>
                  <h3 className="mt-4 text-[20px] font-semibold text-[var(--ink)]">{t(locale, card.titleKey)}</h3>
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

        <section className="zone-white section-pad" aria-labelledby="other-ways-heading">
          <div className="container">
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
                <p className="mt-4 text-sm leading-[1.6] text-[var(--danger)]">
                  &lt;TO_FILL: social links&gt;
                </p>
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
