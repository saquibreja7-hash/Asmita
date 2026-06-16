import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function PrivacyPage() {
  const locale = await getLocale();

  const toc = [
    { num: "01", id: "scope",             title: t(locale, "privacy.toc.01") },
    { num: "02", id: "who-we-are",        title: t(locale, "privacy.toc.02") },
    { num: "03", id: "what-we-collect",   title: t(locale, "privacy.toc.03") },
    { num: "04", id: "what-we-never-collect", title: t(locale, "privacy.toc.04") },
    { num: "05", id: "why-we-collect",    title: t(locale, "privacy.toc.05") },
    { num: "06", id: "legal-basis",       title: t(locale, "privacy.toc.06") },
    { num: "07", id: "how-long",          title: t(locale, "privacy.toc.07") },
    { num: "08", id: "who-we-share-with", title: t(locale, "privacy.toc.08") },
    { num: "09", id: "how-we-protect",    title: t(locale, "privacy.toc.09") },
    { num: "10", id: "your-rights",       title: t(locale, "privacy.toc.10") },
    { num: "11", id: "children",          title: t(locale, "privacy.toc.11") },
    { num: "12", id: "cookies",           title: t(locale, "privacy.toc.12") },
    { num: "13", id: "transfers",         title: t(locale, "privacy.toc.13") },
    { num: "14", id: "breach",            title: t(locale, "privacy.toc.14") },
    { num: "15", id: "changes",           title: t(locale, "privacy.toc.15") },
    { num: "16", id: "contact",           title: t(locale, "privacy.toc.16") },
  ];

  const promises = [
    { bold: t(locale, "privacy.tldr.p1.bold"), detail: t(locale, "privacy.tldr.p1.detail") },
    { bold: t(locale, "privacy.tldr.p2.bold"), detail: t(locale, "privacy.tldr.p2.detail") },
    { bold: t(locale, "privacy.tldr.p3.bold"), detail: t(locale, "privacy.tldr.p3.detail") },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "privacy.hero.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "privacy.hero.title1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "privacy.hero.gradient")}</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "privacy.hero.sub")}
            </p>
            <p className="font-mono mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {t(locale, "privacy.hero.version")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* TL;DR - three promise cards */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "privacy.tldr.eyebrow")}</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              {t(locale, "privacy.tldr.title")}
            </h2>
            <ul className="mt-10 space-y-4">
              {promises.map(({ bold, detail }) => (
                <li
                  key={bold}
                  className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                    aria-hidden
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
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
                    <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                    <span className="text-[var(--muted)]">{detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* TWO-COLUMN: sticky sidebar ToC + scrollable content */}
        <div className="container py-14 md:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="gap-16 md:flex md:items-start">

              {/* SIDEBAR - sticky ToC */}
              <aside className="mb-12 md:mb-0 md:w-56 md:shrink-0">
                <div className="md:sticky md:top-24">
                  <p className="eyebrow mb-4 block">{t(locale, "privacy.toc.label")}</p>
                  <nav aria-label="Privacy policy sections">
                    <ol className="space-y-1">
                      {toc.map((s) => (
                        <li key={s.id}>
                          <a
                            href={`#${s.id}`}
                            className="flex items-baseline gap-2 rounded-md px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--teal-soft)] hover:text-[var(--teal-dark)]"
                          >
                            <span className="font-mono text-[10px] shrink-0 tabular-nums opacity-60">
                              {s.num}
                            </span>
                            <span className="leading-[1.5]">{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </div>
              </aside>

              {/* MAIN CONTENT */}
              <div className="min-w-0 flex-1 space-y-0">
                <PolicySection num="01" id="scope" title={t(locale, "privacy.toc.01")}>
                  <p>{t(locale, "privacy.s01.p1")}</p>
                  <p>{t(locale, "privacy.s01.p2")}</p>
                </PolicySection>

                <PolicySection num="02" id="who-we-are" title={t(locale, "privacy.toc.02")}>
                  <p>{t(locale, "privacy.s02.p1")}</p>
                  <p>{t(locale, "privacy.s02.p2")}</p>
                </PolicySection>

                <PolicySection num="03" id="what-we-collect" title={t(locale, "privacy.toc.03")}>
                  <p>{t(locale, "privacy.s03.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s03.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s03.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="04" id="what-we-never-collect" title={t(locale, "privacy.toc.04")}>
                  <p>{t(locale, "privacy.s04.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s04.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s04.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="05" id="why-we-collect" title={t(locale, "privacy.toc.05")}>
                  <p>{t(locale, "privacy.s05.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s05.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s05.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="06" id="legal-basis" title={t(locale, "privacy.toc.06")}>
                  <p>
                    {t(locale, "privacy.s06.p1a")}{" "}
                    <span className="font-semibold text-[var(--foreground)]">{t(locale, "privacy.s06.p1.bold")}</span>
                    {t(locale, "privacy.s06.p1b")}
                  </p>
                  <p>
                    {t(locale, "privacy.s06.p2a")}{" "}
                    <span className="font-semibold text-[var(--foreground)]">{t(locale, "privacy.s06.p2.bold")}</span>{" "}
                    {t(locale, "privacy.s06.p2b")}
                  </p>
                </PolicySection>

                <PolicySection num="07" id="how-long" title={t(locale, "privacy.toc.07")}>
                  <p>{t(locale, "privacy.s07.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4","i5"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s07.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s07.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="08" id="who-we-share-with" title={t(locale, "privacy.toc.08")}>
                  <p>{t(locale, "privacy.s08.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s08.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s08.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="09" id="how-we-protect" title={t(locale, "privacy.toc.09")}>
                  <p>{t(locale, "privacy.s09.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4","i5","i6"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s09.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s09.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="10" id="your-rights" title={t(locale, "privacy.toc.10")}>
                  <p>{t(locale, "privacy.s10.intro")}</p>
                  <ul className="mt-4 space-y-3">
                    {(["i1","i2","i3","i4","i5"] as const).map((i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--foreground)]">{t(locale, `privacy.s10.${i}.bold` as Parameters<typeof t>[1])}</span>{" "}
                        {t(locale, `privacy.s10.${i}.detail` as Parameters<typeof t>[1])}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="11" id="children" title={t(locale, "privacy.toc.11")}>
                  <p>{t(locale, "privacy.s11.p1")}</p>
                  <p>{t(locale, "privacy.s11.p2")}</p>
                </PolicySection>

                <PolicySection num="12" id="cookies" title={t(locale, "privacy.toc.12")}>
                  <p>{t(locale, "privacy.s12.p1")}</p>
                  <p>{t(locale, "privacy.s12.p2")}</p>
                </PolicySection>

                <PolicySection num="13" id="transfers" title={t(locale, "privacy.toc.13")}>
                  <p>{t(locale, "privacy.s13.p1")}</p>
                  <p>{t(locale, "privacy.s13.p2")}</p>
                </PolicySection>

                <PolicySection num="14" id="breach" title={t(locale, "privacy.toc.14")}>
                  <p>{t(locale, "privacy.s14.p1")}</p>
                  <p>{t(locale, "privacy.s14.p2")}</p>
                </PolicySection>

                <PolicySection num="15" id="changes" title={t(locale, "privacy.toc.15")}>
                  <p>{t(locale, "privacy.s15.p1")}</p>
                </PolicySection>

                <PolicySection num="16" id="contact" title={t(locale, "privacy.toc.16")}>
                  <p>{t(locale, "privacy.s16.p1")}</p>
                  <p>
                    {t(locale, "privacy.s16.p2a")}{" "}
                    <a
                      href="mailto:grievance@meriasmita.org"
                      className="link-underline text-[var(--foreground)]"
                    >
                      grievance@meriasmita.org
                    </a>{" "}
                    {t(locale, "privacy.s16.p2b")}{" "}
                    <Link href="/contact" className="link-underline text-[var(--foreground)]">
                      {t(locale, "privacy.s16.p2c")}
                    </Link>
                    .
                  </p>
                  <p>{t(locale, "privacy.s16.p3")}</p>
                </PolicySection>
              </div>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              {t(locale, "privacy.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "privacy.closing.sub")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                {t(locale, "privacy.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary" href="/start">
                {t(locale, "privacy.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PolicySection({
  num,
  id,
  title,
  children,
}: {
  num: string;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--hairline)] py-10 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-[10px] tabular-nums text-[var(--muted)] opacity-60 shrink-0">
          {num}
        </span>
        <h2 className="font-display text-[20px] font-normal leading-[1.25] tracking-tight md:text-[26px] md:leading-[1.2]">
          {title}
        </h2>
      </div>
      <div className="muted space-y-4 text-[15px] leading-[1.8] md:text-[16px]">
        {children}
      </div>
    </section>
  );
}
