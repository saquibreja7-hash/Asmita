import type { Metadata } from "next";
import Link from "next/link";
import { LINKEDIN_ICON_PATH, LINKEDIN_URL } from "@/lib/social";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { OrgHero } from "@/components/org/OrgHero";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedCaseStudies } from "@/lib/org-posts";

// The get-involved hub (docs/org/spec.md, 56.3): one row per way to join,
// the Stories strip from published case studies (56.8, shown only once one
// is published), and the small 'other ways to help' list.

export const metadata: Metadata = {
  title: "Get involved",
  description: "Volunteer, partner, work with us, join a workshop or follow the newsletter — help Meri Asmita end image-based abuse.",
};

const WAYS: { href: string; icon: Parameters<typeof Icon>[0]["name"]; titleKey: Parameters<typeof t>[1]; bodyKey: Parameters<typeof t>[1] }[] = [
  { href: "/partners", icon: "handshake", titleKey: "org.getInvolved.cardPartnerTitle", bodyKey: "org.getInvolved.cardPartnerBody" },
  { href: "/volunteer", icon: "users", titleKey: "org.getInvolved.cardVolunteerTitle", bodyKey: "org.getInvolved.cardVolunteerBody" },
  { href: "/careers", icon: "briefcase", titleKey: "org.getInvolved.cardCareersTitle", bodyKey: "org.getInvolved.cardCareersBody" },
  { href: "/news", icon: "newspaper", titleKey: "org.getInvolved.cardNewsTitle", bodyKey: "org.getInvolved.cardNewsBody" },
];

export default async function GetInvolvedPage() {
  const locale = await getLocale();
  const stories = await listPublishedCaseStudies(3);

  return (
    <AppShell>
      <div className="page-canvas lab-theme calm-sub">
        <OrgHero title={t(locale, "org.getInvolved.title")} lede={t(locale, "org.getInvolved.sub")} illustration="page-about" />

        <section className="zone-white" aria-label={t(locale, "org.getInvolved.eyebrow")}>
          <div className="container org-section org-section-first">
            <ul className="org-rows org-rows-2">
              {WAYS.map((way) => (
                <li key={way.href}>
                  <Link href={way.href} className="org-row">
                    <span className="org-row-icon" aria-hidden>
                      <Icon name={way.icon} />
                    </span>
                    <h2 className="org-row-title">{t(locale, way.titleKey)}</h2>
                    <p className="org-row-body">{t(locale, way.bodyKey)}</p>
                    <Icon name="arrowRight" className="org-row-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Stories (56.8): only once a case study is published; no empty band. */}
        {stories.length > 0 && (
          <section className="transform-section" aria-labelledby="stories-heading">
            <div className="container org-section">
              <div className="org-head">
                <h2 id="stories-heading" className="section-title">
                  {t(locale, "org.getInvolved.storiesTitle")}
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {stories.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="transform-section" aria-labelledby="other-ways-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="other-ways-heading" className="section-title">
                {t(locale, "org.getInvolved.otherTitle")}
              </h2>
            </div>
            <ul className="org-rows">
              <li>
                <Link href="/resources" className="org-row">
                  <span className="org-row-icon" aria-hidden>
                    <Icon name="clipboard" />
                  </span>
                  <p className="org-row-title">{t(locale, "org.getInvolved.otherShare")}</p>
                  <p className="org-row-meta">{locale === "hi" ? "संसाधन देखिए" : "See the resources"}</p>
                  <Icon name="arrowRight" className="org-row-arrow" />
                </Link>
              </li>
              <li>
                <a className="org-row" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                  <span className="org-row-icon" aria-hidden>
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d={LINKEDIN_ICON_PATH} />
                    </svg>
                  </span>
                  <p className="org-row-title">{t(locale, "org.getInvolved.otherFollow")}</p>
                  <p className="org-row-meta">LinkedIn</p>
                  <Icon name="arrowRight" className="org-row-arrow" />
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section className="org-cta" aria-labelledby="get-involved-cta">
          <div className="container org-cta-inner">
            <h2 id="get-involved-cta" className="section-title">
              {t(locale, "org.getInvolved.otherTell")}
            </h2>
            <div className="org-cta-actions">
              <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                {locale === "hi" ? "मदद लें" : "Get help"}
              </Link>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/volunteer">
                {t(locale, "org.getInvolved.cardVolunteerTitle")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
