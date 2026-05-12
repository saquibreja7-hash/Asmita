"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function DeleteAccountForm() {
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await csrfFetch("/api/account/delete", { method: "POST" });
    setMessage(response.ok ? "Deletion scheduled. Hard delete runs after 30 days." : "Please sign in again.");
  }

  return (
    <form className="panel mt-8 max-w-xl space-y-5 p-6" onSubmit={submit}>
      <p className="muted leading-7">
        This schedules a soft delete immediately and a hard delete after 30 days. Case evidence
        required for legal proof may need human policy review before production.
      </p>
      <label className="block text-sm font-bold" htmlFor="confirm-delete">
        Type DELETE to continue
        <input
          className="field mt-2"
          id="confirm-delete"
          onChange={(event) => setConfirm(event.target.value)}
          value={confirm}
        />
      </label>
      <button className="btn btn-primary" disabled={confirm !== "DELETE"} type="submit">
        Schedule deletion
      </button>
      {message ? <p className="font-bold text-[var(--teal)]">{message}</p> : null}
    </form>
  );
}
