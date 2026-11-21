import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { NewsletterTokenAction } from "@/components/org/NewsletterTokenAction";

// The confirm step of the newsletter double opt-in (56.7). The link in the
// email lands here with a single-use token; the person presses the button
// and the token is checked server-side. A missing or malformed token shows
// the same invalid state as an expired one.

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false },
};

const TOKEN = /^[a-f0-9]{16,128}$/;

export default async function NewsletterConfirmPage({
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
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.newsletter.confirmTitle")}>
          <div className="hero-content container page-hero">
            <div className="mx-auto max-w-xl text-center">
              <span className="eyebrow">{t(locale, "org.newsletter.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.newsletter.confirmTitle")}</h1>
              <div className="mt-8 text-left">
                {valid ? (
                  <NewsletterTokenAction locale={locale} token={token} action="confirm" />
                ) : (
                  <div role="alert">
                    <h2 className="subsection-title">{t(locale, "org.newsletter.tokenInvalidTitle")}</h2>
                    <p className="mt-4 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "org.newsletter.tokenInvalidBody")}</p>
                  </div>
                )}
                <p className="mt-8">
                  <Link className="arrow-link" href="/">
                    {t(locale, "org.newsletter.tokenInvalidCta")}
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
