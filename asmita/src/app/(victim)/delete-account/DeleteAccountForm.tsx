"use client";

import { useEffect, useRef, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { FormError } from "@/components/FormError";

export function DeleteAccountForm({ locale }: { locale: Locale }) {
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // The done screen replaces the form, so focus its heading (WP40 A27).
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneHeadingRef.current?.focus();
  }, [done]);

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
        <p className="eyebrow">
          {t(locale, "delete.done.eyebrow")}
        </p>
        <h2
          ref={doneHeadingRef}
          tabIndex={-1}
          className="font-display mt-4 text-[24px] leading-[1.3] tracking-tight text-[var(--ink)] outline-none md:text-[32px]"
        >
          {t(locale, "delete.done.title")}
        </h2>
        <p className="muted mx-auto mt-5 max-w-md text-base leading-[1.75]" role="status">
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <p className="eyebrow text-center">
        {t(locale, "delete.form.eyebrow")}
      </p>
      <h2 className="section-title -mt-2 text-center">
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

      <FormError message={message} className="text-center" />

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
