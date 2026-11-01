import Link from "next/link";
import { devFlagEnabled } from "@/lib/dev-flags";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser, isUserDeactivated } from "@/lib/case-ops";
import { listHashesForCase, type DisplayHashSubmission } from "@/lib/hash-submission";
import HashGenerator from "@/components/HashGenerator";
import { CaseDashboardActions } from "./CaseDashboardActions";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale } from "@/lib/i18n";

// Wording that matches what has actually happened: "prepared" is not "sent",
// and "sent" is not "removed".
const URL_STATUS_KEYS = {
  PENDING_REVIEW: "case.urlStatus.pendingReview",
  NOTICE_QUEUED: "case.urlStatus.queued",
  NOTICE_SENT: "case.urlStatus.sent",
  RESOLVED: "case.urlStatus.resolved",
  ESCALATED: "case.urlStatus.escalated",
  REJECTED: "case.urlStatus.rejected",
} as const;

function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const key = URL_STATUS_KEYS[status as keyof typeof URL_STATUS_KEYS];
  const label = key ? t(locale, key) : status.replaceAll("_", " ");
  const color =
    status === "RESOLVED"
      ? "bg-[var(--teal-soft)] text-[var(--teal-dark)]"
      : status === "NOTICE_SENT" || status === "NOTICE_QUEUED"
      ? "bg-[#f3ead0] text-[var(--warning)]"
      : status === "ESCALATED"
      ? "bg-[#f8e1de] text-[var(--danger)]"
      : "bg-[var(--background)] text-[var(--muted)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {label}
    </span>
  );
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;
  const deactivated = record && auth.ok ? await isUserDeactivated(auth.session.sub) : false;
  const hashUploadEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  let hashSubmissions: DisplayHashSubmission[] = [];
  if (record && hashUploadEnabled) {
    hashSubmissions = await listHashesForCase(record.id);
  }
  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const hasUnsignedQueuedUrl = record?.urls.some((u) =>
    (u.status === "NOTICE_QUEUED" ||
      (skipLegalGate && u.status === "PENDING_REVIEW" && u.platformId)) &&
    !u.hasSignedNotice,
  ) ?? false;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill"><span className="dot" />{t(locale, "case.notFound.pill")}</span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                {t(locale, "case.notFound.title.1")}{" "}
                <em className="not-italic text-gradient">{t(locale, "case.notFound.title.em")}</em>
                {t(locale, "case.notFound.title.2")}
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg">
                {t(locale, "case.notFound.sub")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/register">{t(locale, "case.notFound.cta1")}</Link>
                <Link className="btn btn-secondary" href="/resources">{t(locale, "case.notFound.cta2")}</Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  if (deactivated) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill"><span className="dot" />{t(locale, "case.deactivated.pill")}</span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                {t(locale, "case.deactivated.title")}
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg">
                {t(locale, "case.deactivated.sub")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-secondary" href="/contact">{t(locale, "case.deactivated.cta")}</Link>
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
        <div className="container py-8 md:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-12 md:flex-row md:items-start md:gap-16">

            {/* LEFT - sticky case sidebar */}
            <aside className="order-2 md:order-1 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  {t(locale, "case.pill")}
                </span>

                <p className="font-mono mt-5 text-[22px] font-normal leading-[1.2] tracking-tight text-[var(--foreground)]">
                  {record.referenceNumber}
                </p>
                <p className="muted mt-1 text-[11px] leading-[1.6]">
                  {t(locale, "case.created")}{" "}
                  {new Date(record.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  {t(locale, "case.ist")}
                </p>

                {/* Summary stats */}
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-center">
                    <p className="font-mono text-[20px] font-normal text-[var(--foreground)]">
                      {record.urls.length}
                    </p>
                    <p className="muted text-[11px]">{t(locale, "case.stat.links")}</p>
                  </div>
                  {hashUploadEnabled && (
                    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-center">
                      <p className="font-mono text-[20px] font-normal text-[var(--foreground)]">
                        {hashSubmissions.length}
                      </p>
                      <p className="muted text-[11px]">{t(locale, "case.stat.fingerprints")}</p>
                    </div>
                  )}
                </div>

                {/* Section nav */}
                <nav className="mt-6 space-y-1" aria-label="Case sections">
                  {[
                    { href: "#urls", label: t(locale, "case.nav.links") },
                    ...(hashUploadEnabled ? [{ href: "#fingerprints", label: t(locale, "case.nav.fingerprints") }] : []),
                    { href: "#actions", label: t(locale, "case.nav.addLink") },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--teal-soft)] hover:text-[var(--teal-dark)]"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                {/* Case tools */}
                <div className="mt-6 space-y-1.5">
                  <p className="px-2 font-mono text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
                    {t(locale, "case.tools.label")}
                  </p>
                  <Link
                    href="/resources"
                    className="flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--teal-soft)] hover:text-[var(--teal-dark)]"
                  >
                    {t(locale, "case.tools.resources")}
                  </Link>
                  <Link
                    href="/delete-account"
                    className="flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[#f8e1de] hover:text-[var(--rose)]"
                  >
                    {t(locale, "case.tools.delete")}
                  </Link>
                </div>
              </div>
            </aside>

            {/* RIGHT - main content */}
            <div className="order-1 min-w-0 flex-1 md:order-2 space-y-10">

              {/* Sign notice CTA */}
              {hasUnsignedQueuedUrl && (
                <div className="rounded-[24px] border border-[var(--teal)] bg-[color-mix(in_srgb,var(--teal)_6%,white)] p-6">
                  <p className="font-mono text-[12px] uppercase tracking-[-0.033em] text-[var(--teal)]">
                    {t(locale, "case.sign.pill")}
                  </p>
                  <h2 className="font-display mt-2 text-[22px] font-normal leading-[1.2] tracking-tight md:text-[26px]">
                    {t(locale, "case.sign.title")}
                  </h2>
                  <p className="muted mt-3 text-sm leading-[1.75]">
                    {t(locale, "case.sign.sub")}
                  </p>
                  <Link className="btn btn-primary mt-5" href={`/case/${caseId}/sign`}>
                    {t(locale, "case.sign.cta")}
                  </Link>
                </div>
              )}

              {/* URLs */}
              <section id="urls" className="scroll-mt-24">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[26px]">
                    {t(locale, "case.urls.title")}
                  </h2>
                  <span className="font-mono text-[11px] text-[var(--muted)]">
                    {record.urls.length} {record.urls.length === 1 ? t(locale, "case.urls.linkSingular") : t(locale, "case.urls.linkPlural")}
                  </span>
                </div>

                {record.urls.length === 0 ? (
                  <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center"
                  >
                    <p className="muted text-sm leading-[1.75]">
                      {t(locale, "case.urls.empty")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[500px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--hairline)]">
                            {[t(locale, "case.urls.col.platform"), t(locale, "case.urls.col.domain"), t(locale, "case.urls.col.status")].map((h) => (
                              <th key={h} className="font-mono px-5 py-3 text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--hairline)]">
                          {record.urls.map((url) => (
                            <tr key={url.id} className="hover:bg-[var(--background)] transition-colors">
                              <td className="px-5 py-3.5">
                                <Link
                                  className="link-underline text-[var(--foreground)]"
                                  href={`/case/${record.id}/url/${url.id}`}
                                >
                                  {url.platformName}
                                </Link>
                              </td>
                              <td className="font-mono px-5 py-3.5 text-[var(--muted)] text-[13px]">
                                {url.domain}
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusBadge status={url.status} locale={locale} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              {/* Digital fingerprints */}
              {hashUploadEnabled && (
                <section id="fingerprints" className="scroll-mt-24">
                  <div className="mb-4 flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[26px]">
                      {t(locale, "case.fingerprints.title")}
                    </h2>
                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      {hashSubmissions.length} {hashSubmissions.length === 1 ? t(locale, "case.fingerprints.singular") : t(locale, "case.fingerprints.plural")}
                    </span>
                  </div>
                  <p className="muted mb-5 text-sm leading-[1.75]">
                    {t(locale, "case.fingerprints.sub")}
                  </p>

                  {hashSubmissions.length > 0 && (
                    <div className="mb-5 overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]"
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--hairline)]">
                              {[t(locale, "case.fingerprints.col.fp"), t(locale, "case.fingerprints.col.quality"), t(locale, "case.fingerprints.col.status")].map((h) => (
                                <th key={h} className="font-mono px-5 py-3 text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--hairline)]">
                            {hashSubmissions.map((submission) => (
                              <tr key={submission.id} className="hover:bg-[var(--background)] transition-colors">
                                <td className="font-mono px-5 py-3.5 text-[13px] text-[var(--muted)]">
                                  {submission.hashDigest.slice(0, 12)}…
                                </td>
                                <td className="px-5 py-3.5 tabular-nums">{submission.quality}/100</td>
                                <td className="px-5 py-3.5">
                                  <StatusBadge status={submission.status} locale={locale} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <HashGenerator caseId={record.id} />
                </section>
              )}

              {/* Actions */}
              <section id="actions" className="scroll-mt-24">
                <CaseDashboardActions caseId={record.id} firstUrlId={record.urls[0]?.id} locale={locale} />
              </section>

            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
