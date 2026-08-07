import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

/*
 * Get Help hub — the triage front door.
 * Patterns: safety/helplines first (eSafety), survivor-voice scenario titles
 * (eSafety), the reusable four-step spine (eSafety), honest outcomes before
 * acting (eSafety + our own charter). English copy inline; Hindi + i18n follow
 * once content is signed off.
 */

export const metadata: Metadata = {
  title: "Get help",
  description:
    "Free, confidential help for image-based abuse in India. Find your situation, follow the steps, and reach the right support.",
};

const scenarios = [
  {
    title: "My private photos or video were shared without my consent.",
    action: "Start a report and we will help you get it taken down.",
    href: "/start",
  },
  {
    title: "Someone is threatening to share my photos.",
    action: "Do not wait. Save the messages as evidence, then start a report.",
    href: "/start",
  },
  {
    title: "Someone is demanding money or they will leak my photos.",
    action: "Do not pay. Do not send anything more. Keep the messages and report it.",
    href: "/start",
  },
  {
    title: "There is a fake or AI-made nude of me.",
    action: "Check the image first, then report it. A fake image is still abuse.",
    href: "/check-image",
  },
  {
    title: "Someone morphed my photo from social media.",
    action: "You can report morphed and edited images the same way.",
    href: "/start",
  },
  {
    title: "The person in the image is under 18.",
    action: "This needs a different, safer path. We will point you to the right help.",
    href: "/minor-support",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Save the evidence first",
    body: "Take screenshots of the posts, the profile, the web address, and any messages or payment demands. Note the date, time, and username. One rule: never save or send an intimate image of anyone under 18.",
  },
  {
    n: "2",
    title: "Report and send a takedown",
    body: "We help you write a legally grounded notice and route it to the platform. You read it and sign it. Your image never leaves your device.",
  },
  {
    n: "3",
    title: "Stop contact and lock down",
    body: "Stop replying. Block the person only after you have saved evidence, not before. Change your passwords, turn on two-factor, and check who can see your accounts.",
  },
  {
    n: "4",
    title: "Get more support",
    body: "Reach a helpline, a counsellor, or a practical guide. This is not something you have to carry alone.",
  },
] as const;

const tools = [
  {
    tag: "Report",
    title: "Start a report",
    body: "Generate a takedown notice and route it to the platform. Review and sign when you are ready.",
    href: "/start",
    cta: "Start a report",
  },
  {
    tag: "Check",
    title: "Check an image",
    body: "See whether an image carries signals that it was made or edited by AI.",
    href: "/check-image",
    cta: "Check an image",
  },
  {
    tag: "Under 18",
    title: "Support for a minor",
    body: "If the person is under 18, this routes you to child-protection help. No image is uploaded here.",
    href: "/minor-support",
    cta: "Find the right help",
  },
] as const;

export default function GetHelpPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO + safety first */}
        <section className="hero" aria-label="Get help">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Get help</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Something happened. Here is what to do.
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Free and confidential. Pick the situation that fits, or follow the
                four steps below. You can go at your own pace.
              </p>
            </div>

            {/* Emergency strip — safety before instructions */}
            <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-lg)] border border-[var(--warm-border)] bg-white/70 p-6 backdrop-blur-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--heading)]">
                If you need urgent help
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>In immediate danger?</strong> Call{" "}
                  <a className="text-link" href="tel:112">112</a>.
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>Women&rsquo;s helpline:</strong>{" "}
                  <a className="text-link" href="tel:181">181</a>, 24 hours.
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>Under 18:</strong> Childline{" "}
                  <a className="text-link" href="tel:1098">1098</a>.
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>Report cybercrime:</strong>{" "}
                  <a className="text-link" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>{" "}
                  or <a className="text-link" href="tel:1930">1930</a>.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* SCENARIOS — survivor voice */}
        <section className="zone-white section-pad" aria-labelledby="scenarios-heading">
          <div className="container">
            <h2
              id="scenarios-heading"
              className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
            >
              Start with your situation
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-[1.6] text-[var(--body)]">
              Whatever is happening, there is a path. Choose the one that sounds
              closest to yours.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((s) => (
                <Link
                  key={s.title}
                  href={s.href}
                  className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                >
                  <h3 className="text-[17px] font-semibold leading-snug text-[var(--heading)]">
                    &ldquo;{s.title}&rdquo;
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                    {s.action}
                  </p>
                  <span className="mt-4 inline-block text-sm font-semibold text-[var(--coral-deep)]">
                    What to do{" "}
                    <span className="transition-transform group-hover:translate-x-0.5 inline-block" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FOUR-STEP SPINE */}
        <section className="transform-section" aria-labelledby="steps-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">The four steps</span>
              <h2
                id="steps-heading"
                className="font-display mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
              >
                What to do, step by step
              </h2>
              <p className="mt-4 text-lg leading-[1.6] text-[var(--body)]">
                The same four steps work for a shared image, a threat, or
                blackmail. Do what you can, in order.
              </p>
            </div>
            <ol className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
              {steps.map((s) => (
                <li
                  key={s.n}
                  className="rounded-[var(--radius-lg)] bg-white/75 p-6 backdrop-blur-sm"
                >
                  <span className="font-display text-[var(--coral-deep)] text-2xl font-semibold">
                    {s.n}
                  </span>
                  <h3 className="mt-2 text-[18px] font-semibold text-[var(--heading)]">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.65] text-[var(--body)]">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TOOLS */}
        <section className="zone-white section-pad" aria-labelledby="tools-heading">
          <div className="container">
            <h2
              id="tools-heading"
              className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
            >
              The tools you can use now
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {tools.map((tool) => (
                <div key={tool.title} className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-7 shadow-[var(--shadow-sm)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--coral-deep)]">
                    {tool.tag}
                  </p>
                  <h3 className="mt-3 text-[19px] font-semibold text-[var(--heading)]">
                    {tool.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-[1.65] text-[var(--muted)]">
                    {tool.body}
                  </p>
                  <div className="mt-6">
                    <Link href={tool.href} className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                      {tool.cta}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HONEST OUTCOMES */}
        <section className="zone-white section-pad !pt-0" aria-labelledby="honest-heading">
          <div className="container">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-8 md:p-12">
              <h2
                id="honest-heading"
                className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.15]"
              >
                What a takedown can and cannot do
              </h2>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--success)]">
                    What it can do
                  </p>
                  <ul className="mt-3 space-y-2 text-[15px] leading-[1.6] text-[var(--body)]">
                    <li>Get content removed from platforms that respond.</li>
                    <li>Ask search engines to stop showing it in results.</li>
                    <li>Help block matching re-uploads, without us seeing your image.</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">
                    What it cannot do
                  </p>
                  <ul className="mt-3 space-y-2 text-[15px] leading-[1.6] text-[var(--body)]">
                    <li>Erase content from the whole internet or private devices.</li>
                    <li>Force a platform that ignores the law to act instantly.</li>
                    <li>Promise a result. We tell you exactly where things stand.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label="Get started">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.9rem,4.5vw,3rem)] font-medium leading-[1.12]">
                You do not have to deal with this alone.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                Start when you are ready. Every step is confidential, and you stay
                in control the whole way.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/start">
                  Start a report
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources">
                  Browse resources
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
