"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind } from "@/lib/lab/lab-store";
import type { LabChokepointView } from "@/lib/lab/lab-chokepoints";

// The E2 chokepoint list (docs/lab/charter.md). "Lookup" runs the DNS+RDAP
// helper (POST /api/lab/lookup) on a chosen service address and shows the
// host, name servers and registrar it suggests; nothing is filled in
// without the analyst choosing it.

const KIND_OPTIONS = LAB_CHOKEPOINT_KINDS;

const ERRORS: Record<string, string> = {
  invalid_payload: "The server did not accept those values. Check them and try again.",
  service_not_found: "That service no longer exists. Reload the page.",
  chokepoint_not_found: "That chokepoint no longer exists. Reload the page.",
  invalid_url: "That is not a public http(s) address.",
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

type ServiceOption = { id: string; name: string; urls: string[] };

type LookupHints = { host: string; nameServers: string[]; registrar: string | null; rdapChecked: boolean };

export function ChokepointsManager({
  services,
  chokepoints,
  rdapConfigured = false,
  labEnabled = true,
}: {
  services: ServiceOption[];
  chokepoints: LabChokepointView[];
  rdapConfigured?: boolean;
  labEnabled?: boolean;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [kind, setKind] = useState<LabChokepointKind>("HOST");
  const [provider, setProvider] = useState("");
  const [abuseContact, setAbuseContact] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<LookupHints | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ kind: LabChokepointKind; provider: string; abuseContact: string; evidenceNotes: string }>({
    kind: "HOST", provider: "", abuseContact: "", evidenceNotes: "",
  });

  const selectedService = services.find((service) => service.id === serviceId);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await send("/api/lab/chokepoints", "POST", {
      serviceId,
      kind,
      provider: provider.trim(),
      abuseContact: abuseContact.trim(),
      evidenceNotes: evidenceNotes.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Chokepoint added. Draft a report for it from the Reports page.");
    setProvider("");
    setAbuseContact("");
    setEvidenceNotes("");
    setHints(null);
    router.refresh();
  }

  async function lookup() {
    if (!selectedService) return;
    setLookupBusy(true);
    setError(null);
    setHints(null);
    try {
      const response = await csrfFetch("/api/lab/lookup", {
        method: "POST",
        body: JSON.stringify({ url: selectedService.urls[0] }),
      });
      const data = (await response.json().catch(() => null)) as { hints?: LookupHints; error?: string } | null;
      if (!response.ok || !data?.hints) {
        setError(ERRORS[data?.error ?? ""] ?? "The lookup failed. Fill the provider in by hand.");
      } else {
        setHints(data.hints);
      }
    } catch {
      setError("The lookup failed: the request did not go through. Fill the provider in by hand.");
    } finally {
      setLookupBusy(false);
    }
  }

  function applyRegistrar(hint: LookupHints) {
    if (!hint.registrar) return;
    setKind("REGISTRAR");
    setProvider(hint.registrar);
  }

  function applyHost(hint: LookupHints) {
    setKind("HOST");
    setProvider(hint.host);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    const result = await send(`/api/lab/chokepoints/${id}`, "PATCH", {
      kind: edit.kind,
      provider: edit.provider.trim(),
      abuseContact: edit.abuseContact.trim(),
      evidenceNotes: edit.evidenceNotes.trim() || null,
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
        <p className="eyebrow">Add a chokepoint</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="lab-chokepoint-service">Service</label>
            <select id="lab-chokepoint-service" className="field" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setHints(null); }}>
              {services.length === 0 && <option value="">Add a service first</option>}
              {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="lab-chokepoint-kind">Kind</label>
            <select id="lab-chokepoint-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as LabChokepointKind)}>
              {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="lab-chokepoint-provider">Provider</label>
            <input id="lab-chokepoint-provider" className="field" value={provider} onChange={(e) => setProvider(e.target.value)} required maxLength={200} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="lab-chokepoint-contact">Abuse contact (from the provider&apos;s own abuse page)</label>
            <input id="lab-chokepoint-contact" className="field" value={abuseContact} onChange={(e) => setAbuseContact(e.target.value)} required maxLength={500} />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="lab-chokepoint-evidence">Evidence notes</label>
            <input id="lab-chokepoint-evidence" className="field" value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} maxLength={5000} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary px-4 py-1 text-sm" type="submit" disabled={busy || !labEnabled || !serviceId}>
            Add chokepoint
          </button>
          <button
            className="btn btn-secondary px-4 py-1 text-sm"
            type="button"
            disabled={lookupBusy || !selectedService || selectedService.urls.length === 0}
            onClick={() => void lookup()}
          >
            {lookupBusy ? "Looking up…" : `Look up ${selectedService?.urls[0] ?? "the service address"}`}
          </button>
          {!rdapConfigured && <span className="muted text-sm">RDAP is not configured (LAB_RDAP_BASE_URL), so the lookup suggests the host and name servers only.</span>}
        </div>
        {hints && (
          <div className="a-card p-3 text-sm">
            <p className="eyebrow">Lookup suggestions</p>
            <p className="mt-2">Host: <span className="font-mono">{hints.host}</span></p>
            {hints.nameServers.length > 0 && <p>Name servers: <span className="font-mono">{hints.nameServers.join(", ")}</span></p>}
            <p>Registrar: {hints.registrar ? <span className="font-medium">{hints.registrar}</span> : hints.rdapChecked ? "not found in RDAP" : "RDAP not configured"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => applyHost(hints)}>Use host as provider (HOST)</button>
              {hints.registrar && (
                <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => applyRegistrar(hints)}>Use registrar as provider (REGISTRAR)</button>
              )}
            </div>
          </div>
        )}
      </form>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Chokepoints</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Service</th>
              <th className="eyebrow" scope="col">Kind</th>
              <th className="eyebrow" scope="col">Provider</th>
              <th className="eyebrow" scope="col">Abuse contact</th>
              <th className="eyebrow" scope="col">Evidence</th>
              <th className="eyebrow" scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {chokepoints.length === 0 && (
              <tr><td className="muted" colSpan={6}>No chokepoints recorded yet.</td></tr>
            )}
            {chokepoints.map((chokepoint) => (
              editing === chokepoint.id ? (
                <tr key={chokepoint.id} data-selected="true">
                  <td colSpan={6}>
                    <div className="grid gap-3 p-2">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <select aria-label="Kind" className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as LabChokepointKind })}>
                          {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <input aria-label="Provider" className="field" value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value })} maxLength={200} />
                        <input aria-label="Abuse contact" className="field" value={edit.abuseContact} onChange={(e) => setEdit({ ...edit, abuseContact: e.target.value })} maxLength={500} />
                      </div>
                      <input aria-label="Evidence notes" className="field" value={edit.evidenceNotes} onChange={(e) => setEdit({ ...edit, evidenceNotes: e.target.value })} maxLength={5000} />
                      <div className="flex gap-2">
                        <button className="btn btn-primary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void saveEdit(chokepoint.id)}>Save</button>
                        <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={chokepoint.id}>
                  <td className="font-medium">{chokepoint.serviceName}</td>
                  <td>{chokepoint.kind}</td>
                  <td>{chokepoint.provider}</td>
                  <td>{chokepoint.abuseContact}</td>
                  <td className="max-w-56 truncate">{chokepoint.evidenceNotes ?? "—"}</td>
                  <td className="a-nowrap">
                    <button
                      className="btn btn-secondary px-3 py-1 text-sm"
                      type="button"
                      onClick={() => {
                        setEditing(chokepoint.id);
                        setEdit({
                          kind: chokepoint.kind,
                          provider: chokepoint.provider,
                          abuseContact: chokepoint.abuseContact,
                          evidenceNotes: chokepoint.evidenceNotes ?? "",
                        });
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
