import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function IdentityPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              How we verify you
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              Your verified email is the{" "}
              <em className="not-italic text-gradient">only</em> identity we need.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Asmita does not ask for Aadhaar, PAN, or any government ID. The
              email you signed in with is the verified identity tied to every
              notice we send on your behalf.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              How verification works
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
              Three things, no documents.
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Email one-time code.
                </span>{" "}
                Each sign-in goes through a 6-digit code sent to your
                inbox.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Digital declaration.
                </span>{" "}
                You confirm, under penalty of law, that the content is
                non-consensual and that you have the right to ask for its
                removal.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Audit trail.
                </span>{" "}
                Every action is logged with timestamp and a cryptographic
                hash chain, so the notices we send have a verifiable
                history.
              </li>
            </ul>
          </div>
        </section>

        {/* WHY NOT AADHAAR */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Why no Aadhaar
            </p>
            <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[32px] md:leading-[1.18]">
              Collecting less is the safest design.
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              Aadhaar tightens the identity link but introduces a category of
              data that becomes a target. Asmita deliberately refuses to
              collect it. Platforms that act under IT Rules 2021 do not
              require Aadhaar to process a takedown.
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/submit">
                Continue to submit
              </Link>
              <Link className="btn btn-secondary" href="/privacy">
                Read the privacy policy
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
