"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { OrgSubmissionKind, OrgSubmissionStatus } from "@/lib/org-submissions";

// The outreach inbox manager (docs/org/spec.md, 56.2): one tab per form, a
// status filter, and a detail panel with the answers, the internal notes, a
// note box and the status select. The page passes every submission with its
// detail rows already computed server-side; writes go through the API and a
// router refresh brings the page's rows back up to date.

export type SubmissionItem = {
  id: string;
  kind: OrgSubmissionKind;
  status: OrgSubmissionStatus;
  createdAt: string;
  closedAt: string | null;
  contact: string;
  email: string;
  internalNotes: string | null;
  detailRows: { label: string; value: string }[];
};

const STATUS_LABELS: Record<OrgSubmissionStatus, string> = {
  NEW: "New",
  IN_REVIEW: "In review",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CLOSED: "Closed",
};

const ERRORS: Record<string, string> = {
  submission_not_found: "This submission no longer exists; reload the page.",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );

export function SubmissionsManager({
  tabs,
  statuses,
  items,
}: {
  tabs: { kind: OrgSubmissionKind; title: string }[];
  statuses: OrgSubmissionStatus[];
  items: SubmissionItem[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<OrgSubmissionKind>(tabs[0]?.kind ?? "VOLUNTEER");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrgSubmissionStatus>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [statusChoice, setStatusChoice] = useState<OrgSubmissionStatus>("NEW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = items.filter(
    (item) => item.kind === kind && (statusFilter === "ALL" || item.status === statusFilter),
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const exportHref = `/api/admin/org/submissions/export?kind=${kind}${statusFilter === "ALL" ? "" : `&status=${statusFilter}`}`;

  function open(item: SubmissionItem) {
    setSelectedId(item.id);
    setStatusChoice(item.status);
    setNote("");
    setError(null);
    setNotice(null);
  }

  async function addNote() {
    if (!selected || note.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/org/submissions/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error === "invalid_payload"
            ? "The note is empty or longer than 2000 characters."
            : "The note was not saved.",
        );
        return;
      }
      setNotice("Note added.");
      setNote("");
      router.refresh();
    } catch {
      setError("The note was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyStatus() {
    if (!selected || statusChoice === selected.status) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/org/submissions/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusChoice }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error === "submission_not_found"
            ? ERRORS.submission_not_found
            : "The status was not saved.",
        );
        return;
      }
      setNotice(`Status saved: ${STATUS_LABELS[statusChoice]}.`);
      router.refresh();
    } catch {
      setError("The status was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div aria-label="Submission kinds" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              aria-pressed={kind === tab.kind}
              className={`btn px-4 py-1 text-sm ${kind === tab.kind ? "btn-primary" : "btn-secondary"}`}
              key={tab.kind}
              onClick={() => {
                setKind(tab.kind);
                setSelectedId(null);
              }}
              type="button"
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1 text-sm">
            <label htmlFor="submission-status-filter">Status</label>
            <select
              className="field"
              id="submission-status-filter"
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrgSubmissionStatus)}
              value={statusFilter}
            >
              <option value="ALL">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          {/* A download: a GET without a CSRF token, like the newsletter export. */}
          <a className="btn btn-secondary" href={exportHref}>
            Export CSV
          </a>
        </div>
      </div>

      <ul className="grid gap-3">
        {visible.map((item) => (
          <li className="a-card" key={item.id}>
            <button
              aria-expanded={selectedId === item.id}
              className="w-full p-5 text-left"
              onClick={() => (selectedId === item.id ? setSelectedId(null) : open(item))}
              type="button"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[17px] font-semibold">{item.contact || item.email}</span>
                <span className="text-sm">
                  {item.status === "NEW" ? <span className="a-count">New</span> : STATUS_LABELS[item.status]}
                  <span className="muted ml-3">{when(item.createdAt)}</span>
                </span>
              </span>
              <span className="muted mt-1 block break-all text-sm">{item.email}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="a-card muted p-6 text-center text-sm">No submissions for this filter.</li>}
      </ul>

      {selected && (
        <div className="a-card grid gap-6 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow">{tabs.find((tab) => tab.kind === selected.kind)?.title ?? selected.kind}</p>
              <h2 className="mt-1 text-[17px] font-semibold">{selected.contact || selected.email}</h2>
            </div>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setSelectedId(null)} type="button">
              Close
            </button>
          </div>

          <dl className="grid gap-3 text-sm">
            {selected.detailRows.map((row) => (
              <div key={row.label}>
                <dt className="eyebrow">{row.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words">{row.value}</dd>
              </div>
            ))}
            <div>
              <dt className="eyebrow">Received</dt>
              <dd className="mt-1">
                {when(selected.createdAt)}
                {selected.closedAt ? `; closed ${when(selected.closedAt)}` : ""}
              </dd>
            </div>
          </dl>

          <div>
            <p className="eyebrow">Internal notes</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{selected.internalNotes ?? "None yet."}</p>
          </div>

          <form
            className="grid max-w-xl gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void addNote();
            }}
          >
            <label htmlFor="submission-note">Add a note</label>
            <textarea
              className="field"
              id="submission-note"
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
            />
            <div>
              <button className="btn btn-secondary" disabled={busy || note.trim() === ""} type="submit">
                {busy ? "Saving…" : "Add note"}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1 text-sm">
              <label htmlFor="submission-status">Status</label>
              <select
                className="field"
                id="submission-status"
                onChange={(event) => setStatusChoice(event.target.value as OrgSubmissionStatus)}
                value={statusChoice}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || statusChoice === selected.status}
              onClick={() => void applyStatus()}
              type="button"
            >
              Apply status
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
