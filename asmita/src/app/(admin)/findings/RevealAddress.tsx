"use client";

import { useEffect, useState } from "react";
import type { RevealReason } from "@/lib/admin-access-log";
import { AddressDisplay } from "./AddressDisplay";
import { REVEAL_REASON_OPTIONS, REVEAL_SECONDS, revealFinding, type RevealedAddress } from "./findings-client";

// The reveal is recorded server-side with the reason. The address is held in
// state for 30 seconds and only ever rendered as text.
export function RevealAddress({ findingId, urlsPurged }: { findingId: string; urlsPurged: boolean }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<RevealReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedAddress | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState<"page" | "image" | null>(null);

  useEffect(() => {
    if (!revealed) return;
    const tick = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    const hide = setTimeout(() => setRevealed(null), REVEAL_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, [revealed]);

  async function reveal(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    const result = await revealFinding(findingId, reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRevealed({ pageUrl: result.data.pageUrl, imageUrl: result.data.imageUrl });
    setSecondsLeft(REVEAL_SECONDS);
    setAsking(false);
    setReason("");
  }

  async function copy(which: "page" | "image") {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(which === "page" ? revealed.pageUrl : revealed.imageUrl);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copy failed. Select the text and copy it by hand.");
    }
  }

  if (urlsPurged) {
    return <p className="muted text-sm">The addresses passed the retention period and were deleted.</p>;
  }

  if (revealed) {
    return (
      <AddressDisplay
        copied={copied}
        imageUrl={revealed.imageUrl}
        onCopy={copy}
        onHide={() => setRevealed(null)}
        pageUrl={revealed.pageUrl}
        secondsLeft={secondsLeft}
      />
    );
  }

  if (!asking) {
    return (
      <div className="grid gap-2">
        <div>
          <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setAsking(true)} type="button">
            Reveal address
          </button>
        </div>
        {error && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="grid max-w-md gap-2 text-sm" onSubmit={reveal}>
      <label className="grid gap-1" htmlFor="finding-reveal-reason">
        <span>Why do you need to see this address? This is recorded against your name.</span>
        <select
          autoFocus
          className="field"
          id="finding-reveal-reason"
          onChange={(event) => setReason(event.target.value as RevealReason)}
          required
          value={reason}
        >
          <option value="">Choose a reason</option>
          {REVEAL_REASON_OPTIONS.map(([value, label]) => (
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
        <button className="link-underline text-xs" onClick={() => setAsking(false)} type="button">
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
