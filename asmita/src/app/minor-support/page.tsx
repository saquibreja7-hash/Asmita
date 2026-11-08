import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { Illustration } from "@/components/Illustration";

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
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "minor.pill")}</span>
            <p className="muted mt-3 text-xs tracking-wide">
              {t(locale, "minor.langNote")} <span lang="hi">हिंदी</span>
            </p>
            <h1 className="page-title-sm mt-8">
              {t(locale, "minor.hero.title.1")}
              <br />
              <em className="not-italic text-gradient">{t(locale, "minor.hero.title.2")}</em>
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "minor.hero.sub")}
            </p>
          </div>
          <Illustration name="audience-young" eager className="page-hero-art" />
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* VALIDATION */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--ink)] md:text-[24px] md:leading-[1.5]">
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
            <section className="container section-pad">
              <div className="mx-auto max-w-3xl">
                <span className="eyebrow mb-3 block">{group.eyebrow}</span>
                <h2 className="section-title">
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
                      className="flex items-start justify-between gap-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-6 py-5 transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
                    >
                      <div>
                        <p className="font-medium text-[var(--ink)]">{item.name}</p>
                        <p className="muted mt-1 text-sm leading-[1.65]">{item.description}</p>
                      </div>
                      <span className="shrink-0 text-[15px] font-medium text-[var(--brand-strong)] md:text-[18px]">
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
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "minor.whyNot.eyebrow")}</span>
            <h2 className="section-title">
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
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="section-title">
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
