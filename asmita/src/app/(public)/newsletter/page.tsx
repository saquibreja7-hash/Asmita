import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { NewsletterInlineForm } from "@/components/org/NewsletterInlineForm";

// The newsletter page (docs/org/spec.md, 56.7): what we send, how often
// (a placeholder until the owner sets the cadence), and the sign-up form.
// The compact footer form lives in the site footer.

export const metadata: Metadata = {
  title: "Newsletter",
  description: "One email when Meri Asmita has news, research or a campaign. No spam. Unsubscribe any time.",
};

export default async function NewsletterPage() {
  const locale = await getLocale();
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.newsletter.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.newsletter.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.newsletter.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.newsletter.sub")}</p>
            </div>
            <Illustration name="page-contact" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={t(locale, "org.newsletter.whatTitle")}>
          <div className="container max-w-2xl">
            <div className="card-elevated card p-8 md:p-12">
              <h2 className="section-title">{t(locale, "org.newsletter.whatTitle")}</h2>
              <p className="mt-4 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "org.newsletter.whatBody")}</p>
              <p className="mt-6">
                <span className="eyebrow">{t(locale, "org.newsletter.frequencyLabel")}</span>
              </p>
              <p className="mt-2 text-[16px] font-medium text-[var(--danger)]">&lt;TO_FILL: frequency&gt;</p>
              <div className="mt-8">
                <NewsletterInlineForm locale={locale} source="newsletter" />
              </div>
              <p className="muted mx-auto mt-6 max-w-md text-center text-xs leading-[1.7]">{t(locale, "org.newsletter.privacyNote")}</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
