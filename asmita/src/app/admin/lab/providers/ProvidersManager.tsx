"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind } from "@/lib/lab/lab-store";

// WP115 (research-tools-spec.md): the provider directory console — create
// and edit the companies a report can go to, mark a row verified (recording
// who and when), see how many services depend on each provider and how its
// reports turned out, and draft ONE bulk report for several services that
// depend on the same provider. Every change goes through /api/lab/providers
// (lab:manage, CSRF, Zod) and is audited server-side.

const KIND_OPTIONS = LAB_CHOKEPOINT_KINDS;

type Dependent = { id: string; name: string; kind: string; viaChokepoint: boolean; viaFinding: boolean };

export type ProviderRow = {
  id: string;
  name: string;
  kind: LabChokepointKind;
  website: string;
  abusePageUrl: string | null;
  abuseEmail: string | null;
  policyUrl: string | null;
  notes: string | null;
  verifiedAt: string | null;
  dependents: Dependent[];
  reports: { sent: number; awaiting: number; actioned: number; refused: number; noReply: number; medianDaysToOutcome: number | null };
};

const ERRORS: Record<string, string> = {
  invalid_payload: "The server did not accept those values. Check them and try again.",
  provider_exists: "A provider with that name and kind already exists.",
  provider_not_found: "That provider no longer exists. Reload the page.",
  service_not_found: "One of the selected services no longer exists. Reload the page.",
  service_not_dependent:
    "One of the selected services is not recorded as depending on this provider any more. Reload the page.",
  abuse_contact_required:
    "Enter the abuse contact from the provider's own abuse page — it is not filled in until the provider is verified.",
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

function urlsFrom(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function Labelled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

type EditState = {
  name: string;
  kind: LabChokepointKind;
  website: string;
  abusePageUrl: string;
  abuseEmail: string;
  policyUrl: string;
  notes: string;
};

function editStateOf(row: ProviderRow): EditState {
  return {
    name: row.name,
    kind: row.kind,
    website: row.website,
    abusePageUrl: row.abusePageUrl ?? "",
    abuseEmail: row.abuseEmail ?? "",
    policyUrl: row.policyUrl ?? "",
    notes: row.notes ?? "",
  };
}

function BulkReportPanel({ provider, labEnabled }: { provider: ProviderRow; labEnabled: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [contact, setContact] = useState(provider.verifiedAt && provider.abuseEmail ? provider.abuseEmail : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  async function draft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await send("/api/lab/reports/bulk", "POST", {
      providerId: provider.id,
      serviceIds: selected,
      ...(contact.trim() && contact.trim() !== provider.abuseEmail ? { abuseContact: contact.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("One report drafted, listing every selected service. Review and send it on the reports page.");
    setSelected([]);
    router.refresh();
  }

  const canSend = provider.verifiedAt !== null && provider.abuseEmail !== null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm underline">
        Draft one report to {provider.name} for several of these services
      </summary>
      <div className="mt-3 grid gap-3">
        {provider.dependents.length === 0 ? (
          <p className="muted text-sm">No service depends on this provider yet, so there is nothing to report.</p>
        ) : (
          <>
            <fieldset className="grid gap-1">
              <legend className="text-sm font-medium">Services to list</legend>
              {provider.dependents.map((dependent) => (
                <label key={dependent.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(dependent.id)}
                    onChange={() => toggle(dependent.id)}
                    disabled={busy}
                  />
                  <span>
                    {dependent.name}
                    <span className="muted">
                      {" "}
                      ({dependent.kind}
                      {dependent.viaChokepoint && dependent.viaFinding
                        ? ", chokepoint and scan"
                        : dependent.viaChokepoint
                          ? ", chokepoint"
                          : ", scan"}
                      )
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Labelled id={`bulk-contact-${provider.id}`} label="Abuse contact">
              <input
                id={`bulk-contact-${provider.id}`}
                className="field"
                value={contact}
                placeholder={canSend ? provider.abuseEmail ?? "" : "from the provider's own abuse page"}
                onChange={(event) => setContact(event.target.value)}
                maxLength={500}
              />
            </Labelled>
            {canSend && (
              <p className="muted text-xs">Filled from the verified directory row; you can replace it.</p>
            )}
            <div>
              <button
                className="btn btn-primary px-4 py-1 text-sm"
                type="button"
                disabled={busy || !labEnabled || selected.length < 2 || !(contact.trim() || canSend)}
                onClick={() => void draft()}
              >
                Draft report for {selected.length || "…"} services
              </button>
            </div>
          </>
        )}
        {notice && <p className="text-sm text-[var(--brand)]" role="status">{notice}</p>}
        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      </div>
    </details>
  );
}

export function ProvidersManager({ providers, labEnabled = true }: { providers: ProviderRow[]; labEnabled?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LabChokepointKind>("HOST");
  const [website, setWebsite] = useState("");
  const [abusePageUrl, setAbusePageUrl] = useState("");
  const [abuseEmail, setAbuseEmail] = useState("");
  const [policyUrl, setPolicyUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(editStateOf(providers[0] ?? ({ id: "", name: "", kind: "HOST", website: "", abusePageUrl: null, abuseEmail: null, policyUrl: null, notes: null, verifiedAt: null, dependents: [], reports: { sent: 0, awaiting: 0, actioned: 0, refused: 0, noReply: 0, medianDaysToOutcome: null } } as unknown as ProviderRow)));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await send("/api/lab/providers", "POST", {
      name: name.trim(),
      kind,
      website: website.trim(),
      abusePageUrl: urlsFrom(abusePageUrl),
      abuseEmail: urlsFrom(abuseEmail),
      policyUrl: urlsFrom(policyUrl),
      notes: urlsFrom(notes),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Provider added. It stays unverified until an analyst confirms it.");
    setName(""); setWebsite(""); setAbusePageUrl(""); setAbuseEmail(""); setPolicyUrl(""); setNotes("");
    router.refresh();
  }

  async function saveEdit(id: string) {
    setBusy(true);
    const result = await send(`/api/lab/providers/${id}`, "PATCH", {
      name: edit.name.trim(),
      kind: edit.kind,
      website: edit.website.trim(),
      abusePageUrl: urlsFrom(edit.abusePageUrl),
      abuseEmail: urlsFrom(edit.abuseEmail),
      policyUrl: urlsFrom(edit.policyUrl),
      notes: urlsFrom(edit.notes),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setEditing(null);
    setNotice("Saved.");
    router.refresh();
  }

  async function setVerified(row: ProviderRow, verified: boolean) {
    setBusy(true);
    const result = await send(`/api/lab/providers/${row.id}`, "PATCH", { verified });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice(verified ? "Marked verified: recorded against your account, with today's date." : "Verification cleared.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && <p className="text-sm text-[var(--brand)]" role="status">{notice}</p>}
        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      </div>

      <form className="a-card grid gap-4 p-4" onSubmit={add}>
        <p className="eyebrow">Add a provider</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled id="lab-provider-name" label="Name">
            <input id="lab-provider-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </Labelled>
          <Labelled id="lab-provider-kind" label="Kind">
            <select id="lab-provider-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as LabChokepointKind)}>
              {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Labelled>
        </div>
        <Labelled id="lab-provider-website" label="Website">
          <input id="lab-provider-website" className="field" value={website} onChange={(e) => setWebsite(e.target.value)} required maxLength={500} />
        </Labelled>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled id="lab-provider-abuse-page" label="Abuse page (the provider's own)">
            <input id="lab-provider-abuse-page" className="field" value={abusePageUrl} onChange={(e) => setAbusePageUrl(e.target.value)} maxLength={500} />
          </Labelled>
          <Labelled id="lab-provider-abuse-email" label="Abuse email (an analyst verifies it)">
            <input id="lab-provider-abuse-email" className="field" value={abuseEmail} onChange={(e) => setAbuseEmail(e.target.value)} maxLength={320} />
          </Labelled>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled id="lab-provider-policy" label="Policy page">
            <input id="lab-provider-policy" className="field" value={policyUrl} onChange={(e) => setPolicyUrl(e.target.value)} maxLength={500} />
          </Labelled>
          <Labelled id="lab-provider-notes" label="Notes">
            <input id="lab-provider-notes" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
          </Labelled>
        </div>
        <div>
          <button className="btn btn-primary px-4 py-1 text-sm" type="submit" disabled={busy || !labEnabled}>
            Add provider
          </button>
        </div>
      </form>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[1100px] text-left text-sm">
          <caption className="sr-only">Provider directory</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Provider</th>
              <th className="eyebrow" scope="col">Verification</th>
              <th className="eyebrow" scope="col">Services depending on it</th>
              <th className="eyebrow" scope="col">Reports</th>
              <th className="eyebrow" scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 && (
              <tr><td className="muted" colSpan={5}>No provider in the directory yet.</td></tr>
            )}
            {providers.map((provider) => (
              <Fragment key={provider.id}>
                <tr>
                  <td>
                    <span className="font-medium">{provider.name}</span>
                    <span className="muted"> · {provider.kind}</span>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {provider.abusePageUrl && (
                        <a className="underline" href={provider.abusePageUrl} rel="noopener noreferrer" target="_blank">abuse page</a>
                      )}
                      {provider.policyUrl && (
                        <a className="underline" href={provider.policyUrl} rel="noopener noreferrer" target="_blank">policy</a>
                      )}
                      {provider.abuseEmail && <span className="font-mono">{provider.abuseEmail}</span>}
                    </div>
                  </td>
                  <td>
                    {provider.verifiedAt
                      ? <span className="font-medium">verified {provider.verifiedAt.slice(0, 10)}</span>
                      : <span className="text-[var(--coral-ink)]">unverified</span>}
                  </td>
                  <td className="tabular-nums">
                    {provider.dependents.length === 0
                      ? <span className="muted">—</span>
                      : (
                        <span>
                          <span className="font-medium">{provider.dependents.length}</span>
                          <span className="muted">
                            {" "}
                            {provider.dependents.slice(0, 3).map((dependent) => dependent.name).join(", ")}
                            {provider.dependents.length > 3 ? ", …" : ""}
                          </span>
                        </span>
                      )}
                  </td>
                  <td>
                    {provider.reports.sent === 0
                      ? <span className="muted">—</span>
                      : (
                        <span>
                          <span className="tabular-nums">{provider.reports.sent} sent</span>
                          <span className="muted">
                            {" · "}
                            {provider.reports.actioned} actioned, {provider.reports.refused} refused, {provider.reports.noReply} no reply,
                            {" "}
                            {provider.reports.awaiting} awaiting
                          </span>
                          {provider.reports.medianDaysToOutcome !== null && (
                            <div className="muted">median {provider.reports.medianDaysToOutcome.toFixed(1)} days to an outcome</div>
                          )}
                        </span>
                      )}
                  </td>
                  <td className="a-nowrap">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary px-3 py-1 text-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void setVerified(provider, provider.verifiedAt === null)}
                      >
                        {provider.verifiedAt ? "Unverify" : "Mark verified"}
                      </button>
                      <button
                        className="btn btn-secondary px-3 py-1 text-sm"
                        type="button"
                        onClick={() => {
                          setEditing(editing === provider.id ? null : provider.id);
                          setEdit(editStateOf(provider));
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        {editing === provider.id ? "Close" : "Edit"}
                      </button>
                    </div>
                  </td>
                </tr>
                {editing === provider.id && (
                  <tr data-selected="true">
                    <td colSpan={5}>
                      <div className="grid gap-3 p-2">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <input aria-label="Name" className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={200} />
                          <select aria-label="Kind" className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as LabChokepointKind })}>
                            {KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                          <input aria-label="Website" className="field" value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} maxLength={500} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input aria-label="Abuse page" className="field" value={edit.abusePageUrl} onChange={(e) => setEdit({ ...edit, abusePageUrl: e.target.value })} maxLength={500} />
                          <input aria-label="Abuse email" className="field" value={edit.abuseEmail} onChange={(e) => setEdit({ ...edit, abuseEmail: e.target.value })} maxLength={320} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input aria-label="Policy page" className="field" value={edit.policyUrl} onChange={(e) => setEdit({ ...edit, policyUrl: e.target.value })} maxLength={500} />
                          <input aria-label="Notes" className="field" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={5000} />
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-primary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void saveEdit(provider.id)}>Save</button>
                          <button className="btn btn-secondary px-3 py-1 text-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={5} className="bg-[var(--c-page)] p-3">
                    <BulkReportPanel provider={provider} labEnabled={labEnabled} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted text-sm">
        A provider row is only an address book until an analyst verifies it against the provider&apos;s own site; the
        abuse contact is copied from the directory only for verified rows. Bulk drafts are reviewed and sent on the
        reports page exactly like single-service reports — and a sent report never changes.
      </p>
    </div>
  );
}
