"use client";

import { useEffect, useMemo, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { renderMarkdown } from "@/lib/markdown";
import { apiError } from "../api-error";
import { Field } from "../Field";
import type { OrgEvent, OrgEventMode, OrgEventStatus } from "@/lib/org-events";

// /admin/org/events (docs/org/spec.md, 56.6): list, create, edit, publish
// and cancel training sessions through /api/admin/org/events. The list is
// fetched from the API and re-fetched after every change; edits load into
// the same form as new events, with a live markdown preview.

const MODE_LABELS: Record<OrgEventMode, string> = {
  ONLINE: "Online",
  IN_PERSON: "In person",
  HYBRID: "Hybrid",
};

const STATUS_LABELS: Record<OrgEventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

const ERRORS: Record<string, string> = {
  event_not_found: "This event no longer exists; load the list again.",
};

type EventForm = {
  titleEn: string;
  titleHi: string;
  startsAt: string; // datetime-local value
  endsAt: string; // datetime-local value, optional
  mode: OrgEventMode;
  city: string;
  registrationUrl: string;
  descriptionMd: string;
};

const EMPTY_FORM: EventForm = {
  titleEn: "",
  titleHi: "",
  startsAt: "",
  endsAt: "",
  mode: "ONLINE",
  city: "",
  registrationUrl: "",
  descriptionMd: "",
};

function eventPayload(form: EventForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    titleEn: form.titleEn.trim(),
    startsAt: new Date(form.startsAt).toISOString(),
    mode: form.mode,
    descriptionMd: form.descriptionMd.trim(),
  };
  if (form.titleHi.trim()) payload.titleHi = form.titleHi.trim();
  if (form.endsAt) payload.endsAt = new Date(form.endsAt).toISOString();
  if (form.city.trim()) payload.city = form.city.trim();
  if (form.registrationUrl.trim()) payload.registrationUrl = form.registrationUrl.trim();
  return payload;
}

/** An ISO time back into the local format a datetime-local input wants. */
function toLocalMinute(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );

export function EventsManager({ modes, statuses }: { modes: OrgEventMode[]; statuses: OrgEventStatus[] }) {
  const [events, setEvents] = useState<OrgEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrgEventStatus>("ALL");

  const [form, setForm] = useState<EventForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/org/events", { cache: "no-store" })
      .then(async (response) => {
        const data = response.ok ? ((await response.json()) as { events: OrgEvent[] }) : null;
        if (!active) return;
        if (!data) throw new Error(String(response.status));
        setEvents(data.events);
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("The event list could not be loaded; try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const visible = useMemo(
    () => (events ?? []).filter((event) => statusFilter === "ALL" || event.status === statusFilter),
    [events, statusFilter],
  );

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function startEdit(event: OrgEvent) {
    setForm({
      titleEn: event.titleEn,
      titleHi: event.titleHi ?? "",
      startsAt: toLocalMinute(event.startsAt),
      endsAt: event.endsAt ? toLocalMinute(event.endsAt) : "",
      mode: event.mode,
      city: event.city ?? "",
      registrationUrl: event.registrationUrl ?? "",
      descriptionMd: event.descriptionMd,
    });
    setEditingId(event.id);
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
    if (!form.startsAt) {
      setFormError("Pick a start date and time.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/admin/org/events/${editingId}` : "/api/admin/org/events", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(eventPayload(form)),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setFormError(apiError(data, ERRORS, "The event was not saved."));
        return;
      }
      setNotice(editingId ? "Event saved." : "Event saved as a draft.");
      closeForm();
      setReload((count) => count + 1);
    } catch {
      setFormError("The event was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(event: OrgEvent, status: "PUBLISHED" | "CANCELLED") {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(`/api/admin/org/events/${event.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, "The change did not go through."));
        return;
      }
      setNotice(
        status === "PUBLISHED" ? `“${event.titleEn}” published.` : `“${event.titleEn}” cancelled.`,
      );
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
          <label htmlFor="event-status-filter">Status</label>
          <select
            className="field"
            id="event-status-filter"
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrgEventStatus)}
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
          New event
        </button>
      </div>

      {events === null && !loadError ? (
        <p className="muted text-sm">Loading events…</p>
      ) : (
        <div className="a-card overflow-hidden">
          <table className="a-table w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Training and workshop events</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">
                  Title
                </th>
                <th className="eyebrow" scope="col">
                  Starts
                </th>
                <th className="eyebrow" scope="col">
                  Ends
                </th>
                <th className="eyebrow" scope="col">
                  Mode
                </th>
                <th className="eyebrow" scope="col">
                  City
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
              {visible.map((event) => (
                <tr key={event.id}>
                  <td>
                    <span className="font-semibold">{event.titleEn}</span>
                    {event.titleHi && <span className="muted block text-xs">{event.titleHi}</span>}
                  </td>
                  <td className="a-nowrap">{when(event.startsAt)}</td>
                  <td className="a-nowrap">{event.endsAt ? when(event.endsAt) : "—"}</td>
                  <td>{MODE_LABELS[event.mode]}</td>
                  <td>{event.city ?? "—"}</td>
                  <td>
                    {event.status === "PUBLISHED" ? (
                      <span className="a-count">Published</span>
                    ) : (
                      STATUS_LABELS[event.status]
                    )}
                  </td>
                  <td className="a-nowrap">
                    <span className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => startEdit(event)}
                        type="button"
                      >
                        Edit
                      </button>
                      {event.status !== "PUBLISHED" && (
                        <button
                          className="btn btn-primary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => setStatus(event, "PUBLISHED")}
                          type="button"
                        >
                          Publish
                        </button>
                      )}
                      {event.status === "PUBLISHED" && (
                        <button
                          className="btn btn-secondary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => setStatus(event, "CANCELLED")}
                          type="button"
                        >
                          Cancel
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
              {events !== null && events.length === 0 ? "No events yet." : "No events for this filter."}
            </p>
          )}
        </div>
      )}

      {form && (
        <form className="a-card grid gap-4 p-5" noValidate onSubmit={save}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2>{editingId ? "Edit event" : "New event"}</h2>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={closeForm} type="button">
              Close
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="event-title-en" label="Title (English)">
              <input
                className="field"
                id="event-title-en"
                maxLength={160}
                onChange={(event) => setForm({ ...form, titleEn: event.target.value })}
                value={form.titleEn}
              />
            </Field>
            <Field id="event-title-hi" label="Title (Hindi, optional)">
              <input
                className="field"
                id="event-title-hi"
                maxLength={160}
                onChange={(event) => setForm({ ...form, titleHi: event.target.value })}
                value={form.titleHi}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="event-starts" label="Starts at" hint="Shown in India time on the public pages.">
              <input
                className="field"
                id="event-starts"
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                type="datetime-local"
                value={form.startsAt}
              />
            </Field>
            <Field id="event-ends" label="Ends at (optional)" hint="Leave blank when the session has no fixed end.">
              <input
                className="field"
                id="event-ends"
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                type="datetime-local"
                value={form.endsAt}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="event-mode" label="Mode">
              <select
                className="field"
                id="event-mode"
                onChange={(event) => setForm({ ...form, mode: event.target.value as OrgEventMode })}
                value={form.mode}
              >
                {modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="event-city" label="City (optional)">
              <input
                className="field"
                id="event-city"
                maxLength={80}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                value={form.city}
              />
            </Field>
            <Field id="event-registration" label="Registration URL (optional)" hint="Where people sign up, for example a form.">
              <input
                className="field"
                id="event-registration"
                maxLength={500}
                onChange={(event) => setForm({ ...form, registrationUrl: event.target.value })}
                value={form.registrationUrl}
              />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              id="event-description"
              label="Description (markdown)"
              hint="Markdown: headings, lists, quotes, tables and links. Images must use this site&apos;s own paths (/…)."
            >
              <textarea
                className="field font-mono"
                id="event-description"
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
