"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { normaliseDomain } from "@/lib/platform-partners-shared";
import type { PlatformPartnerKeyView, PlatformPartnerView } from "@/lib/partner-admin";

const EXTRA_DOMAINS_MAX = 20;

// One human sentence per error code the partner routes can return.
const PARTNER_ERRORS: Record<string, string> = {
  partner_not_found: "This partner no longer exists.",
  invalid_domain: "Not a plain domain — enter a host like platform.example",
  domain_in_use: "Another partner already owns that domain",
  no_change: "The partner is already in that state.",
  key_not_found: "That key does not belong to this partner.",
  key_revoked: "That key is already revoked.",
  invalid_date: "The date is not valid",
  future_date: "The date is in the future",
  invalid_payload: "Not saved — check the fields and try again.",
  rate_limited: "Too many actions in a short time. Wait a moment, then try again.",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

type SendResult = { ok: true; data: Record<string, unknown> | null } | { ok: false; message: string };

async function send(method: "POST" | "PATCH", url: string, body: unknown): Promise<SendResult> {
  try {
    const response = await csrfFetch(url, { method, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok) return { ok: true, data };
    const error = typeof data?.error === "string" ? data.error : null;
    return { ok: false, message: PARTNER_ERRORS[error ?? ""] ?? `Not saved (${error ?? `status ${response.status}`}).` };
  } catch {
    return { ok: false, message: "Not saved: the request failed." };
  }
}

// Everything an admin can do with one platform partner: edit its details,
// suspend or reactivate it, issue and revoke partner API keys (a key is shown
// exactly once and never leaves this component's state), and record the
// platform's written permission to crawl. The key is never logged.
export function PartnerManager({ partner, keys }: { partner: PlatformPartnerView; keys: PlatformPartnerKeyView[] }) {
  const router = useRouter();
  const statusDialogRef = useRef<HTMLDialogElement>(null);
  const revokeDialogRef = useRef<HTMLDialogElement>(null);
  const keyTextRef = useRef<HTMLElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Details (PATCH): domains and the channel email.
  const [domain, setDomain] = useState(partner.primaryDomain);
  const [extras, setExtras] = useState(partner.extraDomains.join("\n"));
  const [email, setEmail] = useState("");
  const [clearEmail, setClearEmail] = useState(false);
  const [detailsTouched, setDetailsTouched] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [statusDialogError, setStatusDialogError] = useState<string | null>(null);

  // Keys: issue (shown once), copy, revoke.
  const [keyLabel, setKeyLabel] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["feed", "outcomes"]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [onceKey, setOnceKey] = useState<{ id: string; key: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<PlatformPartnerKeyView | null>(null);
  const [revokeDialogError, setRevokeDialogError] = useState<string | null>(null);

  // Written permission to crawl.
  const [permissionDate, setPermissionDate] = useState("");
  const [permissionNote, setPermissionNote] = useState("");
  const [permissionTouched, setPermissionTouched] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const domainCheck = normaliseDomain(domain);
  const extraLines = extras.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const extrasOk = extraLines.length <= EXTRA_DOMAINS_MAX && extraLines.every((line) => normaliseDomain(line) !== null);
  const emailOk = clearEmail || email.trim() === "" || email.trim().includes("@");
  const detailsValid = domainCheck !== null && extrasOk && emailOk;
  const noteTrimmed = permissionNote.trim();
  const permissionValid = permissionDate !== "" && noteTrimmed.length >= 3 && noteTrimmed.length <= 500;

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    setDetailsTouched(true);
    setDetailsError(null);
    setNotice(null);
    if (!detailsValid) return;
    const body: Record<string, unknown> = { primaryDomain: domainCheck, extraDomains: extraLines };
    if (clearEmail) body.channelEmail = "";
    else if (email.trim() !== "") body.channelEmail = email.trim();
    setBusy(true);
    const result = await send("PATCH", `/api/admin/partners/${partner.id}`, body);
    setBusy(false);
    if (!result.ok) return setDetailsError(result.message);
    setNotice("Details saved.");
    setEmail("");
    setClearEmail(false);
    setDetailsTouched(false);
    router.refresh();
  }

  function openStatusDialog() {
    setStatusDialogError(null);
    setNotice(null);
    statusDialogRef.current?.showModal();
  }

  async function confirmStatus() {
    const next = partner.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setBusy(true);
    const result = await send("POST", `/api/admin/partners/${partner.id}/status`, { status: next });
    setBusy(false);
    if (!result.ok) return setStatusDialogError(result.message);
    statusDialogRef.current?.close();
    setNotice(next === "SUSPENDED" ? "Partner suspended." : "Partner reactivated.");
    router.refresh();
  }

  async function issueKey(event: React.FormEvent) {
    event.preventDefault();
    setKeyError(null);
    setNotice(null);
    const label = keyLabel.trim();
    if (label === "") return setKeyError("Give the key a name first.");
    if (keyScopes.length === 0) return setKeyError("Pick at least one thing this key may do.");
    setBusy(true);
    const result = await send("POST", `/api/admin/partners/${partner.id}/keys`, { label, scopes: keyScopes });
    setBusy(false);
    if (!result.ok) return setKeyError(result.message);
    const data = result.data as { keyId?: unknown; key?: unknown } | null;
    if (typeof data?.key !== "string" || typeof data.keyId !== "string") {
      return setKeyError("The key was issued but could not be shown here, and it cannot be shown again. Revoke it and issue another.");
    }
    setOnceKey({ id: data.keyId, key: data.key });
    setKeyCopied(false);
    setKeyLabel("");
    router.refresh();
  }

  async function copyKey() {
    if (!onceKey) return;
    try {
      await navigator.clipboard.writeText(onceKey.key);
      setKeyCopied(true);
      return;
    } catch {
      // No clipboard access: select the key so it can be copied by hand.
    }
    const node = keyTextRef.current;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  function dismissKey() {
    setOnceKey(null);
    setKeyCopied(false);
  }

  function openRevokeDialog(entry: PlatformPartnerKeyView) {
    setPendingRevoke(entry);
    setRevokeDialogError(null);
    setNotice(null);
    revokeDialogRef.current?.showModal();
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setBusy(true);
    const result = await send("POST", `/api/admin/partners/${partner.id}/keys/${pendingRevoke.id}/revoke`, {});
    setBusy(false);
    if (!result.ok) return setRevokeDialogError(result.message);
    revokeDialogRef.current?.close();
    setNotice("Key revoked.");
    setPendingRevoke(null);
    router.refresh();
  }

  async function recordPermission(event: React.FormEvent) {
    event.preventDefault();
    setPermissionTouched(true);
    setPermissionError(null);
    setNotice(null);
    if (!permissionValid) return;
    setBusy(true);
    const result = await send("POST", `/api/admin/partners/${partner.id}/crawl-permission`, {
      date: permissionDate,
      note: noteTrimmed,
    });
    setBusy(false);
    if (!result.ok) return setPermissionError(result.message);
    const data = result.data as { crawlSources?: { created?: unknown[] } } | null;
    const created = Array.isArray(data?.crawlSources?.created) ? data.crawlSources.created.length : 0;
    setNotice(
      created > 0
        ? `Written permission recorded. ${created} monitoring ${created === 1 ? "source" : "sources"} created — enable ${created === 1 ? "it" : "them"} on the Crawl sources page.`
        : "Written permission recorded.",
    );
    setPermissionDate("");
    setPermissionNote("");
    setPermissionTouched(false);
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
      </div>

      <section>
        <h2>Details</h2>
        <form className="a-card mt-4 grid max-w-xl gap-4 p-4" noValidate onSubmit={saveDetails}>
          <Field
            error={detailsTouched && !domainCheck ? PARTNER_ERRORS.invalid_domain : null}
            hint="The partner's main host, for example platform.example. A leading www. is dropped."
            id="partner-primary-domain"
            label="Primary domain"
          >
            <input
              aria-describedby="partner-primary-domain-hint"
              autoComplete="off"
              className="field font-mono"
              id="partner-primary-domain"
              maxLength={253}
              onChange={(event) => setDomain(event.target.value)}
              value={domain}
            />
          </Field>
          <Field
            error={
              detailsTouched && !extrasOk
                ? extraLines.length > EXTRA_DOMAINS_MAX
                  ? `At most ${EXTRA_DOMAINS_MAX} extra domains.`
                  : PARTNER_ERRORS.invalid_domain
                : null
            }
            hint={`One domain per line, up to ${EXTRA_DOMAINS_MAX}. They become the only domains treated as this partner's own.`}
            id="partner-extra-domains"
            label="Extra domains"
          >
            <textarea
              aria-describedby="partner-extra-domains-hint"
              aria-label="Extra domains"
              className="field font-mono"
              id="partner-extra-domains"
              onChange={(event) => setExtras(event.target.value)}
              rows={4}
              value={extras}
            />
          </Field>
          <Field
            error={detailsTouched && !emailOk ? "Enter a valid email address, or leave it blank to keep the current one." : null}
            hint="The inbox the notices go to. Leave blank to keep the current address; tick Clear channel email to remove it."
            id="partner-channel-email"
            label="Channel email"
          >
            <input
              aria-describedby="partner-channel-email-hint"
              autoComplete="off"
              className="field font-mono"
              disabled={clearEmail}
              id="partner-channel-email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </Field>
          <div className="grid gap-1 text-sm">
            <label className="flex items-start gap-2">
              <input
                checked={clearEmail}
                className="mt-1"
                onChange={(event) => setClearEmail(event.target.checked)}
                type="checkbox"
              />
              <span>
                Clear channel email
                <span className="muted block text-xs">
                  Removes the address; notices then reach the platform only through its verified grievance contact.
                </span>
              </span>
            </label>
          </div>
          {detailsError && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {detailsError}
            </p>
          )}
          <div>
            <button className="btn btn-primary" disabled={busy || (detailsTouched && !detailsValid)} type="submit">
              {busy ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>Status</h2>
        <div className="a-card mt-4 grid max-w-xl gap-3 p-4 text-sm">
          <p>
            {partner.status === "ACTIVE" ? (
              "Active"
            ) : (
              <span className="text-[var(--danger)]">Suspended</span>
            )}
          </p>
          <div>
            {partner.status === "ACTIVE" ? (
              <button className="btn btn-secondary" disabled={busy} onClick={openStatusDialog} type="button">
                Suspend
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={openStatusDialog} type="button">
                Reactivate
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>Keys</h2>
        <p className="muted mt-2 max-w-2xl text-sm">
          A partner API key lets the platform authenticate to the future partner API. It is shown once when issued;
          only a secure hash of it is stored, and it stops working as soon as it is revoked.
        </p>
        {keys.length === 0 ? (
          <p className="muted mt-4 text-sm">No keys yet.</p>
        ) : (
          <div className="a-card mt-4 overflow-hidden">
            <table className="a-table w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Partner API keys</caption>
              <thead>
                <tr>
                  <th className="eyebrow" scope="col">Label</th>
                  <th className="eyebrow" scope="col">Created</th>
                  <th className="eyebrow" scope="col">Last used</th>
                  <th className="eyebrow" scope="col">State</th>
                  <th className="eyebrow" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.label}
                      <span className="muted block text-xs">
                        {entry.scopes.includes("feed") ? "Fingerprint feeds" : null}
                        {entry.scopes.includes("feed") && entry.scopes.includes("outcomes") ? " · " : null}
                        {entry.scopes.includes("outcomes") ? "Outcome reporting" : null}
                      </span>
                    </td>
                    <td className="a-nowrap tabular-nums">{when(entry.createdAt)}</td>
                    <td className="a-nowrap tabular-nums">{entry.lastUsedAt ? when(entry.lastUsedAt) : "Never"}</td>
                    <td className="a-nowrap">
                      {entry.revokedAt ? (
                        <span className="text-[var(--danger)]">Revoked {when(entry.revokedAt)}</span>
                      ) : (
                        "Active"
                      )}
                    </td>
                    <td className="a-nowrap">
                      {entry.revokedAt ? (
                        "—"
                      ) : (
                        <button
                          aria-label={`Revoke the key ${entry.label}`}
                          className="btn btn-secondary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => openRevokeDialog(entry)}
                          type="button"
                        >
                          Revoke…
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {onceKey && (
          <div aria-labelledby="issued-key-title" className="a-card mt-4 grid max-w-xl gap-3 p-4">
            <h3 id="issued-key-title">Copy this key now — it is shown only once</h3>
            <p className="muted text-sm">
              Asmita stores only a secure hash of it, so it cannot be shown again. If it is lost, revoke this key and
              issue another.
            </p>
            <strong className="break-all font-mono text-sm" ref={keyTextRef}>
              {onceKey.key}
            </strong>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={copyKey} type="button">
                {keyCopied ? "Copied" : "Copy key"}
              </button>
              <button className="btn btn-secondary" onClick={dismissKey} type="button">
                Dismiss
              </button>
            </div>
          </div>
        )}
        <form className="a-card mt-4 grid max-w-xl gap-4 p-4" noValidate onSubmit={issueKey}>
          <Field
            error={keyError}
            hint="Your own name for it, up to 80 characters, shown in the list above."
            id="partner-key-label"
            label="Key label"
          >
            <input
              aria-describedby="partner-key-label-hint"
              className="field"
              id="partner-key-label"
              maxLength={80}
              onChange={(event) => setKeyLabel(event.target.value)}
              value={keyLabel}
            />
          </Field>
          <fieldset className="grid gap-1 text-sm">
            <legend>What this key may do</legend>
            <label className="flex items-start gap-2">
              <input
                checked={keyScopes.includes("feed")}
                className="mt-1"
                onChange={(event) =>
                  setKeyScopes((current) => (event.target.checked ? ["feed", ...current.filter((scope) => scope !== "feed")] : current.filter((scope) => scope !== "feed")))
                }
                type="checkbox"
              />
              <span>
                Read the fingerprint feeds
                <span className="muted block text-xs">
                  The fingerprint feed and the HMA signal feed. The platform needs this to receive and delete hashes.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                checked={keyScopes.includes("outcomes")}
                className="mt-1"
                onChange={(event) =>
                  setKeyScopes((current) => (event.target.checked ? [...current.filter((scope) => scope !== "outcomes"), "outcomes"] : current.filter((scope) => scope !== "outcomes")))
                }
                type="checkbox"
              />
              <span>
                Report outcomes
                <span className="muted block text-xs">
                  Tell Asmita what the platform did with a fingerprint or a link on its own domains.
                </span>
              </span>
            </label>
          </fieldset>
          <div>
            <button className="btn btn-primary" disabled={busy || keyLabel.trim() === "" || keyScopes.length === 0} type="submit">
              {busy ? "Issuing…" : "Issue key"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>Record written permission to crawl</h2>
        {partner.crawlPermissionRecordedAt && (
          <p className="mt-2 text-sm">
            Recorded {partner.crawlPermissionRecordedAt.slice(0, 10)} by {partner.crawlPermissionRecordedById}
            {partner.crawlPermissionNote ? ` — ${partner.crawlPermissionNote}` : ""}
          </p>
        )}
        <p className="muted mt-2 max-w-2xl text-sm">
          Crawler monitoring of this partner&apos;s public pages starts only after the platform&apos;s written
          permission is recorded. Recording again overwrites the previous entry.
        </p>
        <form className="a-card mt-4 grid max-w-xl gap-4 p-4" noValidate onSubmit={recordPermission}>
          <Field
            error={permissionTouched && permissionDate === "" ? "Enter the date on the written permission." : null}
            hint="The date on the written permission you received."
            id="partner-crawl-date"
            label="Date of permission"
          >
            <input
              aria-describedby="partner-crawl-date-hint"
              className="field"
              id="partner-crawl-date"
              onChange={(event) => setPermissionDate(event.target.value)}
              type="date"
              value={permissionDate}
            />
          </Field>
          <Field
            error={
              permissionTouched && (noteTrimmed.length < 3 || noteTrimmed.length > 500)
                ? "Say where the permission is filed: 3 to 500 characters."
                : null
            }
            hint="Where the permission is filed, e.g. the email thread or signed agreement — no links."
            id="partner-crawl-note"
            label="Where it is filed"
          >
            <textarea
              aria-describedby="partner-crawl-note-hint"
              aria-label="Where the permission is filed"
              className="field"
              id="partner-crawl-note"
              maxLength={500}
              minLength={3}
              onChange={(event) => setPermissionNote(event.target.value)}
              rows={4}
              value={permissionNote}
            />
          </Field>
          {permissionError && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {permissionError}
            </p>
          )}
          <div>
            <button className="btn btn-primary" disabled={busy || (permissionTouched && !permissionValid)} type="submit">
              {busy ? "Saving…" : "Record permission"}
            </button>
          </div>
        </form>
      </section>

      <dialog
        aria-labelledby="partner-status-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setStatusDialogError(null)}
        ref={statusDialogRef}
      >
        <h2 id="partner-status-title">
          {partner.status === "ACTIVE" ? "Suspend" : "Reactivate"} {partner.name}?
        </h2>
        <p className="mt-3 text-sm">
          {partner.status === "ACTIVE"
            ? "Their key stops working immediately and nothing is shared with them while suspended."
            : "The partner becomes active again and its keys authenticate to the partner API once more."}
        </p>
        {statusDialogError && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {statusDialogError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus className="btn btn-secondary" onClick={() => statusDialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={confirmStatus} type="button">
            {busy ? "Saving…" : partner.status === "ACTIVE" ? "Suspend" : "Reactivate"}
          </button>
        </div>
      </dialog>

      <dialog
        aria-labelledby="revoke-key-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setRevokeDialogError(null)}
        ref={revokeDialogRef}
      >
        <h2 id="revoke-key-title">Revoke {pendingRevoke?.label ?? "this key"}?</h2>
        <p className="mt-3 text-sm">
          The partner can no longer authenticate with this key. This cannot be undone; issue another key if the
          platform needs one.
        </p>
        {revokeDialogError && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {revokeDialogError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus className="btn btn-secondary" onClick={() => revokeDialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={confirmRevoke} type="button">
            {busy ? "Revoking…" : "Revoke key"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
      <p className="muted text-xs" id={`${id}-hint`}>
        {hint}
      </p>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
