"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function DeleteAccountForm() {
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const response = await csrfFetch("/api/account/delete", { method: "POST" });
    setSubmitting(false);
    if (response.ok) {
      setDone(true);
      setMessage(
        "Deletion scheduled. Hard delete will run automatically after 30 days."
      );
    } else {
      setMessage("Please sign in again, then try once more.");
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Confirmed
        </p>
        <p className="font-display mt-4 text-[24px] leading-[1.3] tracking-tight text-[var(--foreground)] md:text-[32px]">
          Deletion scheduled. 30 days from now.
        </p>
        <p className="muted mx-auto mt-5 max-w-md text-base leading-[1.75]">
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Confirm deletion
      </p>
      <h2 className="font-display -mt-2 text-center text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
        Type DELETE to continue.
      </h2>

      <div>
        <label
          htmlFor="confirm-delete"
          className="sr-only"
        >
          Type DELETE to continue
        </label>
        <input
          className="field text-center font-mono text-lg tracking-[0.3em]"
          id="confirm-delete"
          onChange={(event) => setConfirm(event.target.value.toUpperCase())}
          value={confirm}
          placeholder="DELETE"
          autoComplete="off"
        />
        <p className="muted mt-2 text-center text-xs leading-[1.6]">
          Case-sensitive. The action is reversible within 30 days by writing
          to support.
        </p>
      </div>

      {message && !done && (
        <p className="text-center text-sm font-semibold text-[var(--rose)]">
          {message}
        </p>
      )}

      <div className="text-center">
        <button
          className="btn btn-primary"
          disabled={confirm !== "DELETE" || submitting}
          type="submit"
        >
          {submitting ? "Scheduling…" : "Schedule deletion"}
        </button>
      </div>
    </form>
  );
}
