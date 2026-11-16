"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { AdminVoidReason } from "@/lib/signed-template";

const REASONS: Array<[AdminVoidReason, string]> = [
  ["template_withdrawn", "The signed template will not be restored"],
  ["survivor_asked", "The survivor asked to sign again"],
  ["other", "Other"],
];

const ERRORS: Record<string, string> = {
  signature_not_refused: "This signature can be sent as it is, so it was not voided.",
  notice_already_sent: "A notice was already sent under this signature, so it is kept as the record.",
  signature_not_voided: "Nothing was voided: it was sent or signed again meanwhile. Reload the page.",
  permission_denied: "Your admin role cannot void signatures.",
  database_required: "Voiding needs a database.",
};

type Props = { caseId: string; urlId?: string; label: string };

// Voids one signature that dispatch refuses because of its template, so the
// survivor is asked to sign the current text. Asks for a reason; the server
// records it and refuses if anything was sent under the signature.
export function VoidSignatureButton({ caseId, urlId, label }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AdminVoidReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = `void-reason-${urlId ?? "advisory"}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch("/api/admin/signatures/void", {
        method: "POST",
        body: JSON.stringify(urlId ? { target: "url", caseId, urlId, reason } : { target: "hash_advisory", caseId, reason }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[body?.error ?? ""] ?? `Not voided (${body?.error ?? `status ${response.status}`}).`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Not voided: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="grid gap-1">
        <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setOpen(true)} type="button">
          {label}
        </button>
        {error && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="grid gap-2 text-xs" onSubmit={submit}>
      <p className="max-w-sm leading-[1.6]">
        The signature is removed and a new one is needed before anything can be sent. The survivor&apos;s case page
        will say the notice changed and nothing was sent. No email is sent.
      </p>
      <label className="grid gap-1" htmlFor={fieldId}>
        <span>Why? This is recorded.</span>
        <select
          className="field"
          id={fieldId}
          onChange={(event) => setReason(event.target.value as AdminVoidReason)}
          required
          value={reason}
        >
          <option value="">Choose a reason</option>
          {REASONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy || !reason} type="submit">
          {busy ? "Voiding…" : "Void signature"}
        </button>
        <button className="link-underline" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
