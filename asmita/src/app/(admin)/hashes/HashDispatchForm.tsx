"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type DispatchableCase = {
  caseId: string;
  referenceNumber: string;
  approvedCount: number;
  dispatchedCount: number;
};

type PlatformOption = { id: string; name: string };

type DispatchResult =
  | { platformId: string; dispatched: true; messageId: string; hashCount: number }
  | { platformId: string; dispatched: false; reason: string };

export default function HashDispatchForm({
  cases,
  platforms,
}: {
  cases: DispatchableCase[];
  platforms: PlatformOption[];
}) {
  const [caseId, setCaseId] = useState(cases[0]?.caseId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DispatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const platformName = (id: string) => platforms.find((p) => p.id === id)?.name ?? id;

  function togglePlatform(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function dispatch() {
    if (!caseId || selected.size === 0) return;
    const reference = cases.find((c) => c.caseId === caseId)?.referenceNumber ?? caseId;
    const confirmed = window.confirm(
      `Send hash advisory emails for ${reference} to ${selected.size} platform(s)? This is an outbound legal notice.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await csrfFetch("/api/admin/hashes/dispatch", {
        method: "POST",
        body: JSON.stringify({ caseId, platformIds: Array.from(selected) }),
      });
      const body = (await response.json().catch(() => null)) as
        | { results?: DispatchResult[]; error?: string }
        | null;
      if (!response.ok || !body?.results) {
        throw new Error(body?.error ?? `status_${response.status}`);
      }
      setResults(body.results);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "dispatch_failed");
    } finally {
      setBusy(false);
    }
  }

  if (cases.length === 0) {
    return (
      <p className="muted text-sm">
        No cases with approved hashes yet. Approve submissions above to enable dispatch.
      </p>
    );
  }

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Case
          </span>
          <select
            className="field"
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
          >
            {cases.map((entry) => (
              <option key={entry.caseId} value={entry.caseId}>
                {entry.referenceNumber} — {entry.approvedCount} approved
                {entry.dispatchedCount > 0 ? `, ${entry.dispatchedCount} dispatched` : ""}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-1.5">
          <legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Target platforms (human-verified contacts only)
          </legend>
          {platforms.length === 0 ? (
            <p className="muted text-sm">
              No platforms have human-verified compliance contacts yet. Verify contacts
              under Platforms first.
            </p>
          ) : (
            <div className="mt-1 grid gap-2">
              {platforms.map((platform) => (
                <label key={platform.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(platform.id)}
                    onChange={() => togglePlatform(platform.id)}
                  />
                  {platform.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>

      <button
        type="button"
        className="btn btn-primary mt-6"
        disabled={busy || !caseId || selected.size === 0}
        onClick={dispatch}
      >
        {busy ? "Dispatching…" : `Dispatch advisory to ${selected.size} platform(s)`}
      </button>

      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          Dispatch failed: {error}
        </p>
      )}
      {results && (
        <ul className="mt-4 grid gap-1 text-sm" aria-live="polite">
          {results.map((result) => (
            <li key={result.platformId}>
              {result.dispatched
                ? `✓ ${platformName(result.platformId)}: sent (${result.hashCount} hash${result.hashCount === 1 ? "" : "es"})`
                : `✗ ${platformName(result.platformId)}: ${result.reason.replaceAll("_", " ")}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
