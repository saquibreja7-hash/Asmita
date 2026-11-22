"use client";

import { useState, type ReactNode } from "react";
import { csrfFetch } from "@/lib/client-csrf";

/*
 * Step-up MFA for the console's client components (review-console-spec.md
 * WP144). The actions that need a fresh authenticator proof answer 403
 * mfa_step_up_required; this hook answers that refusal with a dialog that
 * takes a code, posts it to /api/admin/mfa/step-up, and retries the original
 * request once. Cancelling resolves the caller's promise with the refusal,
 * so nothing is sent and the caller can say so in words.
 *
 * Nothing here touches survivor data; the code goes to the admin's own
 * authenticator check and nowhere else.
 */

export type StepUpPostResult = { ok: boolean; error?: string; body?: Record<string, unknown> };

type Waiting = {
  rerun: () => Promise<StepUpPostResult>;
  settle: (result: StepUpPostResult) => void;
};

async function rawPost(path: string, body: Record<string, unknown>, method: "POST" | "DELETE"): Promise<StepUpPostResult> {
  try {
    const response = await csrfFetch(path, { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok) return { ok: true, body: data ?? undefined };
    return { ok: false, error: typeof data?.error === "string" ? data.error : "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

export function useStepUpPost() {
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function post(path: string, body: Record<string, unknown>, method: "POST" | "DELETE" = "POST"): Promise<StepUpPostResult> {
    const first = await rawPost(path, body, method);
    if (first.error !== "mfa_step_up_required") return first;
    // A fresh dialog starts empty; the input below takes focus on mount.
    setCode("");
    setError(null);
    return new Promise<StepUpPostResult>((resolve) => {
      setWaiting({
        rerun: () => rawPost(path, body, method),
        settle: resolve,
      });
    });
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!waiting || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    const stepUp = await rawPost("/api/admin/mfa/step-up", { token: code }, "POST");
    setBusy(false);
    if (!stepUp.ok) {
      setError(stepUp.error === "invalid_totp" ? "That code was not accepted. Try the next one." : "The code could not be checked. Try again.");
      return;
    }
    const retried = await waiting.rerun();
    waiting.settle(retried);
    setWaiting(null);
  }

  function cancel() {
    if (!waiting) return;
    waiting.settle({ ok: false, error: "mfa_step_up_required" });
    setWaiting(null);
  }

  const stepUpDialog: ReactNode = waiting && (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--ink)_50%,transparent)] p-4">
      <form
        aria-label="Confirm it is you with a fresh authenticator code"
        aria-modal="true"
        className="a-card w-full max-w-sm p-6"
        onSubmit={(event) => void submitCode(event)}
        role="dialog"
      >
        <h2>Confirm it&apos;s you</h2>
        <p className="muted mt-2 text-sm">
          This change needs a fresh authenticator code. Enter the six digits your app shows right now.
        </p>
        <label className="mt-4 grid gap-1">
          <span className="eyebrow">Authenticator code</span>
          <input
            autoComplete="one-time-code"
            autoFocus
            className="field font-mono tabular-nums"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            pattern="\d{6}"
            placeholder="000000"
            type="text"
            value={code}
          />
        </label>
        {error && (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn btn-primary" disabled={busy || code.length !== 6} type="submit">
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button className="btn btn-secondary" onClick={cancel} type="button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  return { post, stepUpDialog };
}
