"use client";

import { useState } from "react";

// Prepared wording the survivor pastes into an official form. She adds her own
// link where it says so: the draft never carries the URL.
export function CopyDraft({ label, copy, copied, text }: { label: string; copy: string; copied: string; text: string }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      // Clipboard blocked: the text stays selectable in the box.
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-[var(--ink)]">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-[44px] items-center !text-sm text-[var(--brand-strong)] underline underline-offset-4"
        >
          {done ? copied : copy}
        </button>
      </div>
      {/* Announce the copy result from outside the button: a live region
          inside the activated element is not reliably announced. */}
      <span aria-live="polite" className="sr-only">
        {done ? copied : ""}
      </span>
      <textarea
        readOnly
        value={text}
        aria-label={label}
        rows={Math.min(9, text.split("\n").length + 2)}
        className="mt-2 w-full resize-y rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-3 font-mono text-[12.5px] leading-[1.6] text-[var(--ink)]"
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  );
}
