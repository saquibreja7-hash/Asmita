"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

export function CaseDashboardActions({ caseId, locale }: { caseId: string; locale: Locale }) {
  const router = useRouter();
  const [urlText, setUrlText] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [loading, setLoading] = useState(false);

  async function addUrl() {
    setLoading(true);
    setMessage("");
    let ok = false;
    try {
      const response = await csrfFetch(`/api/cases/${caseId}/urls`, {
        method: "POST",
        body: JSON.stringify({
          urls: urlText.split(/\n+/).map((u) => u.trim()).filter(Boolean),
          declaration: true,
        }),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }
    setLoading(false);
    setMessageOk(ok);
    setMessage(t(locale, ok ? "case.actions.added" : "case.actions.error"));
    if (ok) {
      setUrlText("");
      router.refresh();
    }
  }

  return (
    <div>
      <label htmlFor="additional-urls" className="block text-sm font-medium text-[var(--ink)]">
        {t(locale, "case.actions.label")}
      </label>
      <p className="muted mt-1 text-sm leading-[1.6]">{t(locale, "case.actions.sub")}</p>
      <textarea
        className="field mt-3 min-h-28 font-mono text-[13px] leading-[1.7]"
        id="additional-urls"
        onChange={(e) => setUrlText(e.target.value)}
        placeholder="https://example.com/post/1234"
        spellCheck={false}
        value={urlText}
      />
      <button className="btn btn-primary mt-4" disabled={loading || !urlText.trim()} onClick={addUrl} type="button">
        {loading ? t(locale, "case.actions.working") : t(locale, "case.actions.cta")}
      </button>
      {message && (
        <p aria-live="polite" className={`mt-3 text-sm font-medium ${messageOk ? "text-[var(--brand)]" : "text-[var(--danger)]"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
