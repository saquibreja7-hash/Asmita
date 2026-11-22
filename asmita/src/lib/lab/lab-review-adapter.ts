import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { labEnabled } from "@/lib/lab/flags";
import { getLabReport, listLabReports, sendLabReport } from "@/lib/lab/lab-reports";
import { registerReviewAdapter, type ReviewAdapter } from "@/lib/review-adapters";

/*
 * The Lab's review adapter (review-console-spec.md WP140, docs/lab/charter.md
 * boundary). This module is Lab code: it is the only place that names the
 * Lab's decision functions, and it registers itself with the shared review
 * registry. Queue code never imports lab modules directly — it asks the
 * registry, and the registry loads exactly this module on demand.
 *
 * An open lab report is a DRAFT the analyst has reviewed; the decisions are
 * the two ways the existing send route records a send — by email through the
 * Lab's Resend sender, or as a web-form submission the analyst made with the
 * copied text. Either way the stored text becomes the record, exactly as on
 * the AI Lab reports page.
 */

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const labReportAdapter: ReviewAdapter = {
  kind: "LAB_REPORT",
  permission: "lab:manage",
  decisions: [
    { code: "send_email", label: "Send by email", reasonKind: null },
    { code: "send_web_form", label: "Record web-form submission", reasonKind: null },
  ],
  async listOpenSubjects() {
    return (await listLabReports())
      .filter((report) => report.status === "DRAFT")
      .map((report) => ({ subjectId: report.id, caseId: null, minorHold: false }));
  },
  async subjectNeedsReview(reportId) {
    const report = await getLabReport(reportId);
    if (!report || report.status !== "DRAFT") return null;
    return { subjectId: reportId, caseId: null, minorHold: false };
  },
  async decide(reportId, decision, ctx) {
    if (!hasAdminPermission(ctx.role, "lab:manage")) return { ok: false, error: "permission_denied" };
    // The Lab's mutations are refused while ENABLE_LAB is off, like every
    // /api/lab route.
    if (!labEnabled()) return { ok: false, error: "lab_disabled" };
    if (decision === "send_web_form") {
      const outcome = await sendLabReport(reportId, { channel: "WEB_FORM" }, ctx.reviewerId);
      if (!outcome.ok) return outcome;
      return { ok: true, resolved: true, status: "SENT" };
    }
    if (decision === "send_email") {
      // The Lab page prefills the chokepoint's own abuse address; the same
      // prefill decides here. An address that is not an email means the
      // analyst must use the AI Lab page, where the address is typed in.
      const report = await getLabReport(reportId);
      if (!report) return { ok: false, error: "report_not_found" };
      if (!looksLikeEmail(report.abuseContact)) return { ok: false, error: "no_abuse_email" };
      const outcome = await sendLabReport(reportId, { channel: "EMAIL", to: report.abuseContact }, ctx.reviewerId);
      if (!outcome.ok) return outcome;
      return { ok: true, resolved: true, status: "SENT" };
    }
    return { ok: false, error: "invalid_payload" };
  },
  // WP141: the job screen's card for a draft report, built Lab-side because
  // nothing outside the Lab may import lab modules. The fields are the facts
  // the Lab reports page shows; Lab work, so no complaint-workflow masking
  // applies beyond never inventing anything the row does not carry.
  async describeSubject(reportId, now) {
    const report = await getLabReport(reportId);
    if (!report) return null;
    const fields: Array<{ label: string; value: string }> = [
      { label: "Service", value: `${report.serviceName} (${report.serviceId})` },
      { label: "Provider", value: report.provider },
      { label: "Kind", value: report.chokepointKind },
      { label: "Subject", value: report.subject },
      { label: "Status", value: report.status === "DRAFT" ? "Draft, waiting to be sent" : report.status },
      { label: "Abuse contact (prefill)", value: report.abuseContact },
      { label: "Drafted", value: `${shortLabAge(report.createdAt, now)} ago` },
    ];
    if (report.channel) fields.push({ label: "Channel", value: report.channel });
    return {
      summary: `Lab report: ${report.subject}`,
      caseId: null,
      caseReference: null,
      fields,
      urlsPurged: false,
    };
  },
};

/** "3h 10m", "2d 4h" — the console's age wording, for the Lab card only. */
function shortLabAge(iso: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

registerReviewAdapter(labReportAdapter);
