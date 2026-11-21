"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { LAB_SERVICE_KINDS, type LabServiceKind, type LabServiceStatus } from "@/lib/lab/lab-store";
import type { LabServiceView } from "@/lib/lab/lab-services";

// The E2 services list (docs/lab/charter.md): add a tracked service, edit it,
// and see what the daily liveness check last saw. Every change goes through
// /api/lab/services (lab:manage, CSRF, Zod) and is audited server-side.

const KIND_OPTIONS = LAB_SERVICE_KINDS;
const STATUS_OPTIONS: LabServiceStatus[] = ["UNKNOWN", "ACTIVE", "DOWN"];

const ERRORS: Record<string, string> = {
  invalid_payload: "The server did not accept those values. Check them and try again.",
  service_not_found: "That service no longer exists. Reload the page.",
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

function Labelled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function urlsFromText(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function ServicesManager({ services, labEnabled = true }: { services: LabServiceView[]; labEnabled?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LabServiceKind>("WEBSITE");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; kind: LabServiceKind; urls: string; status: LabServiceStatus; notes: string }>({
    name: "", kind: "WEBSITE", urls: "", status: "UNKNOWN", notes: "",
  });

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await send("/api/lab/services", "POST", { name: name.trim(), kind, urls: urlsFromText(urls), notes: notes.trim() || null });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Service added. The daily liveness check will watch its addresses.");
    setName("");
    setUrls("");
    setNotes("");
    router.refresh();
  }

  function startEdit(service: LabServiceView) {
    setEditing(service.id);
    setEdit({
      name: service.name,
      kind: service.kind,
      urls: service.urls.join("\n"),
      status: service.status,
      notes: service.notes ?? "",
    });
    setError(null);
    setNotice(null);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    const result = await send(`/api/lab/services/${id}`, "PATCH", {
      name: edit.name.trim(),
      kind: edit.kind,
      urls: urlsFromText(edit.urls),
      status: edit.status,
      notes: edit.notes.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setEditing(null);
    setNotice("Saved.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && <p className="text-sm text-[var(--brand)]" role="status">{notice}</p>}
        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      </div>

      <form className="a-card grid gap-4 p-4" onSubmit={add}>
        <p className="eyebrow">Add a service</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled id="lab-service-name" label="Name">
            <input id="lab-service-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </Labelled>
          <Labelled id="lab-service-kind" label="Kind">
            <select id="lab-service-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as LabServiceKind)}>
              {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Labelled>
        </div>
        <Labelled id="lab-service-urls" label="Addresses (one per line)">
          <textarea id="lab-service-urls" className="field" rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} required />
        </Labelled>
        <Labelled id="lab-service-notes" label="Notes">
          <textarea id="lab-service-notes" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
        </Labelled>
        <div>
          <button className="btn btn-primary px-4 py-1 text-sm" type="submit" disabled={busy || !labEnabled}>
            Add service
          </button>
        </div>
      </form>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[840px] text-left text-sm">
          <caption className="sr-only">Tracked services</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Name</th>
              <th className="eyebrow" scope="col">Kind</th>
              <th className="eyebrow" scope="col">Status</th>
              <th className="eyebrow" scope="col">Addresses</th>
              <th className="eyebrow" scope="col">Last checked</th>
              <th className="eyebrow" scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr><td className="muted" colSpan={6}>Nothing tracked yet.</td></tr>
            )}
            {services.map((service) => (
              editing === service.id ? (
                <tr key={service.id} data-selected="true">
                  <td colSpan={6}>
                    <div className="grid gap-3 p-2">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input aria-label="Name" className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={200} />
                        <select aria-label="Kind" className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as LabServiceKind })}>
                          {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select aria-label="Status" className="field" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as LabServiceStatus })}>
                          {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <textarea aria-label="Addresses, one per line" className="field" rows={3} value={edit.urls} onChange={(e) => setEdit({ ...edit, urls: e.target.value })} />
                      <textarea aria-label="Notes" className="field" rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={5000} />
                      <div className="flex gap-2">
                        <button className="btn btn-primary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void saveEdit(service.id)}>Save</button>
                        <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={service.id}>
                  <td className="font-medium">{service.name}</td>
                  <td>{service.kind}</td>
                  <td>{service.status}{service.status === "DOWN" && service.downSince ? ` since ${service.downSince.slice(0, 10)}` : ""}</td>
                  <td>
                    <span className="font-mono">{service.urls.join(", ")}</span>
                    {service.urlStatuses && (
                      <span className="muted"> · {service.urlStatuses.map((status) => (status.up ? "up" : "down")).join(", ")} on {service.lastCheckedAt?.slice(0, 10) ?? "—"}</span>
                    )}
                  </td>
                  <td className="a-nowrap tabular-nums">{service.lastCheckedAt?.slice(0, 10) ?? "—"}</td>
                  <td className="a-nowrap">
                    <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => startEdit(service)}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted text-sm">
        The liveness check (GET /api/lab/cron/liveness, daily) marks every address up or down; a service is up if any
        address answered and down if none did. Notes stay out of the public page: /lab shows aggregates only.
      </p>
    </div>
  );
}
