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

  const tiers = [
    { label: "Tier 01", icon: "✉", title: t(locale, "hiw.tier1.title"), body: t(locale, "hiw.tier1.body") },
    { label: "Tier 02", icon: "↗", title: t(locale, "hiw.tier2.title"), body: t(locale, "hiw.tier2.body") },
    { label: "Tier 03", icon: "⚡", title: t(locale, "hiw.tier3.title"), body: t(locale, "hiw.tier3.body") },
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
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "hiw.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "hiw.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "hiw.hero.title.2")}</em>{" "}
              {t(locale, "hiw.hero.title.3")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "hiw.hero.sub")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* THE FLOW - numbered vertical steps */}
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-10 block">{t(locale, "hiw.flow.eyebrow")}</span>
            <ol className="relative space-y-0">
              {steps.map((step, i) => (
                <li key={step.num} className="relative flex gap-8 pb-12 last:pb-0">
                  {i < steps.length - 1 && (
                    <div
                      className="absolute left-[19px] top-10 bottom-0 w-px"
                      style={{ background: "var(--hairline)" }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] font-mono text-[11px] font-semibold tracking-widest text-[var(--teal)]"
                    style={{ boxShadow: "var(--shadow-soft)" }}
                  >
                    {step.num}
                  </div>
                  <div className="pt-1">
                    <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[30px] md:leading-[1.18]">
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
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "hiw.routing.eyebrow")}</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              {t(locale, "hiw.routing.title")}
            </h2>
            <p className="muted mt-5 max-w-lg text-base leading-[1.75] md:text-[17px]">
              {t(locale, "hiw.routing.sub")}
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {tiers.map((tier) => (
                <div
                  key={tier.label}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    {tier.label}
                  </p>
                  <p className="mt-3 text-2xl" aria-hidden>
                    {tier.icon}
                  </p>
                  <h3 className="font-display mt-2 text-[18px] font-normal leading-[1.25] tracking-tight md:text-[20px]">
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
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "hiw.escalation.eyebrow")}</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              {t(locale, "hiw.escalation.title")}
            </h2>
            <p className="muted mt-5 max-w-lg text-base leading-[1.75] md:text-[17px]">
              {t(locale, "hiw.escalation.sub")}
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {timeline.map((item, i) => (
                <div
                  key={item.day}
                  className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ background: i === 0 ? "var(--teal)" : i === 1 ? "var(--saffron)" : "var(--rose)" }}
                      aria-hidden
                    />
                    <p
                      className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: i === 0 ? "var(--teal)" : i === 1 ? "var(--saffron)" : "var(--rose)" }}
                    >
                      {item.day}
                    </p>
                  </div>
                  <h3 className="font-display text-[18px] font-normal leading-[1.25] tracking-tight md:text-[20px]">
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
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
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
