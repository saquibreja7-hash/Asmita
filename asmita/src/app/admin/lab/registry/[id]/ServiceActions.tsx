"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

// WP115 (research-tools-spec.md): the service page's three actions — scan
// now, promote a finding to a chokepoint, and confirm or dismiss a cluster
// link. Every mutation goes through the /api/lab routes (lab:manage, CSRF,
// Zod) and is audited server-side.

const ERRORS: Record<string, string> = {
  invalid_payload: "The server did not accept those values. Check them and try again.",
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Only a SUPER_ADMIN can manage the Lab.",
  rate_limited: "Too many changes this hour. Try again later.",
  lab_disabled: "The Lab is switched off (ENABLE_LAB), so nothing can be changed. Nothing was saved.",
  finding_not_found: "That finding no longer exists. Reload the page.",
  finding_inactive: "This finding is no longer active, so it cannot be promoted.",
  finding_already_promoted: "This finding was already promoted.",
  category_not_promotable: "This category of finding has no matching chokepoint kind.",
  provider_required: "Pick a provider from the directory first.",
  provider_not_found: "That provider no longer exists. Reload the page.",
  provider_kind_mismatch: "That provider is not the kind this finding maps to.",
  abuse_contact_required:
    "Enter the abuse contact from the provider's own abuse page — it is not filled in for you until the provider is verified.",
  link_not_found: "That link no longer exists. Reload the page.",
};

async function send(path: string, body: unknown): Promise<{ ok: boolean; message: string | null }> {
  try {
    const response = await csrfFetch(path, { method: "POST", body: JSON.stringify(body) });
    if (response.ok) return { ok: true, message: null };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: ERRORS[data?.error ?? ""] ?? `Not saved (${data?.error ?? `status ${response.status}`}).` };
  } catch {
    return { ok: false, message: "Not saved: the request failed." };
  }
}

export function ScanNowButton({ serviceId, disabled = false }: { serviceId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await csrfFetch(`/api/lab/services/${serviceId}/infra-scan`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as
        | { servicesScanned?: number; urlsScanned?: number; urlsFetched?: number; findingsUpserted?: number; linkCandidates?: number; error?: string }
        | null;
      if (!response.ok) {
        setError(ERRORS[data?.error ?? ""] ?? "The scan could not run. Try again.");
      } else {
        setMessage(
          `Scanned ${data?.urlsScanned ?? 0} address(es), fetched ${data?.urlsFetched ?? 0}, recorded ${data?.findingsUpserted ?? 0} finding(s), ${data?.linkCandidates ?? 0} new link candidate(s).`,
        );
        router.refresh();
      }
    } catch {
      setError("The scan could not run: the request did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1">
      <button className="btn btn-primary px-4 py-1 text-sm" type="button" disabled={busy || disabled} onClick={() => void scan()}>
        {busy ? "Scanning…" : "Scan now"}
      </button>
      {message && <p className="text-sm text-[var(--brand)]" role="status">{message}</p>}
      {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </div>
  );
}

export type PromoteProviderOption = {
  id: string;
  name: string;
  verified: boolean;
  abuseEmail: string | null;
};

export function PromoteFinding({
  findingId,
  providers,
  defaultProviderId,
  defaultContact,
}: {
  findingId: string;
  providers: PromoteProviderOption[];
  defaultProviderId: string | null;
  defaultContact: string;
}) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(defaultProviderId ?? providers[0]?.id ?? "");
  const [contact, setContact] = useState(defaultContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const chosen = providers.find((provider) => provider.id === providerId);
  const directoryContact = chosen?.verified && chosen.abuseEmail ? chosen.abuseEmail : "";
  const effectiveContact = contact || directoryContact;

  async function promote() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await send(`/api/lab/infra-findings/${findingId}/promote`, {
      ...(providerId ? { providerId } : {}),
      ...(effectiveContact.trim() ? { abuseContact: effectiveContact.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice("Chokepoint created from this finding.");
    router.refresh();
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm underline">Promote to chokepoint</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`promote-provider-${findingId}`}>Provider (directory)</label>
          <select
            id={`promote-provider-${findingId}`}
            className="field"
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value);
              setContact("");
            }}
          >
            {providers.length === 0 && <option value="">No matching provider in the directory</option>}
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}{provider.verified ? " (verified)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`promote-contact-${findingId}`}>Abuse contact</label>
          <input
            id={`promote-contact-${findingId}`}
            className="field"
            value={contact}
            placeholder={directoryContact || "from the provider's own abuse page"}
            onChange={(event) => setContact(event.target.value)}
            maxLength={500}
          />
          {directoryContact && !contact && (
            <span className="muted text-xs">Filled from the verified directory row; you can replace it.</span>
          )}
        </div>
        <div className="flex items-end">
          <button
            className="btn btn-primary px-3 py-1 text-sm"
            type="button"
            disabled={busy || !providerId || !effectiveContact.trim()}
            onClick={() => void promote()}
          >
            Promote
          </button>
        </div>
      </div>
      {notice && <p className="mt-2 text-sm text-[var(--brand)]" role="status">{notice}</p>}
      {error && <p className="mt-2 text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </details>
  );
}

export function LinkReview({ linkId, status }: { linkId: string; status: "CANDIDATE" | "CONFIRMED" | "DISMISSED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(next: "CONFIRMED" | "DISMISSED") {
    setBusy(true);
    setError(null);
    const result = await send(`/api/lab/service-links/${linkId}/review`, { status: next });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      {status === "CANDIDATE" && (
        <>
          <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void review("CONFIRMED")}>
            Confirm
          </button>
          <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void review("DISMISSED")}>
            Dismiss
          </button>
        </>
      )}
      {status === "CONFIRMED" && (
        <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void review("DISMISSED")}>
          Undo confirm
        </button>
      )}
      {status === "DISMISSED" && (
        <button className="btn btn-secondary px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void review("CONFIRMED")}>
          Undo dismiss
        </button>
      )}
      {error && <span className="text-sm text-[var(--danger)]" role="alert">{error}</span>}
    </span>
  );
}
