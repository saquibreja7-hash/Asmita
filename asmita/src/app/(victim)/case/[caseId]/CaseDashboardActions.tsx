"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

export function CaseDashboardActions({
  caseId,
  firstUrlId,
  locale,
}: {
  caseId: string;
  firstUrlId?: string;
  locale: Locale;
}) {
  const [urlText, setUrlText] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [loading, setLoading] = useState(false);

  async function addUrl() {
    setLoading(true);
    setMessage("");
    const response = await csrfFetch(`/api/cases/${caseId}/urls`, {
      method: "POST",
      body: JSON.stringify({
        urls: urlText.split(/\n+/).map((u) => u.trim()).filter(Boolean),
        declaration: true,
      }),
    });
    setLoading(false);
    setMessageOk(response.ok);
    setMessage(
      response.ok
        ? t(locale, "case.actions.added")
        : t(locale, "case.actions.error")
    );
    if (response.ok) setUrlText("");
  }

  async function markResolved() {
    if (!firstUrlId) return;
    setLoading(true);
    setMessage("");
    const response = await csrfFetch(`/api/cases/${caseId}/mark-resolved`, {
      method: "POST",
      body: JSON.stringify({ urlId: firstUrlId }),
    });
    setLoading(false);
    setMessageOk(response.ok);
    setMessage(
      response.ok
        ? t(locale, "case.actions.added")
        : t(locale, "case.actions.resolveError")
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[26px]">
        {t(locale, "case.actions.title")}
      </h2>

      <div>
        <label
          htmlFor="additional-urls"
          className="block text-sm font-semibold text-[var(--foreground)]"
        >
          {t(locale, "case.actions.label")}
        </label>
        <p className="muted mt-1 text-sm leading-[1.6]">
          {t(locale, "case.actions.sub")}
        </p>
        <textarea
          className="field mt-3 min-h-28 font-mono text-[13px] leading-[1.7]"
          id="additional-urls"
          onChange={(e) => setUrlText(e.target.value)}
          placeholder="https://example.com/post/1234"
          spellCheck={false}
          value={urlText}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            className="btn btn-primary"
            disabled={loading || !urlText.trim()}
            onClick={addUrl}
            type="button"
          >
            {loading ? t(locale, "case.actions.working") : t(locale, "case.actions.cta")}
          </button>

          {firstUrlId && (
            <button
              className="text-sm text-[var(--muted)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--foreground)] hover:decoration-current"
              disabled={loading}
              onClick={markResolved}
              type="button"
            >
              {t(locale, "case.actions.markResolved")}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p
          aria-live="polite"
          className={`text-sm font-semibold ${messageOk ? "text-[var(--teal)]" : "text-[var(--rose)]"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
