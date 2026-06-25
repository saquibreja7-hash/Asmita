import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function ResourcesPage() {
  const locale = await getLocale();

  const emergency = [
    { name: t(locale, "res.emergency1.name"), contact: "112", href: "tel:112", description: t(locale, "res.emergency1.desc") },
    { name: t(locale, "res.emergency2.name"), contact: "1098", href: "tel:1098", description: t(locale, "res.emergency2.desc") },
  ];

  const support = [
    {
      category: t(locale, "res.counselling.eyebrow"),
      name: "iCALL · TISS",
      description: t(locale, "res.icall.desc"),
      contact: "9152987821",
      href: "tel:9152987821",
    },
    {
      category: t(locale, "res.legalaid.eyebrow"),
      name: "NALSA / DLSA Directory",
      description: t(locale, "res.nalsa.desc"),
      contact: "nalsa.gov.in",
      href: "https://nalsa.gov.in/directory/",
    },
    {
      category: t(locale, "res.cybercrime.eyebrow"),
      name: "National Cybercrime Reporting Portal",
      description: t(locale, "res.ncrp.desc"),
      contact: "cybercrime.gov.in",
      href: "https://cybercrime.gov.in/",
    },
  ];

  const platforms = [
    {
      name: "Instagram",
      notes: "Use the in-app report on the specific post or profile. Instagram's Safety Center also has a dedicated NCII removal path.",
      links: [
        { label: "Report on Instagram", href: "https://help.instagram.com/165828726894770" },
        { label: "Safety Center", href: "https://about.instagram.com/safety" },
      ],
    },
    {
      name: "Facebook",
      notes: 'Facebook has a dedicated "Not Without My Consent" tool specifically for intimate images. Use it for the fastest removal path.',
      links: [
        { label: "Not Without My Consent", href: "https://www.facebook.com/safety/notwithoutmyconsent" },
        { label: "Report Harmful Content", href: "https://www.facebook.com/help/1380418588640631" },
      ],
    },
    {
      name: "Google Search",
      notes: "You can request Google remove links to intimate images from search results, even if you cannot get the content taken down at the source.",
      links: [
        { label: "Submit an NCII removal request", href: "https://support.google.com/websearch/answer/6302812" },
      ],
    },
    {
      name: "YouTube",
      notes: "YouTube staff review reported content 24 hours a day. You can report videos, thumbnails, comments, and entire channels.",
      links: [
        { label: "Report inappropriate content", href: "https://support.google.com/youtube/answer/2802027" },
        { label: "YouTube Help Center", href: "https://support.google.com/youtube" },
      ],
    },
    {
      name: "X (Twitter)",
      notes: "Use the in-app report on the specific post, or submit via X's Safety Center. Intimate images policy violations are reviewed separately.",
      links: [
        { label: "Report abusive behaviour", href: "https://help.twitter.com/en/safety-and-security/report-abusive-behavior" },
        { label: "X Safety Center", href: "https://help.twitter.com/en/safety-and-security" },
      ],
    },
    {
      name: "Snapchat",
      notes: "Snapchat allows in-app anonymous reporting. Both you and the person reported receive wellbeing resources.",
      links: [
        { label: "Report abuse in-app", href: "https://support.snapchat.com/en-US/article/report-abuse-in-app" },
        { label: "Safety Resources", href: "https://support.snapchat.com/en-US/a/Snapchat-Safety" },
      ],
    },
    {
      name: "TikTok",
      notes: "Use TikTok's Report a Problem tool for content violations. The Safety Center has a dedicated path for privacy and intimate image reports.",
      links: [
        { label: "Report a Problem", href: "https://support.tiktok.com/en/safety-hc/report-a-problem" },
        { label: "Safety Center", href: "https://www.tiktok.com/safety/en-us/" },
      ],
    },
    {
      name: "WhatsApp",
      notes: "WhatsApp can block and remove a contact. Reporting sends WhatsApp your most recent messages for policy review.",
      links: [
        { label: "Block and report a contact", href: "https://faq.whatsapp.com/iphone/security-and-privacy/how-to-block-and-unblock-contacts" },
      ],
    },
    {
      name: "Telegram",
      notes: "Telegram has no centralised reporting form. Use @notoscam on Telegram to report, or email abuse@telegram.org with channel or group links.",
      links: [
        { label: "Telegram support", href: "https://telegram.org/support" },
      ],
    },
    {
      name: "Discord",
      notes: "Submit an abuse report to Discord's Trust and Safety team. Include message IDs and channel IDs where possible.",
      links: [
        { label: "Submit an Abuse Report", href: "https://support.discord.com/hc/en-us/requests/new?ticket_form_id=360000029731" },
        { label: "Safety Center", href: "https://discord.com/safety" },
      ],
    },
    {
      name: "LinkedIn",
      notes: "Use LinkedIn's in-product reporting for inappropriate content, or contact LinkedIn Safety directly.",
      links: [
        { label: "Report inappropriate content", href: "https://www.linkedin.com/help/linkedin/answer/146" },
        { label: "Safety Center", href: "https://safety.linkedin.com/" },
      ],
    },
    {
      name: "Pinterest",
      notes: "Pinterest allows reporting specific pins, boards, or accounts. Intimate content violating consent is handled by the Trust and Safety team.",
      links: [
        { label: "Report something on Pinterest", href: "https://help.pinterest.com/en/article/report-something-on-pinterest" },
      ],
    },
  ];

  const filingSteps = [
    t(locale, "res.filing.step1"),
    t(locale, "res.filing.step2"),
    t(locale, "res.filing.step3"),
    t(locale, "res.filing.step4"),
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {t(locale, "res.pill")}
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {t(locale, "res.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "res.hero.title.2")}</em>{" "}
              {t(locale, "res.hero.title.3")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "res.hero.sub")}
            </p>
            <p className="muted mt-5 text-xs tracking-wide">
              Last verified against public source pages: 12 May 2026.
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* EMERGENCY */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-6 block">{t(locale, "res.emergency.eyebrow")}</span>
            <p className="muted mb-8 max-w-lg text-base leading-[1.75]">
              {t(locale, "res.emergency.sub")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {emergency.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="group flex flex-col rounded-xl border-2 border-[var(--teal)] bg-[var(--teal-soft)] p-6 transition-colors hover:bg-[color-mix(in_srgb,var(--teal-soft)_70%,white)]"
                  aria-label={`${item.name} - call ${item.contact}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-[var(--teal-dark)]">
                    {item.name}
                  </span>
                  <span className="mt-3 text-[52px] font-normal leading-none tracking-tight text-[var(--teal-dark)] md:text-[64px]">
                    {item.contact}
                  </span>
                  <span className="muted mt-4 text-sm leading-[1.65]">{item.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* SUPPORT */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-8 block">Support</span>
            <div className="divide-y divide-[var(--hairline)]">
              {support.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex flex-col gap-3 py-8 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-12 transition-colors hover:bg-transparent group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-1">{item.category}</p>
                    <p className="font-semibold text-[var(--foreground)] text-base md:text-[17px]">{item.name}</p>
                    <p className="muted mt-2 text-sm leading-[1.75] max-w-md">{item.description}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-[var(--teal-dark)] underline decoration-[var(--teal-dark)]/30 underline-offset-4 transition-colors group-hover:decoration-[var(--teal-dark)] md:text-base">
                    {item.contact} ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* PLATFORM REPORTING */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "res.platforms.eyebrow")}</span>
            <p className="font-semibold text-[var(--foreground)] text-[18px] leading-[1.3] md:text-[22px]">
              {t(locale, "res.platforms.title")}
            </p>
            <p className="muted mt-3 max-w-lg text-base leading-[1.75]">
              {t(locale, "res.platforms.sub")}
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {platforms.map((p) => (
                <div
                  key={p.name}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <p className="font-semibold text-[var(--foreground)] text-base">{p.name}</p>
                  <p className="muted mt-2 text-sm leading-[1.65]">{p.notes}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.links.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-full border border-[var(--hairline)] px-3 py-1 text-[11px] font-medium text-[var(--teal-dark)] transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                      >
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FILING GUIDE */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">{t(locale, "res.filing.eyebrow")}</span>
            <p className="font-semibold text-[var(--foreground)] text-[18px] leading-[1.3] md:text-[22px]">
              {t(locale, "res.filing.title")}
            </p>
            <p className="muted mt-3 max-w-lg text-base leading-[1.75]">
              {t(locale, "res.filing.sub")}
            </p>
            <ol className="mt-8 space-y-0">
              {filingSteps.map((text, i) => (
                <li key={i} className="relative flex gap-6 pb-8 last:pb-0">
                  {i < filingSteps.length - 1 && (
                    <div
                      className="absolute left-[19px] top-10 bottom-0 w-px"
                      style={{ background: "var(--hairline)" }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--teal)]"
                    style={{ boxShadow: "var(--shadow-soft)" }}
                  >
                    {i + 1}
                  </div>
                  <p className="pt-2 text-base leading-[1.75] text-[var(--foreground)] md:text-[17px]">
                    {text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              {t(locale, "res.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "res.closing.body")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                {t(locale, "res.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                {t(locale, "res.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
