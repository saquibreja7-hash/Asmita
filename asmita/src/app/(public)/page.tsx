import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

/*
 * Home layout. Visual rhythm comes from soft per-section gradient washes
 * (see .hero / .transform-section / .zone-sunset in globals.css), not ribbons.
 */

const audiences = [
  { title: "Survivors", href: "/who-we-help/survivors" },
  { title: "People helping", href: "/who-we-help/helping-someone" },
  { title: "Parents & families", href: "/who-we-help/parents" },
  { title: "Young people", href: "/who-we-help/young-people" },
] as const;

const proofFacts = [
  {
    label: "Privacy by architecture.",
    value: "On-device",
    detail:
      "fingerprints computed on your phone — the image never reaches our servers",
  },
  {
    label: "Legal grounding.",
    value: "24 hours",
    detail:
      "mandatory platform response window under the IT Rules, made usable",
  },
  {
    label: "What never happens.",
    value: "No media",
    detail:
      "we never fetch, preview, store, or view intimate content at any link you share",
  },
] as const;

const pillars = [
  "We generate legally-grounded takedown notices",
  "We block re-uploads without seeing the image",
  "We help you understand AI-made harm",
  "We stay honest about what a notice can and cannot do",
] as const;

const principles = [
  {
    quote:
      "Your image never leaves your device. Fingerprints are computed on your phone — only a 64-character code reaches our servers.",
    attribution: "Privacy architecture",
  },
  {
    quote:
      "Platforms must act on certain takedown notices within 24 hours under Indian law. We turn that right into one calm, reviewable flow.",
    attribution: "IT Rules & MeitY SOP",
  },
  {
    quote:
      "We do not promise to erase content from the whole internet. We say exactly what a notice can and cannot do — that honesty is the product.",
    attribution: "Honest limits",
  },
] as const;

const knowledgeCards = [
  {
    tag: "Guide",
    title: "How notices actually reach platforms",
    body: "Grievance officers, guided form handoffs, and what happens after you sign.",
    href: "/how-it-works",
    cta: "How it works",
    img: "/images/knowledge-1.jpg",
  },
  {
    tag: "Tool",
    title: "Check whether an image may be AI-made",
    body: "A private check for signals that an image was generated or edited by AI.",
    href: "/check-image",
    cta: "Check an image",
    img: "/images/knowledge-2.jpg",
  },
  {
    tag: "Resources",
    title: "Helplines, rights, and practical next steps",
    body: "Secure your accounts, collect evidence safely, and reach verified support.",
    href: "/resources",
    cta: "Browse resources",
    img: "/images/knowledge-3.jpg",
  },
] as const;

const darkModules = [
  {
    tag: "Start",
    title: "Begin a confidential report",
    body: "Paste links as text, review notices, and sign when you are ready. Your image never leaves your device.",
    href: "/start",
    cta: "Get Help",
  },
  {
    tag: "Privacy",
    title: "How we keep images off our servers",
    body: "URLs are text tokens only. Fingerprints are computed on-device. Read the privacy promise.",
    href: "/privacy",
    cta: "Read privacy",
  },
] as const;

export default function HomePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/*
          Peach zone = Thorn .has-peach-white-gradient-background
          Shape placed AFTER media (exact HTML order from saved file)
        */}
        <section className="hero" aria-label="Introduction">
          <div className="hero-content">
            {/* 1. Heading + CTAs */}
            <div className="container section-pad text-center !pb-0">
              <h1 className="font-display mx-auto max-w-4xl text-[clamp(2.5rem,7vw,5.6rem)] font-medium leading-[1.05] text-[var(--heading)]">
                Will you help stop image-based abuse?
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Free, confidential tools for anyone in India facing
                non-consensual or AI-made intimate images.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get Help
                </Link>
                <Link
                  className="btn btn-midnight btn-arrow !m-0"
                  href="/how-it-works"
                >
                  Explore how it works
                </Link>
              </div>
              <p className="mt-5">
                <Link
                  href="/minor-support"
                  className="text-sm font-medium text-[var(--muted)] underline decoration-[var(--warm-border)] underline-offset-4 hover:opacity-60"
                >
                  Under 18, or was the image taken when you were? Find the right
                  help →
                </Link>
              </p>
            </div>

            {/* 2. Spacer (Thorn #hero-video height:99px) */}
            <div className="hero-spacer" aria-hidden="true" />

            {/* 3. Media (Thorn video block) */}
            <div className="container">
              <div className="hero-media-wrap">
                <div className="hero-media">
                  <img
                    src="/images/hero.jpg"
                    alt=""
                    width={1199}
                    height={674}
                    fetchPriority="high"
                  />
                  <span className="hero-media-overlay" aria-hidden />
                  <p className="hero-media-caption">
                    At Asmita, we&rsquo;re building tools and knowledge so
                    survivors can act.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Issue + stats — sits in the warm hero wash */}
          <div className="hero-content">
            <div
              id="issue"
              className="container section-pad"
              aria-labelledby="issue-heading"
            >
              <div className="grid items-start gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
                <div>
                  <h2
                    id="issue-heading"
                    className="font-display text-[clamp(1.85rem,4vw,3.5rem)] font-medium leading-[1.12]"
                  >
                    The internet makes it easier to harm people
                  </h2>
                  <p className="mt-6 text-lg leading-[1.6] text-[var(--body)]">
                    Non-consensual intimate imagery (NCII), deepfakes, morphing,
                    and sextortion spread fast across platforms and WhatsApp
                    groups.{" "}
                    <Link href="/issue" className="text-link">
                      Learn more about the issue
                    </Link>
                    .
                  </p>
                  <p className="mt-4 text-lg leading-[1.6] text-[var(--body)]">
                    We&rsquo;re building a digital response so people can remove
                    content, reduce re-uploads, and reach the right support.
                  </p>
                  <div className="mt-8">
                    <Link
                      className="btn btn-midnight btn-arrow !m-0"
                      href="/how-it-works"
                    >
                      Explore how it works
                    </Link>
                  </div>
                </div>

                <div>
                  <p className="font-size-small font-semibold uppercase tracking-[0.04em] text-[var(--theme-color-2)]">
                    What we commit to, every day:
                  </p>
                  {proofFacts.map((fact, i) => (
                    <div key={fact.label} className="stat-block">
                      {i > 0 && <hr className="hr-thorn" />}
                      <div className={i === 0 ? "mt-5" : ""}>
                        <p className="stat-label">{fact.label}</p>
                        <span className="statistic mt-1">{fact.value}</span>
                        <p className="stat-detail">{fact.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mint transform — line-3-wide via CSS background-image */}
        <section
          className="transform-section"
          aria-labelledby="transform-heading"
        >
          <div className="transform-content">
            <div className="collage-row">
              <img src="/images/collage-1.jpg" alt="" width={300} height={400} />
              <img src="/images/collage-2.jpg" alt="" width={600} height={450} />
              <img src="/images/collage-3.jpg" alt="" width={500} height={375} />
            </div>
            <div className="container">
              <div className="plate mx-auto max-w-3xl px-6 py-12 text-center md:px-14 md:py-16">
                <h2
                  id="transform-heading"
                  className="font-display text-[clamp(1.75rem,3.8vw,2.85rem)] font-medium leading-[1.15]"
                >
                  Let&rsquo;s transform how India responds to image-based abuse
                </h2>
                <p className="font-size-large mx-auto mt-5 max-w-xl text-[var(--body)]">
                  We don&rsquo;t have to scroll past while harm happens. Everyone
                  has a role to play.{" "}
                  <Link href="/how-it-works" className="text-link">
                    Asmita&rsquo;s tools
                  </Link>{" "}
                  help you become an active partner in taking content down.
                </p>
                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--heading)]">
                  Explore paths for:
                </p>
                <div className="audience-pills mt-4">
                  {audiences.map((a) => (
                    <Link
                      key={a.title}
                      href={a.href}
                      className="btn btn-secondary !m-0 !min-h-[44px] !px-5 !text-[15px]"
                    >
                      {a.title}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="why-heading">
          <div className="container">
            <h2
              id="why-heading"
              className="font-display text-[clamp(1.85rem,4vw,3rem)] font-medium leading-[1.12]"
            >
              Why Asmita?
            </h2>
            <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-12">
              {principles.map((p) => (
                <div key={p.attribution} className="line-left">
                  <p className="principle-quote">{p.quote}</p>
                  <p className="principle-attr">{p.attribution}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="zone-white section-pad !pt-2"
          aria-labelledby="knowledge-heading"
        >
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2
                id="knowledge-heading"
                className="font-display text-[clamp(1.85rem,4vw,3rem)] font-medium leading-[1.12]"
              >
                Guides, tools, and answers
              </h2>
              <Link href="/resources" className="text-link text-sm font-semibold">
                View all resources →
              </Link>
            </div>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {knowledgeCards.map((card) => (
                <Link key={card.title} href={card.href} className="post-card">
                  <div className="post-image">
                    <img src={card.img} alt="" width={1000} height={700} />
                  </div>
                  <p className="post-tag">{card.tag}</p>
                  <h3 className="post-title">{card.title}</h3>
                  <p className="post-excerpt">{card.body}</p>
                  <span className="post-link">{card.cta} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-2" aria-label="Key actions">
          <div className="container grid gap-5 md:grid-cols-2">
            {darkModules.map((m) => (
              <div key={m.title} className="module-dark">
                <p className="module-tag">{m.tag}</p>
                <h3>{m.title}</h3>
                <p>{m.body}</p>
                <div className="mt-6">
                  <Link
                    href={m.href}
                    className="btn btn-primary btn-arrow !m-0 !min-h-[44px] !text-[15px]"
                  >
                    {m.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="what-we-do"
          className="zone-sunset"
          aria-labelledby="pillars-heading"
        >
          <div className="zone-sunset-content">
            <div className="container section-pad text-center">
              <h2
                id="pillars-heading"
                className="font-display text-[clamp(1.85rem,4vw,3.25rem)] font-medium leading-[1.12]"
              >
                <span className="font-color-coral">
                  One bold goal drives our work
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-[1.6] text-[var(--body)] md:text-lg">
                Help people in India facing non-consensual or AI-made intimate
                images regain control. How?
              </p>
              <div className="pillar-list mt-10">
                {pillars.map((title, i) => (
                  <div key={title}>
                    {i > 0 && <hr />}
                    <h3>{title}</h3>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link
                  className="btn btn-midnight btn-arrow !m-0"
                  href="/how-it-works"
                >
                  More on what we do
                </Link>
              </div>
            </div>

            <div className="container section-pad-sm text-center !pt-4">
              <div className="pledge-block">
                <p className="pledge-label">The Asmita promise</p>
                <p className="pledge-quote">
                  &ldquo;You do not have to deal with this alone.&rdquo;
                </p>
                <p className="mt-5 text-base leading-[1.65] text-[var(--body)]">
                  Start a confidential report, or read how it works first. In
                  your language, on your terms.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link className="btn btn-midnight btn-arrow !m-0" href="/start">
                    Get Help
                  </Link>
                  <Link className="btn btn-secondary btn-arrow !m-0" href="/faq">
                    Read the FAQ
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
