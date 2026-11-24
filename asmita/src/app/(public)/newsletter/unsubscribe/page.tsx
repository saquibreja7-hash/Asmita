import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { NewsletterTokenAction } from "@/components/org/NewsletterTokenAction";

// The unsubscribe link target from every newsletter email (56.7). One
// press with the per-subscriber token; idempotent server-side.

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

const TOKEN = /^[a-f0-9]{16,128}$/;

export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const raw = (await searchParams) || {};
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const valid = TOKEN.test(token);

  return (
    <AppShell>
      <div className="page-canvas lab-theme calm-sub">
        <section className="lab-sub-section" aria-label={t(locale, "org.newsletter.unsubTitle")}>
          <div className="container">
            <div className="newsletter-panel">
              <span className="lab-badge">{t(locale, "org.newsletter.eyebrow")}</span>
              <h1 className="page-title mt-4">{t(locale, "org.newsletter.unsubTitle")}</h1>
              <div className="mt-8 text-left">
                {valid ? (
                  <NewsletterTokenAction locale={locale} token={token} action="unsubscribe" />
                ) : (
                  <div role="alert">
                    <h2 className="subsection-title">{t(locale, "org.newsletter.unsubInvalidTitle")}</h2>
                    <p className="mt-4 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "org.newsletter.unsubInvalidBody")}</p>
                  </div>
                )}
                <p className="mt-8">
                  <Link className="arrow-link" href="/">
                    {locale === "hi" ? "मुखपृष्ठ" : "Home"}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
