import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function IdentityPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "identity.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              {t(locale, "identity.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "identity.hero.title.em")}</em>{" "}
              {t(locale, "identity.hero.title.2")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "identity.hero.sub")}
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {t(locale, "identity.how.eyebrow")}
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
              {t(locale, "identity.how.title")}
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  {t(locale, "identity.how.item1.bold")}
                </span>{" "}
                {t(locale, "identity.how.item1.rest")}
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  {t(locale, "identity.how.item2.bold")}
                </span>{" "}
                {t(locale, "identity.how.item2.rest")}
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  {t(locale, "identity.how.item3.bold")}
                </span>{" "}
                {t(locale, "identity.how.item3.rest")}
              </li>
            </ul>
          </div>
        </section>

        {/* WHY NOT AADHAAR */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {t(locale, "identity.why.eyebrow")}
            </p>
            <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[32px] md:leading-[1.18]">
              {t(locale, "identity.why.title")}
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "identity.why.body")}
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/submit">
                {t(locale, "identity.cta.submit")}
              </Link>
              <Link className="btn btn-secondary" href="/privacy">
                {t(locale, "identity.cta.privacy")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
