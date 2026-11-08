"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import type { RevealReason } from "@/lib/admin-access-log";

const REASONS: Array<[RevealReason, string]> = [
  ["check_removal", "Check whether it was removed"],
  ["survivor_asked", "The survivor asked"],
  ["platform_asked", "The platform asked"],
  ["other", "Other"],
];

const ERRORS: Record<string, string> = {
  url_expired: "This link passed the retention period and was deleted.",
  rate_limited: "Too many reveals in the last hour. Try again later.",
  permission_denied: "Your admin role cannot reveal links.",
  access_log_failed: "The reveal could not be recorded, so the link was not shown.",
  database_required: "Revealing needs a database.",
};

const SHOW_SECONDS = 30;

// Shows the survivor's link as plain text, never a clickable link, for 30
// seconds after the admin gives a reason. The server records every reveal.
export function RevealLink({ urlId }: { urlId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RevealReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!url) return;
    const tick = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    const hide = setTimeout(() => setUrl(null), SHOW_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, [url]);

  async function reveal(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/urls/${urlId}/reveal`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url) {
        setError(ERRORS[body?.error ?? ""] ?? "The link could not be shown.");
        return;
      }
      setUrl(body.url);
      setSecondsLeft(SHOW_SECONDS);
      setOpen(false);
      setReason("");
    } catch {
      setError("The link could not be shown.");
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <div className="grid gap-2 text-sm" role="status">
        <code className="block break-all rounded border border-[var(--line)] p-2 font-mono text-xs" translate="no">
          {url}
        </code>
        <p className="muted text-xs tabular-nums">
          Hidden in {secondsLeft}s.{" "}
          <button className="link-underline" onClick={() => setUrl(null)} type="button">
            Hide now
          </button>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="grid gap-1">
        <button className="link-underline text-left text-xs" onClick={() => setOpen(true)} type="button">
          Reveal link
        </button>
        {error && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="grid gap-2 text-xs" onSubmit={reveal}>
      <label className="grid gap-1" htmlFor={`reveal-reason-${urlId}`}>
        <span>Why do you need to see this link? This is recorded.</span>
        <select
          className="field"
          id={`reveal-reason-${urlId}`}
          onChange={(event) => setReason(event.target.value as RevealReason)}
          required
          value={reason}
        >
          <option value="">Choose a reason</option>
          {REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy || !reason} type="submit">
          {busy ? "Revealing…" : "Reveal"}
        </button>
        <button className="link-underline" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
