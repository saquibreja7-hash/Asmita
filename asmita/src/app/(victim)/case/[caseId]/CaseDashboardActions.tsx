"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function CaseDashboardActions({
  caseId,
  firstUrlId,
}: {
  caseId: string;
  firstUrlId?: string;
}) {
  const [urlText, setUrlText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function addUrl() {
    setLoading(true);
    setMessage("");
    const response = await csrfFetch(`/api/cases/${caseId}/urls`, {
      method: "POST",
      body: JSON.stringify({
        urls: urlText
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean),
        declaration: true,
      }),
    });
    setLoading(false);
    setMessage(
      response.ok
        ? "URL added. Refresh to see the updated status list."
        : "Could not add this URL."
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
    setMessage(
      response.ok
        ? "URL marked manually resolved."
        : "Could not mark this URL resolved."
    );
  }

  return (
    <section className="space-y-10" aria-label="Case actions">
      <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Actions
      </p>
      <h2 className="font-display -mt-6 text-center text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
        Add a URL, or close one.
      </h2>

      <div className="mx-auto max-w-xl">
        <label
          htmlFor="additional-urls"
          className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]"
        >
          Add another URL
        </label>
        <p className="muted mt-1 text-sm leading-[1.6]">
          Paste one URL per line. Same rules apply - Asmita reads only the
          domain.
        </p>
        <textarea
          className="field mt-3 min-h-28 font-mono text-[14px] leading-[1.7]"
          id="additional-urls"
          onChange={(event) => setUrlText(event.target.value)}
          placeholder="https://example.com/post/1234"
          spellCheck={false}
          value={urlText}
        />
        <div className="mt-4 text-center">
          <button
            className="btn btn-primary"
            disabled={loading || !urlText.trim()}
            onClick={addUrl}
            type="button"
          >
            {loading ? "Working…" : "Add URL to case"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Manual resolution
        </p>
        <h3 className="font-display mt-3 text-[22px] font-normal leading-[1.22] tracking-tight md:text-[28px]">
          If the first URL is already gone.
        </h3>
        <p className="muted mx-auto mt-4 max-w-md text-base leading-[1.75]">
          Use this if the first listed URL has already been removed or
          resolved outside the platform response flow.
        </p>
        <div className="mt-6">
          <button
            className="btn btn-secondary"
            disabled={loading || !firstUrlId}
            onClick={markResolved}
            type="button"
          >
            Mark first URL resolved
          </button>
        </div>
      </div>

      {message && (
        <p
          aria-live="polite"
          className="text-center text-sm font-semibold text-[var(--teal)]"
        >
          {message}
        </p>
      )}
    </section>
  );
}
