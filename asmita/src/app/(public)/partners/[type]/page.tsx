import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { OrgHero } from "@/components/org/OrgHero";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t, type MessageKey } from "@/lib/i18n";
import { PARTNER_FORM_TYPE_SLUGS, type PartnerFormType } from "@/lib/org-forms";
import { PartnerInquiryForm } from "@/components/org/PartnerInquiryForm";

// One page per partner type (docs/org/spec.md, 57.2): what we offer and ask,
// examples of collaboration, a short FAQ, and the inquiry form. The four
// types share this layout; only the strings and the form's field block vary.

const PAGE_BY_TYPE: Record<PartnerFormType, { prefix: string; illustration: string }> = {
  ngos: { prefix: "org.partners.t.ngos", illustration: "audience-helping" },
  legal: { prefix: "org.partners.t.legal", illustration: "page-legal" },
  "law-enforcement": { prefix: "org.partners.t.lawEnforcement", illustration: "page-glossary" },
  academic: { prefix: "org.partners.t.academic", illustration: "page-research" },
};

const OFFER_ITEMS: Record<PartnerFormType, number> = { ngos: 4, legal: 3, "law-enforcement": 3, academic: 3 };
const ASK_ITEMS: Record<PartnerFormType, number> = { ngos: 3, legal: 3, "law-enforcement": 3, academic: 3 };
const EXAMPLE_ITEMS: Record<PartnerFormType, number> = { ngos: 3, legal: 3, "law-enforcement": 3, academic: 3 };
const FAQ_ITEMS: Record<PartnerFormType, number> = { ngos: 3, legal: 3, "law-enforcement": 3, academic: 2 };

const key = (prefix: string, suffix: string) => `${prefix}.${suffix}` as MessageKey;

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  if (!(PARTNER_FORM_TYPE_SLUGS as readonly string[]).includes(type)) return {};
  const meta = PAGE_BY_TYPE[type as PartnerFormType];
  return {
    title: "Partner with us",
    description: t("en", key(meta.prefix, "sub")),
  };
}

export default async function PartnerTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!(PARTNER_FORM_TYPE_SLUGS as readonly string[]).includes(type)) notFound();
  const locale = await getLocale();
  const page = PAGE_BY_TYPE[type as PartnerFormType];
  const p = (suffix: string) => t(locale, key(page.prefix, suffix));
  const offers = Array.from({ length: OFFER_ITEMS[type as PartnerFormType] }, (_, i) => p(`offer.${i + 1}`));
  const asks = Array.from({ length: ASK_ITEMS[type as PartnerFormType] }, (_, i) => p(`ask.${i + 1}`));
  const examples = Array.from({ length: EXAMPLE_ITEMS[type as PartnerFormType] }, (_, i) => p(`examples.${i + 1}`));
  const faqs = Array.from({ length: FAQ_ITEMS[type as PartnerFormType] }, (_, i) => ({
    q: p(`faq.${i + 1}.q`),
    a: p(`faq.${i + 1}.a`),
  }));

  return (
    <AppShell>
      <div className="page-canvas">
        <OrgHero title={p("title")} lede={p("sub")} illustration={page.illustration as Parameters<typeof OrgHero>[0]["illustration"]} />

        <section className="zone-white" aria-labelledby="offer-heading">
          <div className="container org-section org-section-first">
            <div className="org-columns">
              <div>
                <h2 id="offer-heading">{p("offerTitle")}</h2>
                <ul className="org-check">
                  {offers.map((offer) => (
                    <li key={offer}>
                      <Icon name="check" size={16} />
                      <span>{offer}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2>{p("askTitle")}</h2>
                <ul className="org-check">
                  {asks.map((ask) => (
                    <li key={ask}>
                      <Icon name="check" size={16} />
                      <span>{ask}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="org-note">
              <Icon name="shieldCheck" />
              <p>
                <strong>{t(locale, "org.partners.privacy")}</strong>
                {t(locale, "org.partners.privacyBody")}
              </p>
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="examples-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="examples-heading" className="section-title">
                {p("examplesTitle")}
              </h2>
            </div>
            <ol className="org-steps">
              {examples.map((example) => (
                <li key={example}>
                  <p>{example}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="zone-white" aria-labelledby="faq-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="faq-heading" className="section-title">
                {p("faqTitle")}
              </h2>
            </div>
            <div className="border-t border-[var(--line)]">
              {faqs.map((faq) => (
                <details className="faq-item" key={faq.q}>
                  <summary>{faq.q}</summary>
                  <div className="faq-answer">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="transform-section scroll-mt-20" id="inquiry" aria-labelledby="inquiry-heading">
          <div className="container org-section org-aside">
            <div className="org-head org-aside-sticky">
              <h2 id="inquiry-heading" className="section-title">
                {p("formTitle")}
              </h2>
              <p>{p("formIntro")}</p>
            </div>
            <div className="org-form">
              <PartnerInquiryForm type={type as PartnerFormType} locale={locale} />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
