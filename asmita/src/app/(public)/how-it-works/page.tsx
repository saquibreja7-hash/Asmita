import { Illustration } from "@/components/Illustration";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function HowItWorksPage() {
  const locale = await getLocale();

  const steps = [
    { num: "01", title: t(locale, "hiw.step1.title"), body: t(locale, "hiw.step1.body") },
    { num: "02", title: t(locale, "hiw.step2.title"), body: t(locale, "hiw.step2.body") },
    { num: "03", title: t(locale, "hiw.step3.title"), body: t(locale, "hiw.step3.body") },
    { num: "04", title: t(locale, "hiw.step4.title"), body: t(locale, "hiw.step4.body") },
    { num: "05", title: t(locale, "hiw.step5.title"), body: t(locale, "hiw.step5.body") },
    { num: "06", title: t(locale, "hiw.step6.title"), body: t(locale, "hiw.step6.body") },
  ];

  const tierIconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const tiers = [
    {
      label: "Tier 01",
      icon: (
        <svg {...tierIconProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      ),
      title: t(locale, "hiw.tier1.title"),
      body: t(locale, "hiw.tier1.body"),
    },
    {
      label: "Tier 02",
      icon: (
        <svg {...tierIconProps}>
          <path d="M7 17L17 7" />
          <path d="M9 7h8v8" />
        </svg>
      ),
      title: t(locale, "hiw.tier2.title"),
      body: t(locale, "hiw.tier2.body"),
    },
    {
      label: "Tier 03",
      icon: (
        <svg {...tierIconProps}>
          <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
        </svg>
      ),
      title: t(locale, "hiw.tier3.title"),
      body: t(locale, "hiw.tier3.body"),
    },
  ];

  const timeline = [
    { day: "24h", title: t(locale, "hiw.tl1.title"), body: t(locale, "hiw.tl1.body") },
    { day: "48h", title: t(locale, "hiw.tl2.title"), body: t(locale, "hiw.tl2.body") },
    { day: "7 days", title: t(locale, "hiw.tl3.title"), body: t(locale, "hiw.tl3.body") },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "hiw.pill")}</span>
            <h1 className="page-title mt-8">
              {t(locale, "hiw.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "hiw.hero.title.2")}</em>{" "}
              {t(locale, "hiw.hero.title.3")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "hiw.hero.sub")}
            </p>
          </div>
          <Illustration name="page-how-it-works" eager className="page-hero-art" />
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* THE FLOW - numbered vertical steps */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-10 block">{t(locale, "hiw.flow.eyebrow")}</span>
            <ol className="relative space-y-0">
              {steps.map((step, i) => (
                <li key={step.num} className="relative flex gap-8 pb-12 last:pb-0">
                  {i < steps.length - 1 && (
                    <div
                      className="absolute left-[19px] top-10 bottom-0 w-px"
                      style={{ background: "var(--line)" }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--page)] text-[11px] font-medium tracking-widest text-[var(--brand)]"
                    style={{ boxShadow: "var(--shadow-soft)" }}
                  >
                    {step.num}
                  </div>
                  <div className="pt-1">
                    <h2 className="section-title">
                      {step.title}
                    </h2>
                    <p className="muted mt-3 max-w-lg text-base leading-[1.75] md:text-[17px]">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* ROUTING - three-tier card grid */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "hiw.routing.eyebrow")}</span>
            <h2 className="section-title">
              {t(locale, "hiw.routing.title")}
            </h2>
            <p className="muted mt-5 max-w-lg text-base leading-[1.75] md:text-[17px]">
              {t(locale, "hiw.routing.sub")}
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {tiers.map((tier) => (
                <div
                  key={tier.label}
                  className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <p className="eyebrow">
                    {tier.label}
                  </p>
                  <span
                    className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-box)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    aria-hidden
                  >
                    {tier.icon}
                  </span>
                  <h3 className="mt-2 text-[18px] leading-[1.25] md:text-[20px]">
                    {tier.title}
                  </h3>
                  <p className="muted mt-3 text-sm leading-[1.75]">{tier.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* ESCALATION - horizontal timeline */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "hiw.escalation.eyebrow")}</span>
            <h2 className="section-title">
              {t(locale, "hiw.escalation.title")}
            </h2>
            <p className="muted mt-5 max-w-lg text-base leading-[1.75] md:text-[17px]">
              {t(locale, "hiw.escalation.sub")}
            </p>
            <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {timeline.map((item, i) => (
                <div
                  key={item.day}
                  className="pt-5"
                  style={{
                    borderTop: `2px solid ${i === 0 ? "var(--brand)" : i === 1 ? "var(--brand)" : "var(--danger)"}`,
                  }}
                >
                  <p
                    className="eyebrow mb-4"
                    style={{ color: i === 0 ? "var(--brand)" : i === 1 ? "var(--brand)" : "var(--danger)" }}
                  >
                    {item.day}
                  </p>
                  <h3 className="text-[18px] leading-[1.25] md:text-[20px]">
                    {item.title}
                  </h3>
                  <p className="muted mt-3 text-sm leading-[1.75]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="section-title">
              {t(locale, "hiw.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "hiw.closing.body")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                {t(locale, "hiw.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                {t(locale, "hiw.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
