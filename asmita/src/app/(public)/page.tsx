import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function HomePage() {
  const locale = await getLocale();

  const privacyItems = [
    { bold: t(locale, "home.blockB.item1.bold"), detail: t(locale, "home.blockB.item1.rest") },
    { bold: t(locale, "home.blockB.item2.bold"), detail: t(locale, "home.blockB.item2.rest") },
    { bold: t(locale, "home.blockB.item3.bold"), detail: t(locale, "home.blockB.item3.rest") },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO - centered */}
        <section className="container pb-20 pt-10 text-center md:pb-28 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "home.pill")}
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              {t(locale, "home.langNote")}{" "}
              <span lang={locale === "hi" ? "en" : "hi"}>
                {locale === "hi" ? "English" : "हिंदी"}
              </span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "home.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "home.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "home.hero.sub")}
            </p>
            <div className="mt-10 flex justify-center">
              <Link className="btn btn-primary" href="/start">
                {t(locale, "home.hero.cta")}
              </Link>
            </div>
            <p className="mt-6">
              <Link
                href="/minor-support"
                className="text-sm font-medium text-[var(--muted)] link-underline"
              >
                {t(locale, "home.hero.minorLink")}{" "}
                <span className="cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>

            {/* SUPPORTER CREDIT */}
            <div className="mt-10 flex justify-center">
              <span className="cf-badge">
            <svg
              className="cf-badge-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M16.9 15.8c.15-.5.09-.97-.16-1.31-.23-.31-.62-.49-1.09-.51l-8.9-.11a.17.17 0 0 1-.14-.07.18.18 0 0 1-.02-.16.24.24 0 0 1 .2-.15l8.98-.12c1.07-.05 2.22-.9 2.63-1.94l.51-1.3a.3.3 0 0 0 .01-.17A5.86 5.86 0 0 0 7.35 9.4a2.65 2.65 0 0 0-4.14 2.6A3.77 3.77 0 0 0 .3 15.7c0 .18.02.36.04.54.01.09.08.15.17.15h16.02c.1 0 .18-.06.2-.15l.17-.44Z"
                fill="#F6821F"
              />
              <path
                d="M20.1 9.9h-.26a.15.15 0 0 0-.14.1l-.35.98c-.15.5-.09.97.16 1.31.23.31.62.49 1.09.52l1.9.11c.06 0 .11.03.14.07a.18.18 0 0 1 .02.17.24.24 0 0 1-.2.14l-1.97.12c-1.08.05-2.23.9-2.63 1.94l-.14.36c-.03.07.02.14.1.14h6.78a.2.2 0 0 0 .2-.14 4.86 4.86 0 0 0 .17-1.29A4.66 4.66 0 0 0 20.1 9.9Z"
                fill="#FBAD41"
              />
            </svg>
              <span className="cf-badge-text">
                {locale === "hi" ? "Cloudflare for Startups द्वारा समर्थित" : "Supported by Cloudflare for Startups"}
              </span>
              </span>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* VALIDATION - privacy assurance */}
        <section className="container py-12 text-center md:py-16">
          <p className="muted mx-auto max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
            {t(locale, "home.hero.noFetch")}
          </p>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* BLOCK A - your legal rights */}
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-6 block">{t(locale, "home.blockA.eyebrow")}</span>
            <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-start md:gap-16">
              <div>
                <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
                  {t(locale, "home.blockA.title")}
                </h2>
                <p className="muted mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
                  {t(locale, "home.blockA.body")}
                </p>
                <p className="mt-8">
                  <Link href="/how-it-works" className="link-underline text-sm">
                    {t(locale, "home.blockA.link")}{" "}
                    <span className="cta-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                </p>
              </div>
              <div className="hidden md:block">
                {/* Redacted notice preview - the real artifact this platform produces */}
                <div
                  className="w-[300px] rounded-md border border-[var(--border)] bg-white p-6"
                  style={{ boxShadow: "var(--shadow-soft)", transform: "rotate(0.5deg)" }}
                  aria-hidden
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Takedown notice
                  </p>
                  <p className="font-display mt-2 text-[15px] leading-snug">
                    Re: Removal under Rule 3(2)(b), IT Rules 2021
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 rounded-full bg-[var(--hairline)]" />
                    <div className="h-2 w-4/5 rounded-full bg-[var(--hairline)]" />
                    <div className="h-2 w-2/3 rounded-full bg-[var(--foreground)] opacity-70" />
                    <div className="h-2 rounded-full bg-[var(--hairline)]" />
                    <div className="h-2 w-3/5 rounded-full bg-[var(--hairline)]" />
                  </div>
                  <p className="mt-4 font-mono text-[10px] text-[var(--muted)]">
                    PDQ fingerprint only. No image attached.
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--teal)]">
                      Signed
                    </span>
                    <svg width="12" height="10" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="var(--teal)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <p className="muted mt-4 max-w-[300px] text-center text-sm leading-[1.6]">
                  <span className="font-semibold text-[var(--teal)]">{t(locale, "home.blockA.stat")}</span>{" "}
                  {t(locale, "home.blockA.statLabel")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* BLOCK B - privacy commitments */}
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-6 block">{t(locale, "home.blockB.eyebrow")}</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              {t(locale, "home.blockB.title.1")}
              <br />
              {t(locale, "home.blockB.title.2")}
            </h2>
            <ul className="mt-8 divide-y divide-[var(--hairline)]">
              {privacyItems.map(({ bold, detail }) => (
                <li key={bold} className="flex items-start gap-4 py-6">
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                    aria-hidden
                  >
                    <svg
                      width="10"
                      height="8"
                      viewBox="0 0 10 8"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="var(--teal)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <p className="text-base leading-[1.7] md:text-[17px]">
                    <span className="font-semibold text-[var(--foreground)]">
                      {bold}
                    </span>{" "}
                    <span className="text-[var(--muted)]">{detail}</span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-8">
              <Link href="/privacy" className="link-underline text-sm">
                {t(locale, "home.blockB.link")}{" "}
                <span className="cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>
          </div>
        </section>

        {/* CLOSING - full-bleed teal band, invitation not a sales pitch */}
        <section className="band-teal">
          <div className="container pb-20 pt-16 text-center md:pb-28 md:pt-24">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
                {t(locale, "home.closing.title")}
              </h2>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
                {t(locale, "home.closing.body")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-inverse" href="/start">
                  {t(locale, "home.closing.cta1")}
                </Link>
                <Link className="btn btn-ghost-light" href="/faq">
                  {t(locale, "home.closing.cta2")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
