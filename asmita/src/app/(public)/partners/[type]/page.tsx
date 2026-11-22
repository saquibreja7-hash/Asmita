import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
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
        <section className="hero" aria-label={p("title")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{p("eyebrow")}</span>
              <h1 className="page-title mt-5">{p("title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{p("sub")}</p>
            </div>
            <Illustration name={page.illustration as Parameters<typeof Illustration>[0]["name"]} eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="offer-heading">
          <div className="container">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card p-7 md:p-8">
                <h2 id="offer-heading" className="subsection-title">
                  {p("offerTitle")}
                </h2>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.65] text-[var(--text)]">
                  {offers.map((offer) => (
                    <li key={offer} className="flex gap-3">
                      <span aria-hidden className="mt-0.5 text-[var(--brand)]">
                        <Icon name="check" size={16} />
                      </span>
                      <span>{offer}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card p-7 md:p-8">
                <h2 className="subsection-title">{p("askTitle")}</h2>
                <ul className="mt-6 space-y-4 text-[15px] leading-[1.65] text-[var(--text)]">
                  {asks.map((ask) => (
                    <li key={ask} className="flex gap-3">
                      <span aria-hidden className="mt-0.5 text-[var(--brand)]">
                        <Icon name="check" size={16} />
                      </span>
                      <span>{ask}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="callout mt-8">
              <Icon name="shieldCheck" className="mt-0.5 text-[var(--brand)]" />
              <div>
                <p className="font-medium">{t(locale, "org.partners.privacy")}</p>
                <p className="mt-1 text-[15px] font-normal">{t(locale, "org.partners.privacyBody")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="examples-heading">
          <div className="transform-content container section-pad">
            <h2 id="examples-heading" className="section-title">
              {p("examplesTitle")}
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {examples.map((example, index) => (
                <div key={example} className="surface-card p-7">
                  <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[var(--text)]">{example}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="faq-heading">
          <div className="container">
            <div className="mx-auto max-w-3xl">
              <h2 id="faq-heading" className="section-title">
                {p("faqTitle")}
              </h2>
              <div className="mt-8 border-t border-[var(--line)]">
                {faqs.map((faq) => (
                  <details className="faq-item" key={faq.q}>
                    <summary>{faq.q}</summary>
                    <div className="faq-answer">{faq.a}</div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="transform-section scroll-mt-20" id="inquiry" aria-labelledby="inquiry-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <h2 id="inquiry-heading" className="section-title">
                {p("formTitle")}
              </h2>
              <p className="muted mx-auto mt-5 max-w-xl text-base leading-[1.7]">{p("formIntro")}</p>
              <PartnerInquiryForm type={type as PartnerFormType} locale={locale} />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
