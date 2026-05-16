import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DeleteAccountForm } from "./DeleteAccountForm";

export default function DeleteAccountPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Account deletion
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              Delete your{" "}
              <em className="not-italic text-gradient">account</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              This schedules a soft delete immediately. A scheduled job
              permanently erases the account and all linked case data 30 days
              later. You can cancel within that window by writing to us.
            </p>
          </div>
        </section>

        {/* WHAT GETS DELETED */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              What gets deleted
            </p>
            <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
              Everything tied to your email.
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Account record.
                </span>{" "}
                Your email address, sign-in history, and any preferences.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Case data.
                </span>{" "}
                URLs, declarations, notice records, audit trails.
              </li>
            </ul>
            <p className="muted mx-auto mt-6 max-w-md text-sm leading-[1.7]">
              Anonymised aggregate notice statistics, which contain no
              personal data, are retained for accountability reporting.
            </p>
          </div>
        </section>

        {/* FORM */}
        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <DeleteAccountForm />
            <p className="mt-10 text-center">
              <Link
                href="/contact"
                className="link-underline text-sm text-[var(--foreground)]"
              >
                Cancel within 30 days · write to support
              </Link>
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
