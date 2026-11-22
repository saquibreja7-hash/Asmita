"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

/*
 * The reasons editor on Review settings (review-console-spec.md WP142):
 * add, rename, reorder and deactivate the pickable reasons of one queue,
 * decision by decision. Every change goes through the reasons API, which
 * checks the SUPER_ADMIN role again server-side; this component only
 * renders what came back. Reasons are never deleted — the deactivate
 * switch is the whole lifecycle.
 */

type ReasonRow = { id: string; code: string; label: string; active: boolean; sortOrder: number };

type DecisionGroup = { code: string; label: string; reasons: ReasonRow[] };

const ERRORS: Record<string, string> = {
  permission_denied: "Only a SUPER_ADMIN can change review settings.",
  queue_not_found: "That queue no longer exists.",
  protected_queue: "The protected queue has no reasons.",
  invalid_decision: "That decision is not offered for this queue.",
  invalid_label: "Give the reason a label of 1 to 100 characters.",
  reason_exists: "A reason with that code already exists for this decision.",
  reason_not_found: "That reason no longer exists. Reload the page.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
};

const FALLBACK = "Not saved. Reload and try again.";

async function call(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await csrfFetch(path, { method: "POST", body: JSON.stringify(body) });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

export function ReasonsEditor({ queueKey, decisions }: { queueKey: string; decisions: DecisionGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");

  async function run(body: Record<string, unknown>, path = "/api/admin/review/settings/reasons") {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await call(path, body);
    setBusy(false);
    if (!result.ok) {
      setError(ERRORS[result.error ?? ""] ?? FALLBACK);
      return;
    }
    setRenaming(null);
    setAdding(null);
    setNewCode("");
    setNewLabel("");
    router.refresh();
  }

  return (
    <div className="mt-4 grid gap-6">
      {decisions.map((decision) => (
        <div key={decision.code}>
          <p className="text-xs font-semibold">“{decision.label}” reasons</p>
          {decision.reasons.length === 0 ? (
            <p className="muted mt-2 text-sm">
              No reasons yet. Without one, a reviewer can still write a note as the reason.
            </p>
          ) : (
            <ul aria-label={`Reasons for ${decision.label}`} className="mt-2 grid gap-2">
              {decision.reasons.map((reason, index) => (
                <li className="grid gap-2 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-3 text-sm" key={reason.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 break-words">
                      {reason.label}{" "}
                      <span className="muted font-mono text-xs">({reason.code})</span>
                    </p>
                    <p className={`text-xs ${reason.active ? "muted" : "font-medium text-[var(--danger)]"}`}>
                      {reason.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <button
                      className="link-underline"
                      disabled={busy || index === 0}
                      onClick={() => void run({ move: "up" }, `/api/admin/review/settings/reasons/${reason.id}`)}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      className="link-underline"
                      disabled={busy || index === decision.reasons.length - 1}
                      onClick={() => void run({ move: "down" }, `/api/admin/review/settings/reasons/${reason.id}`)}
                      type="button"
                    >
                      Move down
                    </button>
                    {renaming === reason.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`rename-${reason.id}`}>
                          New label for {reason.label}
                        </label>
                        <input
                          className="field py-1 text-xs"
                          id={`rename-${reason.id}`}
                          maxLength={100}
                          onChange={(event) => setRenameValue(event.target.value)}
                          value={renameValue}
                        />
                        <button
                          className="btn btn-primary px-3 py-1 text-xs"
                          disabled={busy || !renameValue.trim()}
                          onClick={() => void run({ label: renameValue.trim() }, `/api/admin/review/settings/reasons/${reason.id}`)}
                          type="button"
                        >
                          Save
                        </button>
                        <button className="link-underline" onClick={() => setRenaming(null)} type="button">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        className="link-underline"
                        disabled={busy}
                        onClick={() => {
                          setRenaming(reason.id);
                          setRenameValue(reason.label);
                        }}
                        type="button"
                      >
                        Rename
                      </button>
                    )}
                    <button
                      className="link-underline"
                      disabled={busy}
                      onClick={() =>
                        void run({ active: !reason.active }, `/api/admin/review/settings/reasons/${reason.id}`)
                      }
                      type="button"
                    >
                      {reason.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {adding === decision.code ? (
            <div className="mt-3 grid gap-2 text-xs">
              <div className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center">
                <label className="grid gap-1">
                  <span className="eyebrow">Code</span>
                  <input
                    aria-label={`Code for a new ${decision.label} reason`}
                    className="field py-1 font-mono text-xs"
                    maxLength={64}
                    onChange={(event) => setNewCode(event.target.value)}
                    placeholder="plain_words"
                    value={newCode}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="eyebrow">Label</span>
                  <input
                    aria-label={`Label for a new ${decision.label} reason`}
                    className="field py-1 text-xs"
                    maxLength={100}
                    onChange={(event) => setNewLabel(event.target.value)}
                    placeholder="Shown to reviewers"
                    value={newLabel}
                  />
                </label>
                <button
                  className="btn btn-primary px-3 py-1 text-xs sm:mt-4"
                  disabled={busy || !newCode.trim() || !newLabel.trim()}
                  onClick={() =>
                    void run({ queueKey, decision: decision.code, code: newCode.trim(), label: newLabel.trim() })
                  }
                  type="button"
                >
                  Add reason
                </button>
              </div>
              <button className="link-underline w-fit" onClick={() => setAdding(null)} type="button">
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary mt-3 px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => setAdding(decision.code)}
              type="button"
            >
              Add a reason
            </button>
          )}
        </div>
      ))}
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
