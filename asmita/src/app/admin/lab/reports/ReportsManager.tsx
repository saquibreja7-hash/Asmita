"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { LAB_REPORT_OUTCOMES, type LabReportOutcome } from "@/lib/lab/lab-store";
import type { LabReportView } from "@/lib/lab/lab-reports";

// The E2 report flow (docs/lab/charter.md): draft from the per-kind template,
// review and edit the text, send by email (Resend, lab sender) or copy it
// for the provider's web form, and record the outcome. A sent report is the
// record: it can no longer be edited.

const OUTCOME_OPTIONS = LAB_REPORT_OUTCOMES;

const ERRORS: Record<string, string> = {
  invalid_payload: "The server did not accept those values. Check them and try again.",
  chokepoint_not_found: "That chokepoint no longer exists. Reload the page.",
  report_not_found: "That report no longer exists. Reload the page.",
  report_not_sent: "The outcome is recorded on sent reports only. Send it first.",
  report_already_sent: "This report was already sent. The sent text is the record.",
  email_send_failed: "The email could not be sent. Nothing was recorded; try again.",
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Only a SUPER_ADMIN can manage the Lab.",
  rate_limited: "Too many changes this hour. Try again later.",
  lab_disabled: "The Lab is switched off (ENABLE_LAB), so nothing can be changed. Nothing was saved.",
};

async function send(path: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: boolean; message: string | null }> {
  try {
    const response = await csrfFetch(path, { method, body: JSON.stringify(body) });
    if (response.ok) return { ok: true, message: null };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: ERRORS[data?.error ?? ""] ?? `Not saved (${data?.error ?? `status ${response.status}`}).` };
  } catch {
    return { ok: false, message: "Not saved: the request failed." };
  }
}

type ChokepointOption = { id: string; label: string; abuseContact: string };

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function ReportsManager({
  chokepoints,
  reports,
  labEnabled = true,
}: {
  chokepoints: ChokepointOption[];
  reports: LabReportView[];
  labEnabled?: boolean;
}) {
  const router = useRouter();
  const [chokepointId, setChokepointId] = useState(chokepoints[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [draftEdit, setDraftEdit] = useState<{ subject: string; body: string }>({ subject: "", body: "" });
  const [sendTo, setSendTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [providerReference, setProviderReference] = useState("");

  async function draft() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await send("/api/lab/reports", "POST", { chokepointId });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Drafted from the per-kind template. Review the text before sending.");
    router.refresh();
  }

  function toggle(report: LabReportView) {
    if (open === report.id) {
      setOpen(null);
      return;
    }
    setOpen(report.id);
    setError(null);
    setNotice(null);
    setCopied(false);
    setDraftEdit({ subject: report.subject, body: report.body });
    setSendTo(looksLikeEmail(report.abuseContact) ? report.abuseContact : "");
    setProviderReference(report.providerReference ?? "");
  }

  async function saveDraft(id: string) {
    setBusy(true);
    const result = await send(`/api/lab/reports/${id}`, "PATCH", draftEdit);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Draft saved.");
    router.refresh();
  }

  async function sendReport(id: string, channel: "EMAIL" | "WEB_FORM") {
    setBusy(true);
    const result = await send(`/api/lab/reports/${id}/send`, "POST", channel === "EMAIL" ? { channel, to: sendTo.trim() } : { channel });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice(channel === "EMAIL" ? "Sent by email. The sent text is now the record." : "Recorded as submitted on the provider's web form.");
    router.refresh();
  }

  async function copyForWebForm() {
    const text = `${draftEdit.subject}\n\n${draftEdit.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("The browser would not let the page write to the clipboard. Select the text and copy it by hand.");
    }
  }

  async function recordOutcome(id: string, outcome: LabReportOutcome) {
    setBusy(true);
    const result = await send(`/api/lab/reports/${id}/outcome`, "POST", {
      outcome,
      ...(providerReference.trim() ? { providerReference: providerReference.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Outcome recorded.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && <p className="text-sm text-[var(--brand)]" role="status">{notice}</p>}
        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      </div>

      <div className="a-card flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="lab-report-chokepoint">Draft a report for</label>
          <select id="lab-report-chokepoint" className="field" value={chokepointId} onChange={(e) => setChokepointId(e.target.value)}>
            {chokepoints.length === 0 && <option value="">Add a service and a chokepoint first</option>}
            {chokepoints.map((chokepoint) => <option key={chokepoint.id} value={chokepoint.id}>{chokepoint.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary px-4 py-1 text-sm" type="button" disabled={busy || !labEnabled || !chokepointId} onClick={() => void draft()}>
          Draft report
        </button>
      </div>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Chokepoint reports</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Service</th>
              <th className="eyebrow" scope="col">Provider</th>
              <th className="eyebrow" scope="col">Kind</th>
              <th className="eyebrow" scope="col">Status</th>
              <th className="eyebrow" scope="col">Sent</th>
              <th className="eyebrow" scope="col">Outcome</th>
              <th className="eyebrow" scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr><td className="muted" colSpan={7}>No reports yet.</td></tr>
            )}
            {reports.map((report) => (
              <Fragment key={report.id}>
                <tr>
                  <td className="font-medium">{report.serviceName}</td>
                  <td>{report.provider}</td>
                  <td>{report.chokepointKind}</td>
                  <td>{report.status === "DRAFT" ? "Draft" : report.channel === "EMAIL" ? "Sent by email" : "Sent by web form"}</td>
                  <td className="a-nowrap tabular-nums">{report.sentAt?.slice(0, 10) ?? "—"}</td>
                  <td>{report.outcome ? `${report.outcome}${report.outcomeAt ? ` (${report.outcomeAt.slice(0, 10)})` : ""}` : report.status === "SENT" ? "awaiting" : "—"}</td>
                  <td className="a-nowrap">
                    <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => toggle(report)}>
                      {open === report.id ? "Close" : "Review"}
                    </button>
                  </td>
                </tr>
                {open === report.id && (
                  <tr key={`${report.id}-open`} data-selected="true">
                    <td colSpan={7}>
                      <div className="grid gap-3 p-2">
                        <div className="grid gap-1">
                          <label className="text-sm font-medium" htmlFor={`lab-report-subject-${report.id}`}>Subject</label>
                          <input
                            id={`lab-report-subject-${report.id}`}
                            className="field"
                            value={draftEdit.subject}
                            readOnly={report.status !== "DRAFT"}
                            onChange={(e) => setDraftEdit({ ...draftEdit, subject: e.target.value })}
                            maxLength={500}
                          />
                        </div>
                        <div className="grid gap-1">
                          <label className="text-sm font-medium" htmlFor={`lab-report-body-${report.id}`}>Body</label>
                          <textarea
                            id={`lab-report-body-${report.id}`}
                            className="field"
                            rows={12}
                            value={draftEdit.body}
                            readOnly={report.status !== "DRAFT"}
                            onChange={(e) => setDraftEdit({ ...draftEdit, body: e.target.value })}
                          />
                        </div>
                        {report.status === "DRAFT" ? (
                          <div className="grid gap-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="grid gap-1">
                                <label className="text-sm font-medium" htmlFor={`lab-report-to-${report.id}`}>Send by email to</label>
                                <input
                                  id={`lab-report-to-${report.id}`}
                                  className="field"
                                  value={sendTo}
                                  onChange={(e) => setSendTo(e.target.value)}
                                  maxLength={320}
                                />
                              </div>
                              <button className="btn btn-primary px-3 py-1 text-sm" type="button" disabled={busy || !looksLikeEmail(sendTo.trim())} onClick={() => void sendReport(report.id, "EMAIL")}>
                                Send by email
                              </button>
                              <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void copyForWebForm()}>
                                {copied ? "Copied" : "Copy text"}
                              </button>
                              <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void sendReport(report.id, "WEB_FORM")}>
                                Submitted on web form
                              </button>
                            </div>
                            <div>
                              <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void saveDraft(report.id)}>
                                Save draft changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="grid gap-1">
                              <label className="text-sm font-medium" htmlFor={`lab-report-ref-${report.id}`}>Provider reference (optional)</label>
                              <input
                                id={`lab-report-ref-${report.id}`}
                                className="field"
                                value={providerReference}
                                onChange={(e) => setProviderReference(e.target.value)}
                                maxLength={200}
                              />
                            </div>
                            {report.outcome === null && OUTCOME_OPTIONS.map((outcome) => (
                              <button key={outcome} className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void recordOutcome(report.id, outcome)}>
                                {outcome === "ACTIONED" ? "Actioned" : outcome === "REFUSED" ? "Refused" : "No reply"}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted text-sm">
        Sent reports carry the text above, exactly as reviewed. Email sends are idempotent per report, so a retry never
        emails a provider twice. Outcome records feed the dashboard&apos;s per-provider-kind medians and the 30-day metric.
      </p>
    </div>
  );
}
