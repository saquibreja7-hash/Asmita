import { t, type Locale } from "@/lib/i18n";

/*
 * The status pill a link or fingerprint wears. A plain shared component on
 * purpose (WP34): the watch page's found-copies list is a client component
 * (its "Take it down" and "Not now" buttons call the API), so it cannot
 * receive the old `badge` render function from the server page — Next.js
 * refuses to pass functions across the server→client boundary, which crashed
 * every watch page render. Both the server case page and the client list
 * render this component directly instead.
 */

const URL_STATUS_KEYS = {
  PENDING_REVIEW: "case.urlStatus.pendingReview",
  NOTICE_QUEUED: "case.urlStatus.queued",
  NOTICE_SENT: "case.urlStatus.sent",
  REMOVED: "case.urlStatus.resolved",
  UNRESOLVED: "case.urlStatus.unresolved",
  ESCALATED: "case.urlStatus.escalated",
  REJECTED: "case.urlStatus.rejected",
} as const;

export function StatusBadge({ status, locale, unknown = false }: { status: string; locale: Locale; unknown?: boolean }) {
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
