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
        ? "Link added. Refresh to see the updated status."
        : "Could not add this link. Check that it is a valid public URL."
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
        ? "Link marked as resolved."
        : "Could not mark this link resolved."
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[26px]">
        Add a link
      </h2>

      <div>
        <label
          htmlFor="additional-urls"
          className="block text-sm font-semibold text-[var(--foreground)]"
        >
          Paste one URL per line
        </label>
        <p className="muted mt-1 text-sm leading-[1.6]">
          Same rules apply - Asmita reads only the domain. The content at the link is never opened.
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
            {loading ? "Working..." : "Add to case"}
          </button>

          {firstUrlId && (
            <button
              className="text-sm text-[var(--muted)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--foreground)] hover:decoration-current"
              disabled={loading}
              onClick={markResolved}
              type="button"
            >
              Mark first link resolved
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
