import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";

const sections = [
  {
    eyebrow: "Private intake",
    title: "Paste links. Keep the content out.",
    body: "Asmita helps you start a takedown request with URLs only. No previews, no scraping, no uploads.",
    image: "/landing/section-1.png",
    alt: "Abstract teal privacy shield over anonymous URL chips",
    tone: "hero",
  },
  {
    eyebrow: "Three steps",
    title: "A calm route from report to notice.",
    body: "Submit the links, review the prepared notice, then track the response without re-exposure.",
    image: "/landing/section-2.png",
    alt: "Minimal workflow panels for URL submission, notice generation, and routing",
    tone: "split",
  },
  {
    eyebrow: "Privacy promise",
    title: "Evidence is handled as metadata, not media.",
    body: "The system records what is needed for a notice while avoiding content fetches or thumbnails.",
    image: "/landing/section-3.png",
    alt: "Translucent vault containing abstract link and hash symbols",
    tone: "center",
  },
  {
    eyebrow: "Verified routing",
    title: "Notices go to checked contact paths.",
    body: "Human review protects templates, sender details, and platform contact records before dispatch.",
    image: "/landing/section-4.png",
    alt: "Abstract platform routing network with verified contact checkpoints",
    tone: "reverse",
  },
  {
    eyebrow: "Case timeline",
    title: "Every step has a trace without exposing you.",
    body: "Milestones, audit events, and notice status are organized in one survivor-led workspace.",
    image: "/landing/section-5.png",
    alt: "Floating case timeline folders with redacted metadata markers",
    tone: "band",
  },
  {
    eyebrow: "Support network",
    title: "Bring in help when you want it.",
    body: "NGO and support handoffs can be prepared without sharing more than the case requires.",
    image: "/landing/section-6.png",
    alt: "Abstract secure support handoff with lock icons and soft teal forms",
    tone: "split-dark",
  },
  {
    eyebrow: "Transparency",
    title: "See movement, not noise.",
    body: "Track routes, responses, and resolution signals in a clean status view.",
    image: "/landing/section-7.png",
    alt: "Minimal teal metrics dashboard with anonymous progress indicators",
    tone: "metrics",
  },
  {
    eyebrow: "Start safely",
    title: "A confidential first step is enough.",
    body: "You can begin with one URL and decide what to do next after seeing the workflow.",
    image: "/landing/section-8.png",
    alt: "Cinematic teal closing scene with anonymous URL chips dissolving into light",
    tone: "closing",
  },
];

export default async function HomePage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="bg-[#fbfaf7] text-[#10201f]">
        <section className="relative min-h-[calc(100vh-72px)] overflow-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-8">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full border border-[#0a5e5a]/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0a5e5a]">
                URL-only support
              </span>
              <Link
                href="/privacy"
                className="hidden text-sm font-semibold text-[#0a5e5a] sm:inline-flex"
              >
                Privacy model
              </Link>
            </div>

            <div className="grid min-h-[72vh] items-end gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
              <div className="relative z-10 max-w-2xl pb-2 lg:pb-10">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0a5e5a]">
                  {sections[0].eyebrow}
                </p>
                <h1 className="font-display mt-5 text-[clamp(3.1rem,8vw,8.2rem)] font-normal leading-[0.9] tracking-tight text-[#10201f]">
                  Paste links.
                  <span className="block text-[#0a5e5a]">Keep dignity.</span>
                </h1>
                <p className="mt-7 max-w-xl text-base leading-7 text-[#52615f] sm:text-lg">
                  {sections[0].body}
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link className="btn btn-primary" href="/start">
                    Start a request
                  </Link>
                  <Link className="btn btn-secondary" href="/how-it-works">
                    How it works
                  </Link>
                </div>
                <p className="mt-6 text-sm text-[#65716f]">
                  {locale === "hi" ? "Hindi support available." : "Hindi and English support available."}
                </p>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden rounded-[8px] border border-[#d9e5e2] bg-white shadow-[0_28px_90px_rgba(10,94,90,0.18)]">
                <Image
                  src={sections[0].image}
                  alt={sections[0].alt}
                  fill
                  preload
                  sizes="(min-width: 1024px) 56vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="max-w-4xl font-display text-3xl leading-tight text-[#10201f] sm:text-5xl">
            Minimal by design. The portal stays focused on the next safe action, not on making you relive the harm.
          </p>
        </section>

        {sections.slice(1, 7).map((section, index) => {
          const reverse = section.tone === "reverse" || index % 2 === 1;
          const dark = section.tone === "split-dark";

          return (
            <section
              key={section.title}
              className={[
                "px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20",
                dark ? "bg-[#0a5e5a] text-white" : "",
              ].join(" ")}
            >
              <div
                className={[
                  "mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-center",
                  reverse ? "lg:[&>div:first-child]:order-2" : "",
                ].join(" ")}
              >
                <div className={section.tone === "center" ? "lg:mx-auto lg:max-w-lg" : ""}>
                  <p
                    className={[
                      "text-sm font-semibold uppercase tracking-[0.18em]",
                      dark ? "text-[#b9e7e0]" : "text-[#0a5e5a]",
                    ].join(" ")}
                  >
                    {section.eyebrow}
                  </p>
                  <h2 className="font-display mt-5 text-[clamp(2.4rem,5vw,5.8rem)] font-normal leading-[0.92] tracking-tight">
                    {section.title}
                  </h2>
                  <p
                    className={[
                      "mt-6 max-w-xl text-base leading-7 sm:text-lg",
                      dark ? "text-white/74" : "text-[#52615f]",
                    ].join(" ")}
                  >
                    {section.body}
                  </p>
                  <div className="mt-8 flex items-center gap-3">
                    <span
                      className={[
                        "h-px w-14",
                        dark ? "bg-white/40" : "bg-[#0a5e5a]/30",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "font-mono text-xs uppercase tracking-[0.22em]",
                        dark ? "text-white/58" : "text-[#65716f]",
                      ].join(" ")}
                    >
                      0{index + 2} / 08
                    </span>
                  </div>
                </div>

                <div
                  className={[
                    "relative aspect-[16/9] overflow-hidden rounded-[8px] border shadow-[0_22px_70px_rgba(16,32,31,0.11)]",
                    dark ? "border-white/15 bg-white/8" : "border-[#d9e5e2] bg-white",
                    section.tone === "metrics" ? "lg:scale-105" : "",
                  ].join(" ")}
                >
                  <Image
                    src={section.image}
                    alt={section.alt}
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </section>
          );
        })}

        <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border border-[#d9e5e2] bg-white shadow-[0_28px_90px_rgba(10,94,90,0.16)]">
              <Image
                src={sections[7].image}
                alt={sections[7].alt}
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0a5e5a]">
                {sections[7].eyebrow}
              </p>
              <h2 className="font-display mt-5 text-[clamp(2.6rem,6vw,6.6rem)] font-normal leading-[0.92] tracking-tight">
                {sections[7].title}
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-[#52615f] sm:text-lg">
                {sections[7].body}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link className="btn btn-primary" href="/start">
                  Begin safely
                </Link>
                <Link className="btn btn-secondary" href="/minor-support">
                  Minor support
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
