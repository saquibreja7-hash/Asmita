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
};

registerReviewAdapter(labReportAdapter);
