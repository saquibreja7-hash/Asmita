"use client";

import { useState, type FormEvent } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

// The compact newsletter sign-up: inline email field + button, used in the
// footer, on /newsletter and in the careers empty state. Posts to
// /api/newsletter, which starts the double opt-in. The success state is
// the same whether the address is new or already on the list.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewsletterInlineForm({
  locale,
  source,
  variant = "inline",
}: {
  locale: Locale;
  source: string;
  variant?: "inline" | "footer";
}) {
  const [email, setEmail] = useState("");
  const [fax, setFax] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!EMAIL.test(email.trim())) {
      setError(t(locale, "org.newsletter.f.err.email"));
      document.getElementById(`${source}-newsletter-email`)?.focus();
      return;
    }
    setSubmitting(true);
    const response = await csrfFetch("/api/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), locale, source, fax: fax || undefined }),
    }).catch(() => null);
    setSubmitting(false);
    if (response?.ok) {
      setSent(true);
      return;
    }
    const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string };
    setError(
      payload.error === "rate_limited"
        ? t(locale, "org.newsletter.f.errorRate")
        : payload.error === "invalid_payload"
          ? t(locale, "org.newsletter.f.err.email")
          : variant === "footer"
            ? t(locale, "org.newsletter.footerError")
            : t(locale, "org.newsletter.f.errorGeneric"),
    );
  }

  if (sent) {
    return (
      <p role="status" aria-live="polite" className={variant === "footer" ? "text-sm text-[var(--ink)]" : "muted text-sm"}>
        {variant === "footer" ? t(locale, "org.newsletter.footerSuccess") : t(locale, "org.newsletter.f.successTitle")}
      </p>
    );
  }

  const compact = variant === "footer";
  return (
    <form onSubmit={submit} noValidate className={compact ? "" : "mx-auto max-w-md"}>
      {/* Hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${source}-newsletter-fax`}>Fax</label>
        <input id={`${source}-newsletter-fax`} tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} />
      </div>
      <label htmlFor={`${source}-newsletter-email`} className={compact ? "sr-only" : "block text-[15px] font-medium text-[var(--ink)]"}>
        {/* The footer variant names the field for what it is: every victim
            page also carries the registration form's "Email address", and a
            screen reader (and Playwright's label lookup) must not see two
            fields with the same name on one page. */}
        {compact ? t(locale, "org.newsletter.footerEmailLabel") : t(locale, "org.newsletter.f.emailLabel")}
      </label>
      <div className={compact ? "flex max-w-xs gap-2" : "mt-2 flex flex-col gap-3 sm:flex-row"}>
        <input
          id={`${source}-newsletter-email`}
          type="email"
          required
          autoComplete="email"
          className={`field ${compact ? "!min-h-[42px] flex-1 !py-2 !text-sm" : ""}`}
          placeholder={t(locale, "org.newsletter.f.placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <button type="submit" className={`btn btn-primary btn-arrow !m-0 ${compact ? "!min-h-[42px] !py-2 !text-sm" : ""}`} disabled={submitting}>
          {submitting ? t(locale, "org.newsletter.f.sending") : t(locale, "org.newsletter.f.cta")}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-medium text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
