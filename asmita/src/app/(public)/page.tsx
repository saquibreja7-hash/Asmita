import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function HomePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO — centered, super-minimal, OpenAI-style restraint */}
        <section className="container pb-20 pt-20 text-center md:pb-28 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Asmita · अस्मिता · for women in India
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              You don&rsquo;t have to face this{" "}
              <em className="not-italic text-gradient">alone</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Free, confidential, and built around your dignity.
            </p>
            <div className="mt-10 flex justify-center">
              <Link className="btn btn-primary" href="/start">
                Start a case
              </Link>
            </div>
            <p className="mt-6">
              <Link
                href="/minor-support"
                className="text-sm font-medium text-[var(--muted)] link-underline"
              >
                Under 18? Find help{" "}
                <span className="cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>
            <p className="muted mx-auto mt-12 max-w-md text-[13px] leading-[1.7]">
              We never fetch, view, download, or store the content at any link
              you share.
            </p>
          </div>
        </section>

        {/* VALIDATION — short trauma-informed line before the content blocks */}
        <section className="container pb-8 pt-10 text-center md:pb-12 md:pt-16">
          <p className="font-display mx-auto max-w-2xl text-xl leading-[1.55] tracking-tight text-[var(--foreground)] md:text-2xl md:leading-[1.5]">
            What you&rsquo;re feeling is valid. None of this is your fault.
          </p>
        </section>

        {/* BLOCK A — the right (question framing) */}
        <section className="container py-20 text-center md:py-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Did you know Indian law requires platforms to act in 24 hours?
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Most people don&rsquo;t. Asmita turns that right into one calm
              flow — paste links, review notices, and watch responses come in.
            </p>
            <p className="mt-8">
              <Link href="/how-it-works" className="link-underline text-sm">
                How notices route{" "}
                <span className="cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>
          </div>
        </section>

        {/* BLOCK B — privacy (three concrete commitments) */}
        <section className="container py-20 text-center md:py-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Privacy is the architecture,
              <br />
              not the marketing.
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never fetch your URLs.
                </span>{" "}
                Servers only parse the domain string.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never store the media.
                </span>{" "}
                Only the notice metadata is kept.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never share without you.
                </span>{" "}
                No third party sees your case unless you route it there.
              </li>
            </ul>
            <p className="mt-10">
              <Link href="/privacy" className="link-underline text-sm">
                Read the privacy promise{" "}
                <span className="cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>
          </div>
        </section>

        {/* CLOSING — invitation, not a sales pitch */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Begin when you are ready.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              There is no clock running. You can start, stop, and come back.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                Start a case
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                Read the FAQ
              </Link>
            </div>
            <p className="muted mx-auto mt-14 max-w-md text-[13px] leading-[1.7]">
              Notice templates reviewed by{" "}
              <span className="text-[var(--foreground)]">
                Internet Freedom Foundation
              </span>{" "}
              and{" "}
              <span className="text-[var(--foreground)]">SFLC.in</span>.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
