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
