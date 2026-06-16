import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function MinorSupportPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
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

        {/* VALIDATION */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.5]">
              {t(locale, "minor.validation")}
            </p>
          </div>
        </section>

        {/* EMERGENCY GROUP */}
        <SectionHeader
          label={t(locale, "minor.g1.label")}
          title={t(locale, "minor.g1.title")}
          subtitle={t(locale, "minor.g1.sub")}
        />
        <ResourceBlock
          name={t(locale, "minor.r1.name")}
          contact={t(locale, "minor.r1.contact")}
          href="tel:112"
          external={false}
          description={t(locale, "minor.r1.desc")}
        />
        <ResourceBlock
          name={t(locale, "minor.r2.name")}
          contact={t(locale, "minor.r2.contact")}
          href="tel:1098"
          external={false}
          description={t(locale, "minor.r2.desc")}
        />

        {/* REMOVAL GROUP */}
        <SectionHeader
          label={t(locale, "minor.g2.label")}
          title={t(locale, "minor.g2.title")}
          subtitle={t(locale, "minor.g2.sub")}
        />
        <ResourceBlock
          name={t(locale, "minor.r3.name")}
          contact={t(locale, "minor.r3.contact")}
          href="https://takeitdown.ncmec.org/"
          external={true}
          description={t(locale, "minor.r3.desc")}
        />
        <ResourceBlock
          name={t(locale, "minor.r4.name")}
          contact={t(locale, "minor.r4.contact")}
          href="https://stopncii.org/"
          external={true}
          description={t(locale, "minor.r4.desc")}
        />

        {/* REPORTING GROUP */}
        <SectionHeader
          label={t(locale, "minor.g3.label")}
          title={t(locale, "minor.g3.title")}
          subtitle={t(locale, "minor.g3.sub")}
        />
        <ResourceBlock
          name={t(locale, "minor.r5.name")}
          contact={t(locale, "minor.r5.contact")}
          href="https://cybercrime.gov.in/"
          external={true}
          description={t(locale, "minor.r5.desc")}
        />
        <ResourceBlock
          name={t(locale, "minor.r6.name")}
          contact={t(locale, "minor.r6.contact")}
          href="https://cyberpeace.org/"
          external={true}
          description={t(locale, "minor.r6.desc")}
        />

        {/* WHY NOT ASMITA */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {t(locale, "minor.whyNot.eyebrow")}
            </p>
            <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
              {t(locale, "minor.whyNot.title")}
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "minor.whyNot.body")}
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[40px] md:leading-[1.16]">
              {t(locale, "minor.closing.title")}
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
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

function SectionHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="container pb-6 pt-16 text-center md:pb-8 md:pt-24">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </p>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
          {title}
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
          {subtitle}
        </p>
      </div>
    </section>
  );
}

function ResourceBlock({
  name,
  contact,
  href,
  external,
  description,
}: {
  name: string;
  contact: string;
  href: string;
  external: boolean;
  description: string;
}) {
  return (
    <section className="container py-8 text-center md:py-12">
      <div className="mx-auto max-w-2xl">
        <h3 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[28px] md:leading-[1.18]">
          {name}
        </h3>
        <p className="mt-4">
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            aria-label={
              external
                ? `${name} - ${contact} (opens in new tab)`
                : `${name} - call ${contact}`
            }
            className="font-mono text-[28px] tracking-tight text-[var(--teal-dark)] underline decoration-transparent underline-offset-[6px] transition-colors hover:decoration-[var(--teal-dark)] md:text-[40px]"
          >
            {contact}
          </a>
        </p>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
          {description}
        </p>
      </div>
    </section>
  );
}
