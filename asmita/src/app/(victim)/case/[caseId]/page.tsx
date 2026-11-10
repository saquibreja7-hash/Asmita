import Link from "next/link";
import { devFlagEnabled } from "@/lib/dev-flags";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { listHashesForCase, type DisplayHashSubmission } from "@/lib/hash-submission";
import HashGenerator from "@/components/HashGenerator";
import { CaseDashboardActions } from "./CaseDashboardActions";
import { MarkRemovedButton } from "./MarkRemovedButton";
import { EscalationLadder } from "./EscalationLadder";
import { PlatformFiledButton } from "./PlatformFiledButton";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { findSignableNotice } from "@/lib/signable-notice";
import { findVoidedSignatures } from "@/lib/voided-signatures";

// Wording that matches what has actually happened: "prepared" is not "sent",
// and "sent" is not "removed".
const URL_STATUS_KEYS = {
  PENDING_REVIEW: "case.urlStatus.pendingReview",
  NOTICE_QUEUED: "case.urlStatus.queued",
  NOTICE_SENT: "case.urlStatus.sent",
  REMOVED: "case.urlStatus.resolved",
  UNRESOLVED: "case.urlStatus.unresolved",
  ESCALATED: "case.urlStatus.escalated",
  REJECTED: "case.urlStatus.rejected",
} as const;

function StatusBadge({ status, locale, unknown = false }: { status: string; locale: Locale; unknown?: boolean }) {
  const key = URL_STATUS_KEYS[status as keyof typeof URL_STATUS_KEYS];
  const label = unknown && status === "PENDING_REVIEW" ? (locale === "hi" ? "रिपोर्टिंग रास्ते की जाँच जारी" : "Reporting route under review") : key ? t(locale, key) : status.replaceAll("_", " ");
  const color =
    status === "REMOVED"
      ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
      : status === "NOTICE_SENT" || status === "NOTICE_QUEUED"
      ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : status === "ESCALATED"
      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
      : "bg-[var(--page)] text-[var(--text-muted)]";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {label}
    </span>
  );
}

// One plain sentence about where the case stands, picked from the most
// advanced link. Signing is handled separately, as the only call to action.
type Standing = "removed" | "sent" | "filed" | "prepared" | "checking" | "fingerprints" | "open";
function standingOf(urls: { status: string; platformFiledAt?: string | null }[], fingerprintCount: number): Standing {
  const statuses = urls.map((url) => url.status);
  if (statuses.length === 0) return fingerprintCount > 0 ? "fingerprints" : "open";
  if (statuses.every((s) => s === "REMOVED")) return "removed";
  if (statuses.some((s) => s === "NOTICE_SENT" || s === "ESCALATED")) return "sent";
  if (urls.some((url) => url.platformFiledAt && url.status !== "REMOVED" && url.status !== "REJECTED")) return "filed";
  if (statuses.includes("NOTICE_QUEUED")) return "prepared";
  if (statuses.includes("PENDING_REVIEW")) return "checking";
  return "open";
}

const STANDING_KEYS: Record<Standing, readonly [MessageKey, MessageKey]> = {
  removed: ["case.now.removed.title", "case.now.removed.sub"],
  sent: ["case.now.sent.title", "case.now.sent.sub"],
  filed: ["case.now.filed.title", "case.now.filed.sub"],
  prepared: ["case.now.prepared.title", "case.now.prepared.sub"],
  checking: ["case.now.checking.title", "case.now.checking.sub"],
  fingerprints: ["case.now.fingerprints.title", "case.now.fingerprints.sub"],
  open: ["case.now.open.title", "case.now.open.sub"],
};

function FoldedSection({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium text-[var(--ink)]">{title}</span>
          <span className="muted block text-sm">{hint}</span>
        </span>
        <span className="text-[22px] leading-none text-[var(--text-muted)] transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <div className="border-t border-[var(--line)] px-5 pb-5 pt-4">{children}</div>
    </details>
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
  const hashUploadEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  let hashSubmissions: DisplayHashSubmission[] = [];
  if (record && hashUploadEnabled) {
    hashSubmissions = await listHashesForCase(record.id);
  }
  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  // The complaint and appeal drafts are legal text: a human legal reviewer
  // turns them on (docs/product/escalation-ladder.md). Never set in wrangler.jsonc
  // until that review is done.
  const draftsEnabled = process.env.ESCALATION_DRAFTS_REVIEWED === "true" || skipLegalGate;
  const usesDatabase = process.env.NODE_ENV === "production" || Boolean(process.env.DATABASE_URL);
  const hasUnsignedQueuedUrl = Boolean(record && usesDatabase && await findSignableNotice(record.id, skipLegalGate));
  // A signature voided since it was given: say why the sign step is back.
  const voided = record && usesDatabase ? await findVoidedSignatures(record.id) : { urlIds: [], hashAdvisory: false };
  const resign = hasUnsignedQueuedUrl && voided.urlIds.length > 0;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container page-hero text-center">
            <div className="mx-auto max-w-2xl">
              <span className="eyebrow">{t(locale, "case.notFound.pill")}</span>
              <h1 className="page-title-sm mt-8">
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

  const standing = standingOf(record.urls, hashSubmissions.length);
  const created = new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-2xl space-y-10">

            <header>
              <p className="eyebrow">{t(locale, "case.pill")}</p>
              <h1 className="page-title-sm mt-4">{t(locale, "case.heading")}</h1>
              <p className="muted mt-3 text-sm leading-[1.7]">
                {t(locale, "case.reference")}{" "}
                <span className="font-mono text-[var(--ink)]">{record.referenceNumber}</span>
                <span aria-hidden> · </span>
                {t(locale, "case.created")} {created} {t(locale, "case.ist")}
              </p>
            </header>

            {/* Where things stand: the one thing to read, and the one action if there is one. */}
            {hasUnsignedQueuedUrl ? (
              <section aria-labelledby="case-standing-title" className="rounded-[var(--radius-box)] border border-[var(--brand)] bg-[var(--card)] p-6">
                <p className="eyebrow text-[var(--brand)]">{t(locale, "case.sign.pill")}</p>
                <h2 id="case-standing-title" className="subsection-title mt-2">{t(locale, resign ? "case.voided.title" : "case.sign.title")}</h2>
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, resign ? "case.voided.sub" : "case.sign.sub")}</p>
                <Link className="btn btn-primary mt-5" href={`/case/${caseId}/sign`}>{t(locale, "case.sign.cta")}</Link>
              </section>
            ) : (
              <section aria-labelledby="case-standing-title" className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
                <p className="eyebrow">{t(locale, "case.now.eyebrow")}</p>
                <h2 id="case-standing-title" className="subsection-title mt-2">{t(locale, STANDING_KEYS[standing][0])}</h2>
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, STANDING_KEYS[standing][1])}</p>
              </section>
            )}

            {voided.hashAdvisory && (
              <section aria-labelledby="case-advisory-voided-title" className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" role="status">
                <h2 id="case-advisory-voided-title" className="subsection-title">{t(locale, "case.voided.advisory.title")}</h2>
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.voided.advisory.sub")}</p>
              </section>
            )}

            <section id="urls" aria-labelledby="case-links-title" className="scroll-mt-24">
              <h2 id="case-links-title" className="subsection-title">{t(locale, "case.urls.title")}</h2>
              {record.urls.length === 0 ? (
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.urls.empty")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                  {record.urls.map((url) => {
                    const entry = findPlatformByDomain(url.domain);
                    const live = url.status !== "REMOVED" && url.status !== "REJECTED";
                    const startedAt = url.noticeSentAt ?? url.platformFiledAt ?? null;
                    // Only a human-verified form is offered, as on the handoff page.
                    const formUrl = entry?.grievanceEmail === HUMAN_VERIFICATION_REQUIRED && entry.lastContactVerifiedByHuman ? entry.formUrl : undefined;
                    return (
                    <li key={url.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
                      <div className="min-w-0">
                        <Link className="link-underline font-medium text-[var(--ink)]" href={`/case/${record.id}/url/${url.id}`}>
                          {url.platformName}
                        </Link>
                        <p className="font-mono mt-0.5 text-[12px] text-[var(--text-muted)]">{url.domain}</p>
                        {!url.urlHash && <p className="muted mt-1 text-xs">{t(locale, "case.urlExpired")}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {/* She filed the platform's own form: for her, it has been sent. */}
                        <StatusBadge status={url.platformFiledAt && (url.status === "NOTICE_QUEUED" || url.status === "PENDING_REVIEW") ? "NOTICE_SENT" : url.status} locale={locale} unknown={!entry && !url.platformFiledAt} />
                        {url.status !== "REMOVED" && url.status !== "REJECTED" && (
                          <MarkRemovedButton caseId={record.id} urlId={url.id} platformName={url.platformName} locale={locale} />
                        )}
                      </div>
                      {live && startedAt ? (
                        <EscalationLadder
                          locale={locale}
                          platform={url.platformName}
                          route={url.noticeSentAt ? "EMAIL" : "FORM"}
                          startedAt={startedAt}
                          status={url.status}
                          responseType={url.responseType}
                          responseAt={url.responseAt}
                          reference={record.referenceNumber}
                          draftsEnabled={draftsEnabled}
                        />
                      ) : live && formUrl ? (
                        <PlatformFiledButton caseId={record.id} urlId={url.id} platform={url.platformName} formUrl={formUrl} locale={locale} />
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {hashUploadEnabled && hashSubmissions.length > 0 && (
              <section id="fingerprints" aria-labelledby="case-fingerprints-title" className="scroll-mt-24">
                <h2 id="case-fingerprints-title" className="subsection-title">{t(locale, "case.fingerprints.title")}</h2>
                <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                  {hashSubmissions.map((submission) => (
                    <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <span className="font-mono text-[13px] text-[var(--text-muted)]">{submission.hashDigest.slice(0, 12)}…</span>
                      <StatusBadge status={submission.status} locale={locale} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="space-y-3">
              <FoldedSection id="actions" title={t(locale, "case.actions.title")} hint={t(locale, "case.actions.hint")}>
                <CaseDashboardActions caseId={record.id} locale={locale} />
              </FoldedSection>
              {hashUploadEnabled && (
                <FoldedSection id="add-fingerprint" title={t(locale, "case.fingerprints.add")} hint={t(locale, "case.fingerprints.hint")}>
                  <p className="muted mb-4 text-sm leading-[1.75]">{t(locale, "case.fingerprints.sub")}</p>
                  <HashGenerator caseId={record.id} />
                </FoldedSection>
              )}
            </div>

            <nav aria-label={t(locale, "case.more.label")} className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-6 text-sm">
              <Link className="link-underline text-[var(--ink)]" href="/get-help">{t(locale, "case.more.help")}</Link>
              <Link className="link-underline text-[var(--ink)]" href="/resources">{t(locale, "case.tools.resources")}</Link>
              <Link className="link-underline text-[var(--text-muted)] hover:text-[var(--danger)]" href="/delete-account">{t(locale, "case.tools.delete")}</Link>
            </nav>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
