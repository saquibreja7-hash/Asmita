import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function MinorSupportPage() {
  const locale = await getLocale();

  const groups = [
    {
      eyebrow: t(locale, "minor.g1.label"),
      title: t(locale, "minor.g1.title"),
      subtitle: t(locale, "minor.g1.sub"),
      items: [
        {
          name: t(locale, "minor.r1.name"),
          contact: t(locale, "minor.r1.contact"),
          href: "tel:112",
          external: false,
          description: t(locale, "minor.r1.desc"),
        },
        {
          name: t(locale, "minor.r2.name"),
          contact: t(locale, "minor.r2.contact"),
          href: "tel:1098",
          external: false,
          description: t(locale, "minor.r2.desc"),
        },
      ],
    },
    {
      eyebrow: t(locale, "minor.g2.label"),
      title: t(locale, "minor.g2.title"),
      subtitle: t(locale, "minor.g2.sub"),
      items: [
        {
          name: t(locale, "minor.r3.name"),
          contact: t(locale, "minor.r3.contact"),
          href: "https://takeitdown.ncmec.org/",
          external: true,
          description: t(locale, "minor.r3.desc"),
        },
        {
          name: t(locale, "minor.r4.name"),
          contact: t(locale, "minor.r4.contact"),
          href: "https://stopncii.org/",
          external: true,
          description: t(locale, "minor.r4.desc"),
        },
      ],
    },
    {
      eyebrow: t(locale, "minor.g3.label"),
      title: t(locale, "minor.g3.title"),
      subtitle: t(locale, "minor.g3.sub"),
      items: [
        {
          name: t(locale, "minor.r5.name"),
          contact: t(locale, "minor.r5.contact"),
          href: "https://cybercrime.gov.in/",
          external: true,
          description: t(locale, "minor.r5.desc"),
        },
        {
          name: t(locale, "minor.r6.name"),
          contact: t(locale, "minor.r6.contact"),
          href: "https://cyberpeace.org/",
          external: true,
          description: t(locale, "minor.r6.desc"),
        },
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
              {t(locale, "minor.pill")}
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              {t(locale, "minor.langNote")} <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "minor.hero.title.1")}
              <br />
              <em className="not-italic text-gradient">{t(locale, "minor.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "minor.hero.sub")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* VALIDATION */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.5]">
              {t(locale, "minor.validation")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* RESOURCE GROUPS */}
        {groups.map((group, gi) => (
          <div key={group.eyebrow}>
            <section className="container py-14 md:py-20">
              <div className="mx-auto max-w-3xl">
                <span className="eyebrow mb-3 block">{group.eyebrow}</span>
                <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[30px]">
                  {group.title}
                </h2>
                <p className="muted mt-2 text-sm leading-[1.7]">{group.subtitle}</p>
                <div className="mt-6 space-y-3">
                  {group.items.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      aria-label={
                        item.external
                          ? `${item.name} - ${item.contact} (opens in new tab)`
                          : `${item.name} - call ${item.contact}`
                      }
                      className="flex items-start justify-between gap-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                      style={{ boxShadow: "var(--shadow-soft)" }}
                    >
                      <div>
                        <p className="font-semibold text-[var(--foreground)]">{item.name}</p>
                        <p className="muted mt-1 text-sm leading-[1.65]">{item.description}</p>
                      </div>
                      <span className="font-mono shrink-0 text-[15px] font-semibold text-[var(--teal-dark)] md:text-[18px]">
                        {item.contact} {item.external ? "↗" : "→"}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </section>
            {gi < groups.length - 1 && (
              <div className="container">
                <div className="hairline" />
              </div>
            )}
          </div>
        ))}

        <div className="container">
          <div className="hairline" />
        </div>

        {/* WHY NOT ASMITA */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "minor.whyNot.eyebrow")}</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              {t(locale, "minor.whyNot.title")}
            </h2>
            <p className="muted mt-5 max-w-lg text-base leading-[1.75] md:text-[17px]">
              {t(locale, "minor.whyNot.body")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              {t(locale, "minor.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "minor.closing.body")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a className="btn btn-primary" href="tel:1098">
                {t(locale, "minor.closing.cta1")}
              </a>
              <Link className="btn btn-secondary" href="/">
                {t(locale, "minor.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
