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
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">

            {/* LEFT - sticky sidebar */}
            <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  Case created
                </span>

                <p className="font-mono mt-4 text-[13px] text-[var(--muted)]">
                  {record.referenceNumber}
                </p>

                <p className="muted mt-5 text-sm leading-[1.75]">
                  Your fingerprint advisory has been submitted. Keep your reference number safe -
                  it is the only identifier in any future emails.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    ["Reference issued", "Your case has a permanent reference number you can quote to platforms or authorities."],
                    ["Advisory submitted", "The platform team has been notified with your image fingerprint."],
                    ["24-hour clock started", "Platforms must respond within 24 hours under Indian law. Asmita escalates automatically if they don't."],
                  ].map(([heading, detail]) => (
                    <div key={heading as string} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l2.5 2.5L9 1"
                            stroke="var(--teal)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-2">
                  <Link className="btn btn-primary w-full justify-center" href={`/case/${record.id}`}>
                    Open dashboard
                  </Link>
                  <Link className="btn btn-secondary w-full justify-center" href="/resources">
                    Support resources
                  </Link>
                </div>
              </div>
            </aside>

            {/* RIGHT - main content */}
            <div className="min-w-0 flex-1 space-y-10">
              <div>
                <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
                  We have your reference.
                </h1>
                <p className="muted mt-2 text-sm leading-[1.75]">
                  Your case is created and your fingerprint advisory has been sent.
                  Save your reference number below.
                </p>
              </div>

              {/* Reference number block */}
              <div
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Your case reference
                </p>
                <p className="font-mono mt-4 text-[32px] tracking-tight text-[var(--teal-dark)] md:text-[44px]">
                  {record.referenceNumber}
                </p>
                <p className="muted mt-4 text-sm leading-[1.75]">
                  Keep this number. We never include submitted URLs or images in email - only
                  your reference. Quote it when contacting platforms or authorities.
                </p>
              </div>

              {/* What happens next */}
              <div
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  What happens next
                </p>
                <h2 className="font-display mt-4 text-[22px] font-normal leading-[1.22] tracking-tight md:text-[26px]">
                  The 24-hour clock has started.
                </h2>
                <div className="mt-6 space-y-5">
                  {[
                    ["24 hours", "Platforms must act on your advisory under Rule 3(2)(b) of the IT Rules 2021."],
                    ["48 hours", "If no response, Asmita escalates to the platform's senior grievance officer automatically."],
                    ["7 days", "A police-ready FIR package is prepared for you if the content has not been removed."],
                  ].map(([time, detail]) => (
                    <div key={time as string} className="flex items-start gap-4">
                      <span className="font-mono mt-0.5 shrink-0 text-[13px] font-semibold text-[var(--teal-dark)] w-16">
                        {time}
                      </span>
                      <p className="muted text-sm leading-[1.65]">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
