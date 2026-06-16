import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function StartPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Before you start
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Two paths.{" "}
              <em className="not-italic text-gradient">Your</em> safety first.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              The flow you see next depends on your age. Nothing is stored until
              you sign in with email - and minors do not sign in at all.
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* PATH CARDS */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">

            <div className="grid items-stretch gap-3 md:grid-cols-2">

              {/* Adult path */}
              <div
                className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  18 or older
                </p>
                <h2 className="font-display mt-3 text-[20px] font-normal leading-[1.25] tracking-tight text-[var(--foreground)] md:text-[23px]">
                  Continue to private case setup.
                </h2>
                <p className="muted mt-3 text-sm leading-[1.75] flex-1">
                  Verify your email with a one-time code, sign a digital
                  declaration, and submit links as text only. Takes about ten
                  minutes and you can pause and resume at any point. By
                  continuing you confirm you are an adult acting on your own
                  behalf, or an authorised NGO vouching with the
                  survivor&rsquo;s consent.
                </p>
                <Link className="btn btn-primary mt-7 w-full justify-center" href="/eligibility">
                  I am 18 or older, continue
                </Link>
              </div>

              {/* Minor path */}
              <div
                className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Under 18
                </p>
                <h2 className="font-display mt-3 text-[20px] font-normal leading-[1.25] tracking-tight text-[var(--foreground)] md:text-[23px]">
                  Go to support resources.
                </h2>
                <p className="muted mt-3 text-sm leading-[1.75] flex-1">
                  Asmita does not collect URLs from anyone under 18. You will be
                  taken to CHILDLINE 1098, TakeItDown (NCMEC), and
                  cybercrime.gov.in with guided instructions. No account, case,
                  or URL record is created.
                </p>
                <Link className="btn btn-secondary mt-7 w-full justify-center" href="/start/minor">
                  I am under 18, find help
                </Link>
              </div>

            </div>

          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* SAFETY + CLOSING */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-xl space-y-5">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[24px]">
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
            <p className="muted text-base leading-[1.75]">
              Want to understand the flow first? Read{" "}
              <Link href="/how-it-works" className="link-underline text-[var(--foreground)]">
                how Asmita works
              </Link>{" "}
              or the{" "}
              <Link href="/privacy" className="link-underline text-[var(--foreground)]">
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
