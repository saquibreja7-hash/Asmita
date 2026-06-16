"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

export function DeleteAccountForm({ locale }: { locale: Locale }) {
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
      setMessage(t(locale, "delete.done.sub"));
    } else {
      setMessage(t(locale, "delete.form.error"));
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {t(locale, "delete.done.eyebrow")}
        </p>
        <p className="font-display mt-4 text-[24px] leading-[1.3] tracking-tight text-[var(--foreground)] md:text-[32px]">
          {t(locale, "delete.done.title")}
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
        {t(locale, "delete.form.eyebrow")}
      </p>
      <h2 className="font-display -mt-2 text-center text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
        {t(locale, "delete.form.title")}
      </h2>

      <div>
        <label
          htmlFor="confirm-delete"
          className="sr-only"
        >
          {t(locale, "delete.form.label")}
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
          {t(locale, "delete.form.note")}
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
          {submitting ? t(locale, "delete.form.scheduling") : t(locale, "delete.form.cta")}
        </button>
      </div>
    </form>
  );
}
