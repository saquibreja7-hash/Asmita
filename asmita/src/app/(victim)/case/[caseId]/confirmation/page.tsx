import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                Unavailable
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                Case confirmation is{" "}
                <em className="not-italic text-gradient">unavailable</em>.
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                Please verify your email again to continue.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/start">
                  Start
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Case created
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              We have your{" "}
              <em className="not-italic text-gradient">reference</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Your case is created. Keep the reference below safe - it is the
              only thing future emails will mention. We never include
              submitted URLs in email.
            </p>
          </div>
        </section>

        {/* REFERENCE BLOCK */}
        <section className="container py-12 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Reference number
            </p>
            <p className="font-mono mt-4 text-[28px] tracking-tight text-[var(--teal-dark)] md:text-[44px]">
              {record.referenceNumber}
            </p>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              Your dashboard shows platform status, response windows, and
              next steps. Bookmark it - you do not need to sign in again
              from the dashboard link.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href={`/case/${record.id}`}>
                Open dashboard
              </Link>
              <Link className="btn btn-secondary" href="/resources">
                Support resources
              </Link>
            </div>
          </div>
        </section>

        {/* WHAT HAPPENS NEXT */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              What happens next
            </p>
            <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
              The 24-hour clock has started.
            </h2>
            <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
              Each platform has 24 hours to respond. If they don&rsquo;t,
              Asmita escalates automatically at 48 hours and prepares a
              police-ready FIR package at the seven-day mark.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
