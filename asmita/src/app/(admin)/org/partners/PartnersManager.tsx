"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { apiError } from "../api-error";
import { Field } from "../Field";
import type { OrgPartner, OrgPartnerType } from "@/lib/org-partners";

// /admin/org/partners (docs/org/spec.md, 57.3): create, edit, reorder and
// show/hide the partners that appear on /partners and the Supporters strip.
// A new partner starts hidden; "Show on the site" makes it public.

const TYPE_LABELS: Record<OrgPartnerType, string> = {
  NGO: "NGO or helpline",
  LEGAL: "Legal",
  LAW_ENFORCEMENT: "Police or cyber cell",
  ACADEMIC: "University or research",
  PLATFORM: "Platform",
};

const ERRORS: Record<string, string> = {
  partner_not_found: "This partner no longer exists; load the list again.",
};

type PartnerForm = {
  name: string;
  type: OrgPartnerType;
  logoPath: string;
  url: string;
  blurbEn: string;
  blurbHi: string;
};

const EMPTY_FORM: PartnerForm = {
  name: "",
  type: "NGO",
  logoPath: "",
  url: "",
  blurbEn: "",
  blurbHi: "",
};

function partnerPayload(form: PartnerForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    type: form.type,
    blurbEn: form.blurbEn.trim(),
  };
  if (form.logoPath.trim()) payload.logoPath = form.logoPath.trim();
  if (form.url.trim()) payload.url = form.url.trim();
  if (form.blurbHi.trim()) payload.blurbHi = form.blurbHi.trim();
  return payload;
}

export function PartnersManager({ types }: { types: OrgPartnerType[] }) {
  const [partners, setPartners] = useState<OrgPartner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [form, setForm] = useState<PartnerForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/org/partners", { cache: "no-store" })
      .then(async (response) => {
        const data = response.ok ? ((await response.json()) as { partners: OrgPartner[] }) : null;
        if (!active) return;
        if (!data) throw new Error(String(response.status));
        setPartners(data.partners);
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("The partner list could not be loaded; try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function startEdit(partner: OrgPartner) {
    setForm({
      name: partner.name,
      type: partner.type,
      logoPath: partner.logoPath ?? "",
      url: partner.url ?? "",
      blurbEn: partner.blurbEn,
      blurbHi: partner.blurbHi ?? "",
    });
    setEditingId(partner.id);
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
      const response = await csrfFetch(editingId ? `/api/admin/org/partners/${editingId}` : "/api/admin/org/partners", {
        method: "PUT",
        body: JSON.stringify(partnerPayload(form)),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setFormError(apiError(data, ERRORS, "The partner was not saved."));
        return;
      }
      setNotice(editingId ? "Partner saved." : "Partner saved (hidden until you show it).");
      closeForm();
      setReload((count) => count + 1);
    } catch {
      setFormError("The partner was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function post(path: string, body: unknown, failure: string) {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, failure));
        return false;
      }
      return true;
    } catch {
      setRowError(`${failure}: the request failed.`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisibility(partner: OrgPartner) {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(`/api/admin/org/partners/${partner.id}`, {
        method: "PUT",
        body: JSON.stringify({ isPublic: !partner.isPublic }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, "The change did not go through."));
        return;
      }
      setNotice(
        partner.isPublic ? `"${partner.name}" is hidden from the site.` : `"${partner.name}" now shows on /partners.`,
      );
      setReload((count) => count + 1);
    } catch {
      setRowError("The change did not go through: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Move a partner one slot up or down by posting the whole new order. */
  async function move(partner: OrgPartner, direction: -1 | 1) {
    if (!partners) return;
    const order = [...partners];
    const index = order.findIndex((entry) => entry.id === partner.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    const ok = await post("/api/admin/org/partners/reorder", { ids: order.map((entry) => entry.id) }, "The order was not saved");
    if (ok) {
      setNotice("Order saved.");
      setReload((count) => count + 1);
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted max-w-xl text-sm">
          Partners appear on /partners once they are marked public — in this order. Logos are files you add under
          public/partners/.
        </p>
        <button className="btn btn-primary" onClick={openNew} type="button">
          New partner
        </button>
      </div>

      {partners === null && !loadError ? (
        <p className="muted text-sm">Loading partners…</p>
      ) : (
        <div className="a-card overflow-hidden">
          <table className="a-table w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Organization partners</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">
                  Order
                </th>
                <th className="eyebrow" scope="col">
                  Partner
                </th>
                <th className="eyebrow" scope="col">
                  Type
                </th>
                <th className="eyebrow" scope="col">
                  On the site
                </th>
                <th className="eyebrow" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {partners?.map((partner, index) => (
                <tr key={partner.id}>
                  <td className="a-nowrap">
                    <span className="flex gap-1">
                      <button
                        aria-label={`Move ${partner.name} up`}
                        className="btn btn-secondary px-2 py-1 text-xs"
                        disabled={busy || index === 0}
                        onClick={() => move(partner, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${partner.name} down`}
                        className="btn btn-secondary px-2 py-1 text-xs"
                        disabled={busy || index === (partners.length ?? 0) - 1}
                        onClick={() => move(partner, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                  <td>
                    <span className="font-semibold">{partner.name}</span>
                    <span className="muted block max-w-md text-xs">{partner.blurbEn}</span>
                    {partner.logoPath && <span className="muted block font-mono text-xs">{partner.logoPath}</span>}
                  </td>
                  <td>{TYPE_LABELS[partner.type]}</td>
                  <td>{partner.isPublic ? <span className="a-count">Public</span> : "Hidden"}</td>
                  <td className="a-nowrap">
                    <span className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => startEdit(partner)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className={`btn px-3 py-1 text-xs ${partner.isPublic ? "btn-secondary" : "btn-primary"}`}
                        disabled={busy}
                        onClick={() => toggleVisibility(partner)}
                        type="button"
                      >
                        {partner.isPublic ? "Hide" : "Show on the site"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {partners?.length === 0 && <p className="muted p-6 text-center text-sm">No partners yet.</p>}
        </div>
      )}

      {form && (
        <form className="a-card grid gap-4 p-5" noValidate onSubmit={save}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2>{editingId ? "Edit partner" : "New partner"}</h2>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={closeForm} type="button">
              Close
            </button>
          </div>

          <Field id="partner-name" label="Name">
            <input
              className="field"
              id="partner-name"
              maxLength={120}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              value={form.name}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="partner-type" label="Type">
              <select
                className="field"
                id="partner-type"
                onChange={(event) => setForm({ ...form, type: event.target.value as OrgPartnerType })}
                value={form.type}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="partner-logo" label="Logo file (optional)" hint="A file you added under public/partners/, e.g. /partners/example-logo.svg">
              <input
                className="field"
                id="partner-logo"
                maxLength={200}
                onChange={(event) => setForm({ ...form, logoPath: event.target.value })}
                value={form.logoPath}
              />
            </Field>
          </div>

          <Field id="partner-url" label="Website (optional)">
            <input
              className="field"
              id="partner-url"
              maxLength={300}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
              value={form.url}
            />
          </Field>

          <Field id="partner-blurb-en" label="One-line description (English)">
            <textarea
              className="field"
              id="partner-blurb-en"
              maxLength={400}
              onChange={(event) => setForm({ ...form, blurbEn: event.target.value })}
              rows={2}
              value={form.blurbEn}
            />
          </Field>

          <Field id="partner-blurb-hi" label="One-line description (Hindi, optional)">
            <textarea
              className="field"
              id="partner-blurb-hi"
              maxLength={400}
              onChange={(event) => setForm({ ...form, blurbHi: event.target.value })}
              rows={2}
              value={form.blurbHi}
            />
          </Field>

          {formError && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save partner"}
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
