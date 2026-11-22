"use client";

import { useEffect, useMemo, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { renderMarkdown } from "@/lib/markdown";
import { apiError } from "../api-error";
import { Field } from "../Field";
import type { OrgJob, OrgJobStatus, OrgJobType } from "@/lib/org-jobs";

// /admin/org/jobs (docs/org/spec.md, 56.5): list, create, edit, open and
// close jobs through /api/admin/org/jobs. The list is fetched from the API
// and re-fetched after every change; edits load into the same form as new
// jobs, with a live markdown preview of the description.

const TYPE_LABELS: Record<OrgJobType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  FELLOWSHIP: "Fellowship",
};

const STATUS_LABELS: Record<OrgJobStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  CLOSED: "Closed",
};

const ERRORS: Record<string, string> = {
  slug_taken: "That slug is already used.",
  job_not_found: "This job no longer exists; load the list again.",
};

type JobForm = {
  title: string;
  team: string;
  location: string;
  type: OrgJobType;
  descriptionMd: string;
  applyEmail: string;
  applyInstructions: string;
  closesAt: string; // yyyy-mm-dd from the date input
};

const EMPTY_FORM: JobForm = {
  title: "",
  team: "",
  location: "Remote, India",
  type: "FULL_TIME",
  descriptionMd: "",
  applyEmail: "",
  applyInstructions: "",
  closesAt: "",
};

function jobPayload(form: JobForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    team: form.team.trim(),
    location: form.location.trim() || "Remote, India",
    type: form.type,
    descriptionMd: form.descriptionMd.trim(),
    applyEmail: form.applyEmail.trim(),
  };
  if (form.applyInstructions.trim()) payload.applyInstructions = form.applyInstructions.trim();
  if (form.closesAt) payload.closesAt = new Date(`${form.closesAt}T23:59`).toISOString();
  return payload;
}

const when = (iso: string) => iso.slice(0, 10);

export function JobsManager({ types, statuses }: { types: OrgJobType[]; statuses: OrgJobStatus[] }) {
  const [jobs, setJobs] = useState<OrgJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrgJobStatus>("ALL");

  const [form, setForm] = useState<JobForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/org/jobs", { cache: "no-store" })
      .then(async (response) => {
        const data = response.ok ? ((await response.json()) as { jobs: OrgJob[] }) : null;
        if (!active) return;
        if (!data) throw new Error(String(response.status));
        setJobs(data.jobs);
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("The job list could not be loaded; try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const visible = useMemo(
    () => (jobs ?? []).filter((job) => statusFilter === "ALL" || job.status === statusFilter),
    [jobs, statusFilter],
  );

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function startEdit(job: OrgJob) {
    setForm({
      title: job.title,
      team: job.team,
      location: job.location,
      type: job.type,
      descriptionMd: job.descriptionMd,
      applyEmail: job.applyEmail,
      applyInstructions: job.applyInstructions ?? "",
      closesAt: job.closesAt ? job.closesAt.slice(0, 10) : "",
    });
    setEditingId(job.id);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/admin/org/jobs/${editingId}` : "/api/admin/org/jobs", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(jobPayload(form)),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setFormError(apiError(data, ERRORS, "The job was not saved."));
        return;
      }
      setNotice(editingId ? "Job saved." : "Job saved as a draft.");
      closeForm();
      setReload((count) => count + 1);
    } catch {
      setFormError("The job was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(job: OrgJob, status: "OPEN" | "CLOSED") {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(`/api/admin/org/jobs/${job.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, "The change did not go through."));
        return;
      }
      setNotice(status === "OPEN" ? `“${job.title}” is open for applications.` : `“${job.title}” is closed.`);
      setReload((count) => count + 1);
    } catch {
      setRowError("The change did not go through: the request failed.");
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <label htmlFor="job-status-filter">Status</label>
          <select
            className="field"
            id="job-status-filter"
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrgJobStatus)}
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
        <button className="btn btn-primary" onClick={openNew} type="button">
          New job
        </button>
      </div>

      {jobs === null && !loadError ? (
        <p className="muted text-sm">Loading jobs…</p>
      ) : (
        <div className="a-card overflow-hidden">
          <table className="a-table w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Job openings</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">
                  Title
                </th>
                <th className="eyebrow" scope="col">
                  Team
                </th>
                <th className="eyebrow" scope="col">
                  Type
                </th>
                <th className="eyebrow" scope="col">
                  Location
                </th>
                <th className="eyebrow" scope="col">
                  Closes
                </th>
                <th className="eyebrow" scope="col">
                  Status
                </th>
                <th className="eyebrow" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="font-semibold">{job.title}</span>
                    <span className="muted block font-mono text-xs">{job.slug}</span>
                  </td>
                  <td>{job.team}</td>
                  <td>{TYPE_LABELS[job.type]}</td>
                  <td>{job.location}</td>
                  <td className="a-nowrap tabular-nums">{job.closesAt ? when(job.closesAt) : "—"}</td>
                  <td>{job.status === "OPEN" ? <span className="a-count">Open</span> : STATUS_LABELS[job.status]}</td>
                  <td className="a-nowrap">
                    <span className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => startEdit(job)}
                        type="button"
                      >
                        Edit
                      </button>
                      {job.status !== "OPEN" && (
                        <button
                          className="btn btn-primary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => setStatus(job, "OPEN")}
                          type="button"
                        >
                          Open
                        </button>
                      )}
                      {job.status === "OPEN" && (
                        <button
                          className="btn btn-secondary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => setStatus(job, "CLOSED")}
                          type="button"
                        >
                          Close
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="muted p-6 text-center text-sm">
              {jobs !== null && jobs.length === 0 ? "No jobs yet." : "No jobs for this filter."}
            </p>
          )}
        </div>
      )}

      {form && (
        <form className="a-card grid gap-4 p-5" noValidate onSubmit={save}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2>{editingId ? "Edit job" : "New job"}</h2>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={closeForm} type="button">
              Close
            </button>
          </div>

          <Field id="job-title" label="Title">
            <input
              className="field"
              id="job-title"
              maxLength={120}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              value={form.title}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="job-team" label="Team">
              <input
                className="field"
                id="job-team"
                maxLength={80}
                onChange={(event) => setForm({ ...form, team: event.target.value })}
                value={form.team}
              />
            </Field>
            <Field id="job-location" label="Location">
              <input
                className="field"
                id="job-location"
                maxLength={120}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                value={form.location}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="job-type" label="Type">
              <select
                className="field"
                id="job-type"
                onChange={(event) => setForm({ ...form, type: event.target.value as OrgJobType })}
                value={form.type}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="job-apply-email" label="Applications go to (email)">
              <input
                className="field"
                id="job-apply-email"
                maxLength={254}
                onChange={(event) => setForm({ ...form, applyEmail: event.target.value })}
                type="email"
                value={form.applyEmail}
              />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              id="job-description"
              label="Description (markdown)"
              hint="Markdown: headings, lists, quotes, tables and links. Images must use this site&apos;s own paths (/…)."
            >
              <textarea
                className="field font-mono"
                id="job-description"
                onChange={(event) => setForm({ ...form, descriptionMd: event.target.value })}
                rows={12}
                value={form.descriptionMd}
              />
            </Field>
            <div className="grid gap-1 text-sm">
              <p className="eyebrow">Live preview</p>
              <div
                className="reading-body a-card max-h-[32rem] overflow-auto p-4"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.descriptionMd) }}
              />
            </div>
          </div>

          <Field id="job-instructions" label="How to apply (optional)">
            <textarea
              className="field"
              id="job-instructions"
              maxLength={1000}
              onChange={(event) => setForm({ ...form, applyInstructions: event.target.value })}
              rows={3}
              value={form.applyInstructions}
            />
          </Field>

          <Field id="job-closes" label="Closing date (optional)" hint="The listing stops being shown after this day.">
            <input
              className="field"
              id="job-closes"
              onChange={(event) => setForm({ ...form, closesAt: event.target.value })}
              type="date"
              value={form.closesAt}
            />
          </Field>

          {formError && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Saving…" : editingId ? "Save changes" : "Create draft"}
            </button>
            <button className="btn btn-secondary" onClick={closeForm} type="button">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
