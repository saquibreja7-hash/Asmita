import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container page-hero text-center">
            <div className="mx-auto max-w-2xl">
              <span className="eyebrow">{t(locale, "confirm.notAvailable.pill")}</span>
              <h1 className="page-title-sm mt-8">
                {t(locale, "confirm.notAvailable.title.1")}{" "}
                <em className="not-italic text-gradient">{t(locale, "confirm.notAvailable.title.em")}</em>
                {t(locale, "confirm.notAvailable.title.2")}
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                {t(locale, "confirm.notAvailable.sub")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/start">
                  {t(locale, "confirm.notAvailable.cta")}
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
                <span className="eyebrow">{t(locale, "confirm.pill")}</span>

                <p className="font-mono mt-4 text-[13px] text-[var(--text-muted)]">
                  {record.referenceNumber}
                </p>

                <p className="muted mt-5 text-sm leading-[1.75]">
                  {t(locale, "confirm.aside.sub")}
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    [t(locale, "confirm.aside.item1.heading"), t(locale, "confirm.aside.item1.detail")],
                    [t(locale, "confirm.aside.item2.heading"), t(locale, "confirm.aside.item2.detail")],
                    [t(locale, "confirm.aside.item3.heading"), t(locale, "confirm.aside.item3.detail")],
                  ].map(([heading, detail]) => (
                    <div key={heading as string} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l2.5 2.5L9 1"
                            stroke="var(--brand)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--ink)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-2">
                  <Link className="btn btn-primary w-full justify-center" href={`/case/${record.id}`}>
                    {t(locale, "confirm.cta.dashboard")}
                  </Link>
                  <Link className="btn btn-secondary w-full justify-center" href="/resources">
                    {t(locale, "confirm.cta.resources")}
                  </Link>
                </div>
              </div>
            </aside>

            {/* RIGHT - main content */}
            <div className="min-w-0 flex-1 space-y-10">
              <div>
                <h1 className="page-title-sm">
                  {t(locale, "confirm.title")}
                </h1>
                <p className="muted mt-2 text-sm leading-[1.75]">
                  {t(locale, "confirm.sub")}
                </p>
              </div>

              {/* Reference number block */}
              <div
                className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-8"
              >
                <p className="eyebrow">
                  {t(locale, "confirm.ref.eyebrow")}
                </p>
                <p className="font-mono mt-4 text-[32px] tracking-tight text-[var(--brand-strong)] md:text-[44px]">
                  {record.referenceNumber}
                </p>
                <p className="muted mt-4 text-sm leading-[1.75]">
                  {t(locale, "confirm.ref.body")}
                </p>
              </div>

              {/* What happens next */}
              <div
                className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-8"
              >
                <p className="eyebrow">
                  {t(locale, "confirm.next.eyebrow")}
                </p>
                <h2 className="subsection-title mt-4">
                  {t(locale, "confirm.next.title")}
                </h2>
                <div className="mt-6 space-y-5">
                  {[
                    [t(locale, "confirm.next.t1.time"), t(locale, "confirm.next.t1.detail")],
                    [t(locale, "confirm.next.t2.time"), t(locale, "confirm.next.t2.detail")],
                    [t(locale, "confirm.next.t3.time"), t(locale, "confirm.next.t3.detail")],
                  ].map(([time, detail]) => (
                    <div key={time as string} className="flex items-start gap-4">
                      <span className="mt-0.5 shrink-0 text-[13px] font-medium text-[var(--brand-strong)] w-16">
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
