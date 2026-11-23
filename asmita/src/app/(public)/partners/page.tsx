import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { OrgHero } from "@/components/org/OrgHero";
import { listPublicOrgPartners } from "@/lib/org-partners";

// The partnerships hub (docs/org/spec.md, 57.1): what partnership means, one
// row per partner type, the admin-managed 'Current partners' list with an
// honest empty state, and how a partnership comes together.

export const metadata: Metadata = {
  title: "Partner with us",
  description:
    "Partner with Meri Asmita: NGOs and helplines, legal partners, police and cyber cells, universities and researchers, and platforms.",
};

const TYPES = [
  { slug: "ngos", icon: "heart" as const, titleKey: "org.partners.card.ngos.title", bodyKey: "org.partners.card.ngos.body", href: "/partners/ngos" },
  { slug: "legal", icon: "scale" as const, titleKey: "org.partners.card.legal.title", bodyKey: "org.partners.card.legal.body", href: "/partners/legal" },
  {
    slug: "law-enforcement",
    icon: "shieldCheck" as const,
    titleKey: "org.partners.card.lawEnforcement.title",
    bodyKey: "org.partners.card.lawEnforcement.body",
    href: "/partners/law-enforcement",
  },
  { slug: "academic", icon: "building" as const, titleKey: "org.partners.card.academic.title", bodyKey: "org.partners.card.academic.body", href: "/partners/academic" },
] as const;

export default async function PartnersPage() {
  const locale = await getLocale();
  const partners = await listPublicOrgPartners();

  return (
    <AppShell>
      <div className="page-canvas">
        <OrgHero title={t(locale, "org.partners.title")} lede={t(locale, "org.partners.sub")} illustration="page-what-we-do" />

        <section className="zone-white" aria-labelledby="means-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="means-heading" className="section-title">
                {t(locale, "org.partners.meansTitle")}
              </h2>
            </div>
            <p className="max-w-[62ch] text-[length:var(--text-label)] leading-[1.7] text-[var(--text)]">{t(locale, "org.partners.meansBody")}</p>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="types-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="types-heading" className="section-title">
                {t(locale, "org.partners.typesTitle")}
              </h2>
            </div>
            <ul className="org-rows org-rows-2">
              {TYPES.map((type) => (
                <li key={type.slug}>
                  <Link href={type.href} className="org-row">
                    <span className="org-row-icon" aria-hidden>
                      <Icon name={type.icon} />
                    </span>
                    <h3 className="org-row-title">{t(locale, type.titleKey)}</h3>
                    <p className="org-row-body">{t(locale, type.bodyKey)}</p>
                    <Icon name="arrowRight" className="org-row-arrow" />
                  </Link>
                </li>
              ))}
              <li className="org-rows-span">
                <div className="org-row">
                  <span className="org-row-icon" aria-hidden>
                    <Icon name="globe" />
                  </span>
                  <h3 className="org-row-title">{t(locale, "org.partners.card.platforms.title")}</h3>
                  <p className="org-row-body">{t(locale, "org.partners.card.platforms.body")}</p>
                  <div className="org-row-links">
                    <Link className="arrow-link" href="/for-platforms">
                      {locale === "hi" ? "प्लेटफ़ॉर्म कार्यक्रम" : "Platform programme"}
                    </Link>
                    <Link className="arrow-link" href="/for-platforms/trusted-flagger">
                      {locale === "hi" ? "नोटिस कैसा होता है" : "What a notice contains"}
                    </Link>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Current partners (57.1 / 57.3): admin-managed, public only. */}
        <section className="zone-white" aria-labelledby="current-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="current-heading" className="section-title">
                {t(locale, "org.partners.currentTitle")}
              </h2>
            </div>
            {partners.length === 0 ? (
              <div className="org-empty">
                <p className="text-[1.0625rem] font-medium text-[var(--ink)]">{t(locale, "org.partners.currentEmpty")}</p>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/partners/ngos#inquiry">
                  {t(locale, "org.partners.currentEmptyCta")}
                </Link>
              </div>
            ) : (
              <ul className="org-rows org-rows-2">
                {partners.map((partner) => (
                  <li key={partner.id}>
                    <div className="org-row">
                      <span className="org-row-icon" aria-hidden>
                        {partner.logoPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={partner.logoPath} alt="" width={40} height={40} className="h-7 w-7 object-contain" loading="lazy" decoding="async" />
                        ) : (
                          <Icon name="building" />
                        )}
                      </span>
                      <h3 className="org-row-title">
                        {partner.url ? (
                          <a href={partner.url} rel="noopener noreferrer" target="_blank">
                            {partner.name}
                          </a>
                        ) : (
                          partner.name
                        )}
                      </h3>
                      <p className="org-row-body">{locale === "hi" && partner.blurbHi ? partner.blurbHi : partner.blurbEn}</p>
                      <p className="org-row-meta">{partner.type.replaceAll("_", " ").toLowerCase()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="transform-section" aria-labelledby="how-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="how-heading" className="section-title">
                {t(locale, "org.partners.howTitle")}
              </h2>
            </div>
            <ol className="org-steps">
              {([1, 2, 3, 4, 5] as const).map((step) => (
                <li key={step}>
                  <h3>{t(locale, `org.partners.how.${step}.title` as Parameters<typeof t>[1])}</h3>
                  <p>{t(locale, `org.partners.how.${step}.body` as Parameters<typeof t>[1])}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="org-cta" aria-labelledby="partners-cta-heading">
          <div className="container org-cta-inner">
            <div>
              <h2 id="partners-cta-heading" className="section-title">
                {t(locale, "org.partners.ctaTitle")}
              </h2>
              <p>{t(locale, "org.partners.ctaBody")}</p>
            </div>
            <div className="org-cta-actions">
              <a className="btn btn-primary btn-arrow !m-0" href="mailto:hello@meriasmita.org?subject=Partnership">
                hello@meriasmita.org
              </a>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/what-we-do">
                {t(locale, "org.partners.ctaRead")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
