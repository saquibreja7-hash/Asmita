import Link from "next/link";
import { devFlagEnabled } from "@/lib/dev-flags";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { listHashesForCase, type DisplayHashSubmission } from "@/lib/hash-submission";
import { CrawlConsent } from "./CrawlConsent";
import { FoundByAsmita } from "./FoundByAsmita";
import { WatchFoundList } from "./WatchFoundList";
import { AddMoreImages } from "./AddMoreImages";
import { getCrawlConsentState } from "@/lib/crawl-consent";
import { crawlerFindingsVisibleToSurvivor } from "@/lib/crawler-flags";
import { splitUrls } from "./crawl-consent-logic";
import { CaseDashboardActions } from "./CaseDashboardActions";
import { CloseDashboardButton } from "../../CloseDashboardButton";
import { MarkRemovedButton } from "./MarkRemovedButton";
import { EscalationLadder } from "./EscalationLadder";
import { PlatformFiledButton } from "./PlatformFiledButton";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { findSignableHashAdvisory, findSignableNotice } from "@/lib/signable-notice";
import { findVoidedSignatures } from "@/lib/voided-signatures";
import { localizeRejectionReason } from "@/lib/rejection-reasons";

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

// Only a rejected link's reason is the admin's note to her; before a decision
// the same field holds internal flag codes, which are never shown.
function rejectedReason(stored: string | null | undefined, locale: Locale) {
  const text = localizeRejectionReason(stored, locale);
  if (!text) return null;
  return (
    <p className="mt-2 max-w-prose rounded-[var(--radius-box)] bg-[var(--page)] px-3 py-2 text-xs leading-[1.6] text-[var(--text)]">
      <span className="font-medium text-[var(--ink)]">{t(locale, "case.rejectedReason.label")}</span> {text}
    </p>
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
  // The fingerprint advisory can be signed here when it is unsigned (never
  // signed, or voided) and nothing was sent under an advisory yet.
  const canSignAdvisory = Boolean(record && usesDatabase && hashUploadEnabled && await findSignableHashAdvisory(record.id, skipLegalGate));

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

  // Links Asmita's search found are kept apart from the ones she submitted.
  const { own: ownUrls, found: foundUrls } = splitUrls(record.urls);
  // Where things stand is about the links she reported: Asmita's own notices
  // for found links promise no follow-up, so they never say "we follow up".
  const standing = standingOf(ownUrls, hashSubmissions.length);
  const showFound = crawlerFindingsVisibleToSurvivor();
  const created = new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  // "Watch for my images" (WP22): a watch renders its own view — no links are
  // asked for or listed as hers, only her fingerprints, the watch status and
  // the copies Asmita's search found (site name only, with her two choices).
  if (record.mode === "WATCH") {
    const consentState = await getCrawlConsentState(record.id);
    const watching = consentState.status === "signed";
    const watchingSince = watching && consentState.signedAt
      ? new Date(consentState.signedAt).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })
      : null;
    // Possible copies: the found links no notice has gone out for yet. A
    // stopped or sent link is history, not a choice.
    const copies = foundUrls.filter((url) => !url.representativeNoticeSentAt).length;
    return (
      <AppShell>
        <div className="page-canvas">
          <div className="container py-8 md:py-20">
            <div className="mx-auto max-w-2xl space-y-10">

              <header>
                <div className="flex items-start justify-between gap-4">
                  <p className="eyebrow">{t(locale, "case.watch.pill")}</p>
                  <CloseDashboardButton locale={locale} />
                </div>
                <h1 className="page-title-sm mt-4">{t(locale, "watch.title")}</h1>
                <p className="muted mt-3 text-sm leading-[1.7]">
                  {t(locale, "case.reference")}{" "}
                  <span className="font-mono text-[var(--ink)]">{record.referenceNumber}</span>
                  <span aria-hidden> · </span>
                  {t(locale, "case.created")} {created} {t(locale, "case.ist")}
                </p>
              </header>

              <section aria-labelledby="watch-status-title" className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
                {watching ? (
                  <>
                    <p className="eyebrow text-[var(--brand)]">{t(locale, "case.watch.watchingSince")} {watchingSince}</p>
                    <h2 id="watch-status-title" className="subsection-title mt-2">
                      {copies === 0
                        ? t(locale, "case.watch.noCopies")
                        : `${copies} ${t(locale, copies === 1 ? "case.watch.copyFound" : "case.watch.copiesFound")}`}
                    </h2>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">{t(locale, "case.watch.pill")}</p>
                    <h2 id="watch-status-title" className="subsection-title mt-2">{t(locale, "case.watch.notWatching.title")}</h2>
                    <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.watch.notWatching.sub")}</p>
                  </>
                )}
              </section>

              {showFound && <WatchFoundList caseId={record.id} urls={foundUrls} locale={locale} badge={(status) => <StatusBadge status={status} locale={locale} />} />}

              {hashUploadEnabled && hashSubmissions.length > 0 && (
                <section id="fingerprints" aria-labelledby="watch-fingerprints-title" className="scroll-mt-24">
                  <h2 id="watch-fingerprints-title" className="subsection-title">{t(locale, "case.fingerprints.title")}</h2>
                  <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                    {hashSubmissions.map((submission, index) => (
                      <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                        <span className="flex items-center gap-3">
                          <span className="text-[15px] font-medium text-[var(--ink)]">{t(locale, "case.fingerprints.item").replace("{n}", String(index + 1))}</span>
                          <span aria-hidden="true" className="select-none font-mono text-[15px] tracking-[0.2em] text-[var(--text-muted)]">••••••••</span>
                        </span>
                        <StatusBadge status={submission.status} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hashUploadEnabled && (
                <section aria-label={t(locale, "case.watch.addImages")} className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
                  <h2 className="subsection-title">{t(locale, "case.watch.addImages")}</h2>
                  <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.watch.addImages.hint")}</p>
                  <div className="mt-5">
                    <AddMoreImages caseId={record.id} locale={locale} />
                  </div>
                </section>
              )}

              {hashUploadEnabled && <CrawlConsent caseId={record.id} locale={locale} watch />}

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

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-2xl space-y-10">

            <header>
              <div className="flex items-start justify-between gap-4">
                <p className="eyebrow">{t(locale, "case.pill")}</p>
                <CloseDashboardButton locale={locale} />
              </div>
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

            {(voided.hashAdvisory || canSignAdvisory) && (
              <section aria-labelledby="case-advisory-voided-title" className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" role="status">
                <h2 id="case-advisory-voided-title" className="subsection-title">{t(locale, voided.hashAdvisory ? "case.voided.advisory.title" : "case.advisory.sign.title")}</h2>
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, voided.hashAdvisory ? "case.voided.advisory.sub" : "case.advisory.sign.sub")}</p>
                {canSignAdvisory && (
                  <Link className="btn btn-primary mt-5" href={`/case/${caseId}/sign?notice=advisory`}>{t(locale, "case.advisory.sign.cta")}</Link>
                )}
              </section>
            )}

            <section id="urls" aria-labelledby="case-links-title" className="scroll-mt-24">
              <h2 id="case-links-title" className="subsection-title">{t(locale, "case.urls.title")}</h2>
              {ownUrls.length === 0 ? (
                <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.urls.empty")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                  {ownUrls.map((url) => {
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
                        {url.status === "REJECTED" && rejectedReason(url.flagReason, locale)}
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

            {showFound && <FoundByAsmita urls={foundUrls} locale={locale} badge={(status) => <StatusBadge status={status} locale={locale} />} />}

            {hashUploadEnabled && hashSubmissions.length > 0 && (
              <section id="fingerprints" aria-labelledby="case-fingerprints-title" className="scroll-mt-24">
                <h2 id="case-fingerprints-title" className="subsection-title">{t(locale, "case.fingerprints.title")}</h2>
                <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                  {hashSubmissions.map((submission, index) => (
                    <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      {/* Masked like a password: the fingerprint itself means nothing to her
                          and should not sit on a shared screen. */}
                      <span className="flex items-center gap-3">
                        <span className="text-[15px] font-medium text-[var(--ink)]">{t(locale, "case.fingerprints.item").replace("{n}", String(index + 1))}</span>
                        <span aria-hidden="true" className="select-none font-mono text-[15px] tracking-[0.2em] text-[var(--text-muted)]">••••••••</span>
                      </span>
                      <StatusBadge status={submission.status} locale={locale} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hashUploadEnabled && hashSubmissions.length > 0 && <CrawlConsent caseId={record.id} locale={locale} />}

            <div className="space-y-3">
              <FoldedSection id="actions" title={t(locale, "case.actions.title")} hint={t(locale, "case.actions.hint")}>
                <CaseDashboardActions caseId={record.id} locale={locale} />
              </FoldedSection>
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
