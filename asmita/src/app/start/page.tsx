import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function StartPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Before you start
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Two paths.
              <br />
              <em className="not-italic text-gradient">Your</em> safety first.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              The flow you see next depends on your age. Nothing is stored
              until you sign in with email - and minors do not sign in at all.
            </p>
          </div>
        </section>

        {/* ADULT PATH */}
        <section className="container py-12 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Path 01 · 18 or older
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              Continue to private case setup.
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              You will verify your email with a one-time code, sign a digital
              declaration, and submit links as text only. The flow takes about
              ten minutes and you can pause and resume at any point.
            </p>
            <div className="mt-10 flex justify-center">
              <Link className="btn btn-primary" href="/register">
                I am 18 or older - continue
              </Link>
            </div>
            <p className="muted mx-auto mt-6 max-w-md text-[13px] leading-[1.7]">
              By continuing you confirm that you are an adult acting on your
              own behalf, or an authorised NGO vouching with the survivor&rsquo;s
              consent.
            </p>
          </div>
        </section>

        {/* MINOR PATH */}
        <section className="container py-12 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Path 02 · Under 18
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              Go to support resources.
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              Asmita does not collect URLs from anyone under 18. You will be
              taken to CHILDLINE 1098, TakeItDown (NCMEC), and
              cybercrime.gov.in with guided instructions. No account, case,
              session, notice, or URL record is created.
            </p>
            <div className="mt-10 flex justify-center">
              <Link className="btn btn-secondary" href="/start/minor">
                I am under 18 - find help
              </Link>
            </div>
          </div>
        </section>

        {/* SAFETY NOTE */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.5]">
              If you are in immediate danger, call{" "}
              <a
                href="tel:112"
                aria-label="Call emergency services 112"
                className="link-underline text-[var(--foreground)]"
              >
                112
              </a>{" "}
              before anything else.
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <p className="muted mx-auto max-w-lg text-base leading-[1.75] md:text-lg">
              Want to understand the flow first? Read{" "}
              <Link
                href="/how-it-works"
                className="link-underline text-[var(--foreground)]"
              >
                how Asmita works
              </Link>{" "}
              or the{" "}
              <Link
                href="/privacy"
                className="link-underline text-[var(--foreground)]"
              >
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
