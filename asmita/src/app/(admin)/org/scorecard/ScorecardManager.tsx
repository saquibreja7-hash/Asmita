"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { apiError } from "../api-error";
import { Field } from "../Field";
import type { ScorecardSnapshot } from "@/lib/scorecard-snapshots";
import type { ScorecardPlatformRow } from "@/lib/scorecard";

// /admin/org/scorecard (docs/org/spec.md, WP58): list the snapshots, compute
// the latest completed quarter on demand, review a draft's table, save the
// methodology note, publish. Publishing is deliberate and one-way.

const ERRORS: Record<string, string> = {
  snapshot_not_found: "This snapshot no longer exists; load the list again.",
  snapshot_published: "This snapshot is already published — a published snapshot is the record.",
  period_published: "This period is already published; its snapshot cannot be recomputed.",
  period_in_future: "That quarter has not ended yet, so it cannot be scored.",
  period_invalid: "Periods look like 2026-Q3.",
  invalid_payload: "That request was not valid; check the fields and try again.",
  rate_limited: "Too many requests just now; wait a moment and try again.",
};

const percent = (value: number | null) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const hours = (value: number | null) => (value == null ? "—" : `${value} h`);
const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—";

const COLUMNS: Array<{ key: keyof ScorecardPlatformRow; label: string }> = [
  { key: "noticesSent", label: "Notices" },
  { key: "urlNoticesSent", label: "Link notices" },
  { key: "hashAdvisoriesSent", label: "Hash advisories" },
  { key: "shareActioned", label: "Actioned" },
  { key: "medianHoursToFirstResponse", label: "Median first response" },
  { key: "medianHoursToRemoval", label: "Median removal" },
  { key: "shareActionedWithinDeadline", label: "Within deadline" },
  { key: "followUpsNeeded", label: "Follow-ups" },
];

export function ScorecardManager() {
  const [snapshots, setSnapshots] = useState<ScorecardSnapshot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesEn, setNotesEn] = useState("");
  const [notesHi, setNotesHi] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/org/scorecard", { cache: "no-store" })
      .then(async (response) => {
        const data = response.ok ? ((await response.json()) as { snapshots: ScorecardSnapshot[] }) : null;
        if (!active) return;
        if (!data) throw new Error(String(response.status));
        setSnapshots(data.snapshots);
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("The snapshot list could not be loaded; try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const selected = snapshots?.find((entry) => entry.id === selectedId) ?? null;

  function open(snapshot: ScorecardSnapshot) {
    setSelectedId(snapshot.id);
    setNotesEn(snapshot.notesEn ?? "");
    setNotesHi(snapshot.notesHi ?? "");
    setNotice(null);
    setRowError(null);
  }

  async function request(path: string, method: "post" | "put", body: Record<string, unknown>, failure: string) {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(path, { method: method.toUpperCase(), body: JSON.stringify(body) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, failure));
        return null;
      }
      return (await response.json()) as Record<string, unknown>;
    } catch {
      setRowError(`${failure}: the request failed.`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function computeLatest() {
    const data = await request("/api/admin/org/scorecard", "post", {}, "The snapshot was not computed");
    if (!data) return;
    const snapshot = data.snapshot as ScorecardSnapshot;
    setNotice(`Draft snapshot for ${snapshot.period} ${data.created ? "computed" : "refreshed"}.`);
    setReload((count) => count + 1);
    open(snapshot);
  }

  async function saveNote() {
    if (!selected) return;
    const data = await request(
      `/api/admin/org/scorecard/${selected.id}`,
      "put",
      { notesEn: notesEn.trim() || undefined, notesHi: notesHi.trim() || undefined },
      "The note was not saved",
    );
    if (!data) return;
    setNotice("Methodology note saved.");
    setReload((count) => count + 1);
  }

  async function publish() {
    if (!selected) return;
    const data = await request(`/api/admin/org/scorecard/${selected.id}`, "put", { publish: true }, "The snapshot was not published");
    if (!data) return;
    setNotice(`Published. /research/platform-scorecard now shows ${selected.period}.`);
    setReload((count) => count + 1);
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {rowError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {rowError}
          </p>
        )}
        {loadError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {loadError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted max-w-xl text-sm">
          The maintenance cron drafts a snapshot for each quarter that ends. Compute here to draft (or refresh) the
          latest completed quarter before then.
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={computeLatest} type="button">
          Compute latest quarter
        </button>
      </div>

      {snapshots === null && !loadError ? (
        <p className="muted text-sm">Loading snapshots…</p>
      ) : (
        <div className="a-card overflow-hidden">
          <table className="a-table w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Scorecard snapshots</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">Period</th>
                <th className="eyebrow" scope="col">Status</th>
                <th className="eyebrow" scope="col">Computed</th>
                <th className="eyebrow" scope="col">Published</th>
                <th className="eyebrow" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots?.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="a-nowrap font-semibold">{snapshot.period}</td>
                  <td>{snapshot.status === "PUBLISHED" ? <span className="a-count">Published</span> : "Draft"}</td>
                  <td>{when(snapshot.computedAt)}</td>
                  <td>{when(snapshot.publishedAt)}</td>
                  <td className="a-nowrap">
                    <button
                      className={`btn px-3 py-1 text-xs ${selectedId === snapshot.id ? "btn-secondary" : "btn-primary"}`}
                      disabled={busy}
                      onClick={() => open(snapshot)}
                      type="button"
                    >
                      {selectedId === snapshot.id ? "Close" : "Review"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshots?.length === 0 && (
            <p className="muted p-6 text-center text-sm">
              No snapshots yet. The cron drafts one after each quarter ends, or compute the latest quarter now.
            </p>
          )}
        </div>
      )}

      {selected && (
        <div className="a-card grid gap-5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2>
              {selected.period} · {selected.status === "PUBLISHED" ? "published" : "draft"}
            </h2>
            <p className="muted text-xs">Computed {when(selected.computedAt)}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="a-table w-full min-w-[860px] text-left text-sm">
              <caption className="sr-only">Platform responses in {selected.period}</caption>
              <thead>
                <tr>
                  <th className="eyebrow" scope="col">Platform</th>
                  {COLUMNS.map((column) => (
                    <th className="eyebrow" key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.data.platforms.map((row) => (
                  <tr key={row.platformName}>
                    <th scope="row">{row.platformName}</th>
                    {row.insufficient ? (
                      <td colSpan={COLUMNS.length} className="muted">
                        Not enough notices to report
                      </td>
                    ) : (
                      COLUMNS.map((column) => {
                        const value = row[column.key];
                        const shown =
                          typeof value !== "number"
                            ? "—"
                            : column.key === "shareActioned" || column.key === "shareActionedWithinDeadline"
                              ? percent(value)
                              : column.key.startsWith("median")
                                ? hours(value)
                                : String(value);
                        return <td key={column.key}>{shown}</td>;
                      })
                    )}
                  </tr>
                ))}
                {selected.data.platforms.length === 0 && (
                  <tr>
                    <td className="muted p-4" colSpan={COLUMNS.length + 1}>
                      No notices were recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted text-xs">
            A platform with fewer than {selected.data.minNotices} notices in the period shows “Not enough notices to
            report”. The deadline column counts action within {selected.data.deadlineHours} hours of dispatch.
          </p>

          {selected.status === "DRAFT" ? (
            <form
              className="grid gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void saveNote();
              }}
            >
              <Field id="scorecard-note-en" label="Methodology note (English, shown on the public page)">
                <textarea
                  className="field"
                  id="scorecard-note-en"
                  maxLength={4000}
                  onChange={(event) => setNotesEn(event.target.value)}
                  rows={3}
                  value={notesEn}
                />
              </Field>
              <Field id="scorecard-note-hi" label="Methodology note (Hindi, optional)">
                <textarea
                  className="field"
                  id="scorecard-note-hi"
                  maxLength={4000}
                  onChange={(event) => setNotesHi(event.target.value)}
                  rows={3}
                  value={notesHi}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-secondary" disabled={busy} type="submit">
                  Save note
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Publish the ${selected.period} scorecard? Public numbers go out as they stand.`)) {
                      void publish();
                    }
                  }}
                  type="button"
                >
                  Publish
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-2">
              {selected.notesEn && <p className="text-sm">{selected.notesEn}</p>}
              {selected.notesHi && <p className="text-sm">{selected.notesHi}</p>}
              <p className="muted text-xs">
                Published {when(selected.publishedAt)}. The methodology note is frozen with the record.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
