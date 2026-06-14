import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser, isUserDeactivated } from "@/lib/case-ops";
import { listHashesForCase, type DisplayHashSubmission } from "@/lib/hash-submission";
import HashGenerator from "@/components/HashGenerator";
import { CaseDashboardActions } from "./CaseDashboardActions";

const HASH_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Awaiting review",
  APPROVED: "Approved – dispatch pending",
  DISPATCHED: "Sent to platforms",
  REJECTED: "Rejected",
};

export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;
  const deactivated =
    record && auth.ok ? await isUserDeactivated(auth.session.sub) : false;
  const hashUploadEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  let hashSubmissions: DisplayHashSubmission[] = [];
  if (record && hashUploadEnabled) {
    hashSubmissions = await listHashesForCase(record.id);
  }
  const skipLegalGate = process.env.DEV_SKIP_LEGAL_REVIEW === "true";
  const hasQueuedUrl = record?.urls.some(
    (u) => u.status === "NOTICE_QUEUED" || (skipLegalGate && u.status === "PENDING_REVIEW" && u.platformId),
  ) ?? false;
  const alreadySigned = record?.urls.some((u) => u.status === "NOTICE_SENT") ?? false;

  return (
    <AppShell>
      <div className="page-canvas">
        {!record ? (
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                Case not found
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                We could not find this{" "}
                <em className="not-italic text-gradient">case</em>.
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                Check the dashboard link from your email, or verify your
                email again to list your cases.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/register">
                  Verify email
                </Link>
                <Link className="btn btn-secondary" href="/resources">
                  Support resources
                </Link>
              </div>
            </div>
          </section>
        ) : deactivated ? (
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                Deletion scheduled
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                This case is paused.
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                Case access is paused while the 30-day hard-deletion window is
                active. If you wish to restore the account, please contact
                support before the window closes.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-secondary" href="/contact">
                  Contact Asmita
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* HEADER */}
            <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
              <div className="mx-auto max-w-2xl">
                <span className="pill">
                  <span className="dot" />
                  Case dashboard
                </span>
                <h1 className="font-display mt-8 font-mono text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
                  {record.referenceNumber}
                </h1>
                <p className="font-mono mt-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Created{" "}
                  {new Date(record.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  · IST
                </p>
              </div>
            </section>

            {/* URLS */}
            <section id="urls" className="container py-10 md:py-14">
              <div className="mx-auto max-w-3xl">
                <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Links in this case · {record.urls.length}
                </p>
                <h2 className="font-display mt-4 text-center text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
                  {record.urls.length === 0
                    ? "No links added yet."
                    : "Status by link."}
                </h2>

                {record.urls.length === 0 ? (
                  <p className="muted mx-auto mt-6 max-w-lg text-center text-base leading-[1.75]">
                    If the content has been posted somewhere, paste the link
                    here. Asmita will send a legal notice to the platform.
                    It will never open or view the URL.
                  </p>
                ) : (
                  <div className="mt-8 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--hairline)]">
                          <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            Platform
                          </th>
                          <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            Domain
                          </th>
                          <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.urls.map((url) => (
                          <tr
                            className="border-t border-[var(--hairline)]"
                            key={url.id}
                          >
                            <td className="p-4">
                              <Link
                                className="link-underline text-[var(--foreground)]"
                                href={`/case/${record.id}/url/${url.id}`}
                              >
                                {url.platformName}
                              </Link>
                            </td>
                            <td className="font-mono p-4 text-[var(--muted)]">
                              {url.domain}
                            </td>
                            <td className="p-4 capitalize">
                              {url.status.replaceAll("_", " ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* SIGN NOTICE — shown when admin has approved a URL for dispatch */}
            {hasQueuedUrl && !alreadySigned && (
              <section className="container py-10 md:py-14">
                <div className="mx-auto max-w-3xl rounded-[16px] border border-[var(--teal)] bg-[color-mix(in_srgb,var(--teal)_6%,white)] p-8 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--teal)]">
                    Action required
                  </p>
                  <h2 className="font-display mt-3 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[32px]">
                    Your notice is ready to sign.
                  </h2>
                  <p className="muted mx-auto mt-4 max-w-md text-sm leading-[1.75]">
                    Asmita has reviewed your submission and prepared a legal
                    takedown notice. Review it, add your details, and sign to
                    authorise dispatch.
                  </p>
                  <Link className="btn btn-primary mt-6" href={`/case/${caseId}/sign`}>
                    Review &amp; sign notice
                  </Link>
                </div>
              </section>
            )}

            {/* DIGITAL FINGERPRINTS (Phase 2, feature-gated) */}
            {hashUploadEnabled && (
              <section id="fingerprints" className="container py-10 md:py-14">
                <div className="mx-auto max-w-3xl">
                  <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    Digital fingerprints · {hashSubmissions.length}
                  </p>
                  <h2 className="font-display mt-4 text-center text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
                    Create a digital fingerprint.
                  </h2>
                  <p className="muted mx-auto mt-6 max-w-lg text-center text-base leading-[1.75]">
                    Select photos or videos from this device. A fingerprint is
                    generated here — the images never leave your device.
                    Platforms receive the fingerprint as part of a legal notice
                    and use it to block matching uploads automatically.
                  </p>

                  {hashSubmissions.length > 0 && (
                    <div className="mt-8 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
                      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--hairline)]">
                            <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              Fingerprint
                            </th>
                            <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              Quality
                            </th>
                            <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {hashSubmissions.map((submission) => (
                            <tr
                              className="border-t border-[var(--hairline)]"
                              key={submission.id}
                            >
                              <td className="font-mono p-4 text-[var(--muted)]">
                                {submission.hashDigest.slice(0, 12)}…
                              </td>
                              <td className="p-4 tabular-nums">
                                {submission.quality}/100
                              </td>
                              <td className="p-4">
                                {HASH_STATUS_LABELS[submission.status] ??
                                  submission.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-8">
                    <HashGenerator caseId={record.id} />
                  </div>
                </div>
              </section>
            )}

            {/* ACTIONS */}
            <section id="actions" className="container py-10 md:py-14">
              <div className="mx-auto max-w-3xl">
                <CaseDashboardActions
                  caseId={record.id}
                  firstUrlId={record.urls[0]?.id}
                />
              </div>
            </section>

            {/* TOOLBOX */}
            <section className="container pb-24 pt-10 text-center md:pb-32 md:pt-14">
              <div className="mx-auto max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Case tools
                </p>
                <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.2] tracking-tight md:text-[32px] md:leading-[1.18]">
                  Download, audit, or close.
                </h2>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link
                    className="btn btn-secondary"
                    href={`/api/cases/${record.id}/export`}
                  >
                    Download case PDF
                  </Link>
                  <Link
                    className="btn btn-secondary"
                    href={`/api/cases/${record.id}/audit-trail`}
                  >
                    View audit trail
                  </Link>
                  <Link className="btn btn-secondary" href="/delete-account">
                    Request deletion
                  </Link>
                  <Link className="btn btn-secondary" href="/resources">
                    Support resources
                  </Link>
                </div>
              </div>
            </section>

            {/* MOBILE NAV */}
            <nav
              className="fixed inset-x-0 bottom-12 z-30 grid grid-cols-4 border-t border-[var(--hairline)] bg-white/95 backdrop-blur text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] shadow-[0_-12px_30px_rgba(17,24,39,0.06)] lg:hidden"
              aria-label="Mobile case navigation"
            >
              <a className="py-3" href="#urls">
                URLs
              </a>
              <a className="py-3" href="#actions">
                Actions
              </a>
              <Link className="py-3" href="/resources">
                Support
              </Link>
              <Link className="py-3" href="/delete-account">
                Delete
              </Link>
            </nav>
          </>
        )}
      </div>
    </AppShell>
  );
}
