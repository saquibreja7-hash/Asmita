import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { listPublicOrgPartners } from "@/lib/org-partners";

// The partnerships hub (docs/org/spec.md, 57.1): what partnership means, one
// card per partner type, the admin-managed 'Current partners' list with an
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
        <section className="hero" aria-label={t(locale, "org.partners.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.partners.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.partners.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.partners.sub")}</p>
            </div>
            <Illustration name="page-what-we-do" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="means-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <span className="eyebrow">{t(locale, "org.partners.eyebrow")}</span>
              <h2 id="means-heading" className="section-title mt-3">
                {t(locale, "org.partners.meansTitle")}
              </h2>
              <p className="mt-5 text-[17px] leading-[1.75] text-[var(--text)]">{t(locale, "org.partners.meansBody")}</p>
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="types-heading">
          <div className="transform-content container section-pad">
            <h2 id="types-heading" className="section-title">
              {t(locale, "org.partners.typesTitle")}
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {TYPES.map((type) => (
                <Link key={type.slug} href={type.href} className="card p-7 transition-colors hover:border-[var(--brand)]">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile" aria-hidden>
                      <Icon name={type.icon} />
                    </span>
                    <h3 className="text-[20px] font-semibold text-[var(--ink)]">{t(locale, type.titleKey)}</h3>
                  </div>
                  <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{t(locale, type.bodyKey)}</p>
                </Link>
              ))}
              <div className="card card-elevated p-7">
                <div className="flex items-center gap-3">
                  <span className="icon-tile" aria-hidden>
                    <Icon name="globe" />
                  </span>
                  <h3 className="text-[20px] font-semibold text-[var(--ink)]">{t(locale, "org.partners.card.platforms.title")}</h3>
                </div>
                <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{t(locale, "org.partners.card.platforms.body")}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="arrow-link" href="/for-platforms">
                    {locale === "hi" ? "प्लेटफ़ॉर्म कार्यक्रम" : "Platform programme"}
                  </Link>
                  <Link className="arrow-link" href="/for-platforms/trusted-flagger">
                    {locale === "hi" ? "नोटिस कैसा होता है" : "What a notice contains"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Current partners (57.1 / 57.3): admin-managed, public only. */}
        <section className="zone-white section-pad" aria-labelledby="current-heading">
          <div className="container">
            <h2 id="current-heading" className="section-title">
              {t(locale, "org.partners.currentTitle")}
            </h2>
            {partners.length === 0 ? (
              <div className="mx-auto mt-8 max-w-2xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-10">
                <p className="text-[17px] font-medium leading-[1.6] text-[var(--ink)]">{t(locale, "org.partners.currentEmpty")}</p>
                <Link className="btn btn-secondary btn-arrow !m-0 mt-6" href="/partners/ngos#inquiry">
                  {t(locale, "org.partners.currentEmptyCta")}
                </Link>
              </div>
            ) : (
              <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {partners.map((partner) => (
                  <li key={partner.id} className="card p-7">
                    {partner.logoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={partner.logoPath} alt="" width={160} height={80} className="h-10 w-auto" loading="lazy" decoding="async" />
                    ) : (
                      <span className="pill">{partner.type.replaceAll("_", " ").toLowerCase()}</span>
                    )}
                    <h3 className="mt-4 text-[20px] font-semibold text-[var(--ink)]">
                      {partner.url ? (
                        <a href={partner.url} rel="noopener noreferrer" target="_blank">
                          {partner.name}
                        </a>
                      ) : (
                        partner.name
                      )}
                    </h3>
                    <p className="mt-2 text-[15px] leading-[1.6] text-[var(--text)]">
                      {locale === "hi" && partner.blurbHi ? partner.blurbHi : partner.blurbEn}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="transform-section" aria-labelledby="how-heading">
          <div className="transform-content container section-pad">
            <h2 id="how-heading" className="section-title">
              {t(locale, "org.partners.howTitle")}
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {([1, 2, 3, 4, 5] as const).map((step) => (
                <li key={step} className="card p-7">
                  <p className="eyebrow">{String(step).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-[18px] font-semibold text-[var(--ink)]">
                    {t(locale, `org.partners.how.${step}.title` as Parameters<typeof t>[1])}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-[var(--text)]">
                    {t(locale, `org.partners.how.${step}.body` as Parameters<typeof t>[1])}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="zone-sunset" aria-labelledby="partners-cta-heading">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 id="partners-cta-heading" className="section-title">
                {t(locale, "org.partners.ctaTitle")}
              </h2>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75]">{t(locale, "org.partners.ctaBody")}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a className="btn btn-primary btn-arrow !m-0" href="mailto:hello@meriasmita.org?subject=Partnership">
                  hello@meriasmita.org
                </a>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/what-we-do">
                  {t(locale, "org.partners.ctaRead")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
