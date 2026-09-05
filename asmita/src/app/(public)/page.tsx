import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { HeroScene } from "@/components/HeroScene";

/*
 * Home. Editorial system from DESIGN.md: parchment canvas, serif headlines at 400,
 * monospace for every functional string, pill buttons, hairline cards, one blue action.
 */

const audiences = [
  { title: "Survivors", href: "/who-we-help/survivors" },
  { title: "People helping someone", href: "/who-we-help/helping-someone" },
  { title: "Parents and families", href: "/who-we-help/parents" },
  { title: "Young people", href: "/who-we-help/young-people" },
] as const;

const pipeline = [
  { icon: "¶", label: "Links as text" },
  { icon: "§", label: "Legal notice" },
  { icon: "✎", label: "You sign" },
  { icon: "→", label: "Platform" },
] as const;

const features = [
  {
    icon: "§",
    title: "Legally grounded takedown notices",
    body: "A removal notice that cites the IT Rules and the MeitY procedure, routed to the platform's grievance channel. You read and sign it before anything is sent.",
    href: "/what-we-do",
    cta: "How notices work",
  },
  {
    icon: "#",
    title: "Re-upload blocking without the image",
    body: "A fingerprint is computed on your own phone. Only a 64-character code reaches us, and matching copies can be blocked on partner platforms.",
    href: "/get-help",
    cta: "Fingerprint an image",
  },
  {
    icon: "?",
    title: "AI and deepfake check",
    body: "A private check for signals that an image was generated or edited by AI. A fake image is still abuse, and you can still report it.",
    href: "/check-image",
    cta: "Check an image",
  },
] as const;

const commitments = [
  {
    value: "On-device",
    label: "Privacy by architecture",
    detail: "Fingerprints are computed on your phone. The image never reaches our servers.",
  },
  {
    value: "24 hours",
    label: "Legal grounding",
    detail: "The mandatory platform response window under the IT Rules, made usable.",
  },
  {
    value: "No media",
    label: "What never happens",
    detail: "We never fetch, preview, store, or view intimate content at any link you share.",
  },
] as const;

const faqs = [
  {
    q: "Do I have to upload the image?",
    a: "No. You paste links as text. If you choose to block re-uploads, a fingerprint is computed on your own device and only a short code is sent to us. We never see the picture.",
  },
  {
    q: "Will the content disappear from the whole internet?",
    a: "No one can honestly promise that. A notice obliges the named platform to act within the legal window. Fingerprints help stop the same image coming back on partner platforms. We say exactly what each step can and cannot do.",
  },
  {
    q: "Is this a government service?",
    a: "No. Asmita is an independent platform built by JAMSAQ Studio. We route you to official channels where they help, and stay honest about where they do not.",
  },
  {
    q: "What if I am under 18, or the image is from when I was?",
    a: "There is a separate, safer path. Cases involving minors are routed under POCSO and never enter the adult flow. Start from the minor support page.",
  },
] as const;

export default function HomePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO: pure typographic, wash behind */}
        <section className="hero" aria-label="Introduction">
          <div className="hero-content container pt-12 pb-8 md:pt-20 md:pb-12">
            <div className="hero-grid">
              <div className="text-center lg:text-left">
                <span className="pill">
                  <span className="dot" />
                  Free and confidential, for India
                </span>
                <h1 className="mx-auto mt-8 max-w-3xl text-[clamp(40px,6vw,76px)] lg:mx-0">
                  Take the image down. Keep the image private.
                </h1>
                <p className="font-size-large mx-auto mt-6 max-w-xl lg:mx-0">
                  Legally grounded takedown notices and on-device fingerprint blocking for
                  anyone in India facing non-consensual or AI-made intimate images. Your
                  image never leaves your phone.
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <Link className="btn btn-primary btn-arrow" href="/get-help">
                    Get help
                  </Link>
                  <Link className="btn btn-secondary" href="/what-we-do">
                    How it works
                  </Link>
                </div>
              </div>
              <HeroScene />
            </div>
          </div>

          {/* Pipeline diagram */}
          <div className="hero-content container pb-20 md:pb-28">
            <div className="pipeline" role="list" aria-label="How a report moves">
              {pipeline.map((n, i) => (
                <div key={n.label} className="contents" role="listitem">
                  {i > 0 && <span className="pipeline-link" aria-hidden />}
                  <span className={`node ${i === 1 ? "node-hub" : ""}`}>
                    <span className="node-icon" aria-hidden>
                      {n.icon}
                    </span>
                    {n.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="eyebrow mt-6 w-full justify-center text-center">
              No image is uploaded at any step
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* ISSUE + COMMITMENTS */}
        <section id="issue" className="section-pad" aria-labelledby="issue-heading">
          <div className="container grid items-start gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
            <div>
              <span className="eyebrow">The issue</span>
              <h2 id="issue-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                The internet makes it easier to harm people. The law gives you a way back.
              </h2>
              <p className="mt-6 max-w-xl text-[16px] leading-[1.5] text-[var(--color-graphite)] md:text-[18px]">
                Non-consensual intimate imagery, deepfakes, morphing, and sextortion spread
                fast across platforms and WhatsApp groups. Platforms must act on certain
                takedown notices within 24 hours under Indian law. We turn that right into
                one calm, reviewable flow.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="arrow-link" href="/issue">
                  Learn about the issue
                </Link>
              </div>
            </div>

            <div>
              <p className="eyebrow">What we commit to, every day</p>
              {commitments.map((c, i) => (
                <div key={c.label} className="stat-block">
                  {i > 0 && <hr className="hr-thorn" />}
                  <div className={i === 0 ? "mt-6" : ""}>
                    <p className="stat-label">{c.label}</p>
                    <span className="statistic mt-2">{c.value}</span>
                    <p className="stat-detail">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="section-pad !pt-0" aria-labelledby="features-heading">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <span className="eyebrow">What we do</span>
                <h2 id="features-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                  Tools that actually remove content
                </h2>
              </div>
              <Link href="/what-we-do" className="arrow-link">
                More on what we do
              </Link>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {features.map((f) => (
                <Link key={f.title} href={f.href} className="card fade flex flex-col">
                  <span className="card-icon" aria-hidden>
                    {f.icon}
                  </span>
                  <h3>{f.title}</h3>
                  <p className="mt-4 flex-1">{f.body}</p>
                  <span className="arrow-link mt-8">{f.cta}</span>
                </Link>
              ))}
            </div>

            {/* Elevated periwinkle card */}
            <div className="card card-elevated mt-4 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
              <div className="wash-art" aria-hidden />
              <div className="relative z-[1]">
                <span className="card-icon" aria-hidden>
                  ◐
                </span>
                <h3 className="text-[clamp(24px,3vw,32px)]">
                  Your image never leaves your device
                </h3>
                <p className="mt-4 max-w-md">
                  Links are handled as text tokens only. Fingerprints are computed on your
                  phone. The signed notice you review is exactly what gets sent. Read the
                  full privacy promise before you begin.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/privacy" className="btn btn-midnight">
                    Read the privacy promise
                  </Link>
                </div>
              </div>
              <div className="relative z-[1] hidden md:block" aria-hidden />
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* AUDIENCES */}
        <section className="section-pad" aria-labelledby="audience-heading">
          <div className="container text-center">
            <span className="eyebrow">Who we help</span>
            <h2 id="audience-heading" className="mx-auto mt-5 max-w-3xl text-[clamp(32px,4vw,48px)]">
              Everyone has a role to play
            </h2>
            <p className="font-size-large mx-auto mt-6 max-w-xl">
              We do not have to scroll past while harm happens. Find the path written for
              your situation.
            </p>
            <div className="audience-pills mt-10">
              {audiences.map((a) => (
                <Link key={a.title} href={a.href} className="btn btn-secondary">
                  {a.title}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FAQ */}
        <section className="section-pad" aria-labelledby="faq-heading">
          <div className="container grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-24">
            <div>
              <span className="eyebrow">Questions</span>
              <h2 id="faq-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                Honest answers first
              </h2>
              <p className="mt-6 text-[16px] leading-[1.5] text-[var(--color-graphite)]">
                We say exactly what a notice can and cannot do. That honesty is the product.
              </p>
              <Link href="/faq" className="arrow-link mt-8">
                Read the full FAQ
              </Link>
            </div>
            <div className="border-t border-[var(--color-ash)]">
              {faqs.map((f) => (
                <details key={f.q} className="faq-item">
                  <summary>{f.q}</summary>
                  <div className="faq-answer">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="relative overflow-hidden section-pad" aria-label="Get help">
          <div
            className="wash wash-sky-mint"
            aria-hidden
            style={{ width: "40vw", height: "40vw", maxWidth: 600, maxHeight: 600, bottom: "-20vw", right: "-8vw" }}
          />
          <div className="container relative z-[1]">
            <div className="pledge-block">
              <p className="pledge-label">The Asmita promise</p>
              <p className="pledge-quote">You do not have to deal with this alone.</p>
              <p className="mt-6 text-[16px] leading-[1.5] text-[var(--color-graphite)]">
                Start a confidential report, or read how it works first. In your language,
                on your terms.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary" href="/faq">
                  Read the FAQ
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
