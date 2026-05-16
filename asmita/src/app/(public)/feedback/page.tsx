import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FeedbackForm } from "@/app/(public)/feedback/FeedbackForm";

export default function FeedbackPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Feedback
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Tell us how Asmita
              <br />
              treated <em className="not-italic text-gradient">you</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Every response is read by a person. We do not ask for your
              name, your case URLs, or any intimate content — only what
              you want us to know about the experience.
            </p>
          </div>
        </section>

        {/* WHAT NOT TO SEND — quiet trauma-informed line */}
        <section className="container py-10 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.5] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.45]">
              Please do not paste intimate images, videos, or raw URLs here.
              This form is for service feedback only.
            </p>
          </div>
        </section>

        {/* THE FORM */}
        <section className="container py-10 md:py-14">
          <div className="mx-auto max-w-xl">
            <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              The form
            </p>
            <h2 className="font-display mt-4 text-center text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
              Three questions, none required.
            </h2>
            <FeedbackForm />
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-16 text-center md:pb-32 md:pt-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Thank you for taking the time.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              If you would rather write to a person, the team inbox is on
              the contact page.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-secondary" href="/contact">
                Contact Asmita
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                Read the FAQ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
