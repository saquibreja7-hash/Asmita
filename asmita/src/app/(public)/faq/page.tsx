import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function FaqPage() {
  const locale = await getLocale();

  type Faq = { question: string; answer: string };
  type Section = { eyebrow: string; title: string; items: Faq[] };

  const sections: Section[] = [
    {
      eyebrow: t(locale, "faq.s1.eyebrow"),
      title: t(locale, "faq.s1.title"),
      items: [
        { question: t(locale, "faq.s1.q1"), answer: t(locale, "faq.s1.a1") },
        { question: t(locale, "faq.s1.q2"), answer: t(locale, "faq.s1.a2") },
        { question: t(locale, "faq.s1.q3"), answer: t(locale, "faq.s1.a3") },
        { question: t(locale, "faq.s1.q4"), answer: t(locale, "faq.s1.a4") },
      ],
    },
    {
      eyebrow: t(locale, "faq.s2.eyebrow"),
      title: t(locale, "faq.s2.title"),
      items: [
        { question: t(locale, "faq.s2.q1"), answer: t(locale, "faq.s2.a1") },
        { question: t(locale, "faq.s2.q2"), answer: t(locale, "faq.s2.a2") },
        { question: t(locale, "faq.s2.q3"), answer: t(locale, "faq.s2.a3") },
        { question: t(locale, "faq.s2.q4"), answer: t(locale, "faq.s2.a4") },
      ],
    },
    {
      eyebrow: t(locale, "faq.s3.eyebrow"),
      title: t(locale, "faq.s3.title"),
      items: [
        { question: t(locale, "faq.s3.q1"), answer: t(locale, "faq.s3.a1") },
        { question: t(locale, "faq.s3.q2"), answer: t(locale, "faq.s3.a2") },
        { question: t(locale, "faq.s3.q3"), answer: t(locale, "faq.s3.a3") },
        { question: t(locale, "faq.s3.q4"), answer: t(locale, "faq.s3.a4") },
        { question: t(locale, "faq.s3.q5"), answer: t(locale, "faq.s3.a5") },
      ],
    },
    {
      eyebrow: t(locale, "faq.s4.eyebrow"),
      title: t(locale, "faq.s4.title"),
      items: [
        { question: t(locale, "faq.s4.q1"), answer: t(locale, "faq.s4.a1") },
        { question: t(locale, "faq.s4.q2"), answer: t(locale, "faq.s4.a2") },
        { question: t(locale, "faq.s4.q3"), answer: t(locale, "faq.s4.a3") },
        { question: t(locale, "faq.s4.q4"), answer: t(locale, "faq.s4.a4") },
        { question: t(locale, "faq.s4.q5"), answer: t(locale, "faq.s4.a5") },
      ],
    },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "faq.hero.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "faq.hero.title")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "faq.hero.sub")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FAQ SECTIONS */}
        {sections.map((section, si) => (
          <section key={section.eyebrow} className="container py-14 md:py-20">
            <div className="mx-auto max-w-3xl">
              <span className="eyebrow mb-3 block">{section.eyebrow}</span>
              <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[30px]">
                {section.title}
              </h2>

              <div
                className="mt-8 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                {section.items.map((faq) => (
                  <details key={faq.question} className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-6 px-6 py-5 marker:content-none list-none [&::-webkit-details-marker]:hidden">
                      <span className="font-medium text-[var(--foreground)] text-base leading-[1.5] md:text-[17px]">
                        {faq.question}
                      </span>
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200 group-open:rotate-180"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                      >
                        <path
                          d="M4 6l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>
                    <div className="px-6 pb-6 pt-1">
                      <p className="muted text-base leading-[1.8] md:text-[17px]">
                        {faq.answer}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {si < sections.length - 1 && (
              <div className="mx-auto mt-14 max-w-3xl">
                <div className="hairline" />
              </div>
            )}
          </section>
        ))}

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              {t(locale, "faq.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "faq.closing.body")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                {t(locale, "faq.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary" href="/resources">
                {t(locale, "faq.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
