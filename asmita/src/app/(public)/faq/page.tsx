import { Illustration } from "@/components/Illustration";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
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
        { question: t(locale, "faq.s1.q5"), answer: t(locale, "faq.s1.a5") },
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
        { question: t(locale, "faq.s4.q6"), answer: t(locale, "faq.s4.a6") },
      ],
    },
  ];

  const tones = ["teal", "coral", "gold"] as const;
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        badge="FAQ"
        title={t(locale, "faq.hero.title")}
        intro={<p>{t(locale, "faq.hero.sub")}</p>}
        visual={<Illustration name="page-faq" eager className="issue-hero-art" />}
      />

      {/* FAQ SECTIONS: one numbered section each, questions as cards that open. */}
      {sections.map((section, si) => (
        <section key={section.eyebrow} className="lab-sub-section" aria-labelledby={`faq-section-${si}`}>
          <div className="container">
            <header className="lab-section-head">
              <span className="lab-index" aria-hidden="true">
                {String(si + 1).padStart(2, "0")}
              </span>
              <h2 id={`faq-section-${si}`} className="lab-h2">
                {section.title}
              </h2>
            </header>
            <ul className="faq-cards" role="list">
              {section.items.map((faq) => (
                <li key={faq.question} className={`help-scenario issue-tone-${tones[si % tones.length]}`}>
                  <details>
                    <summary>
                      <span className="help-scenario-q">{faq.question}</span>
                      <span className="help-scenario-chev" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    <div className="faq-card-answer">{faq.answer}</div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {/* CLOSING */}
      <section className="lab-sub-section">
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{t(locale, "faq.closing.title")}</h2>
            <p className="issue-close-body">{t(locale, "faq.closing.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary !m-0" href="/contact">
                {t(locale, "faq.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary !m-0" href="/resources">
                {t(locale, "faq.closing.cta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
