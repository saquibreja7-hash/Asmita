"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

// ASMITA-2026-7K3M9Q -> ["ASMITA", "2026", "7K3", "M9Q"]: the hyphens stay in
// the text (so selecting it copies the exact reference), the last part is
// split in two by spacing only, which is easier to read aloud.
export function referenceGroups(reference: string): { text: string; gapBefore: boolean; hyphenBefore: boolean }[] {
  const parts = reference.split("-");
  const groups: { text: string; gapBefore: boolean; hyphenBefore: boolean }[] = [];
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    if (last && part.length === 6) {
      groups.push({ text: part.slice(0, 3), gapBefore: false, hyphenBefore: index > 0 });
      groups.push({ text: part.slice(3), gapBefore: true, hyphenBefore: false });
    } else {
      groups.push({ text: part, gapBefore: false, hyphenBefore: index > 0 });
    }
  });
  return groups;
}

type CopyState = "idle" | "copied" | "failed";

export function ReferenceCard({ reference, locale, note, className = "mt-8" }: { reference: string; locale: Locale; note?: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(reference);
      setState("copied");
    } catch {
      // Clipboard blocked: the reference stays selectable on the card.
      setState("failed");
    }
    timer.current = window.setTimeout(() => setState("idle"), 3000);
  }

  const copied = state === "copied";
  return (
    <section
      aria-labelledby="case-reference-title"
      className={`relative ${className} overflow-hidden rounded-[var(--radius-box)] border border-[var(--brand-soft)] bg-[color-mix(in_srgb,var(--brand-soft)_45%,var(--card))] p-5 sm:p-6`}
    >
      <h2 id="case-reference-title" className="eyebrow">{t(locale, "confirm.ref.eyebrow")}</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p
          className="min-w-0 select-all font-mono text-[22px] font-semibold leading-tight tracking-[0.04em] text-[var(--brand-strong)] sm:text-[28px]"
          translate="no"
        >
          {referenceGroups(reference).map((group, index) => (
            <span key={index} className={group.gapBefore ? "ml-[0.35em]" : undefined}>
              {group.hyphenBefore && <span className="text-[var(--brand)] opacity-60">-</span>}
              {group.text}
            </span>
          ))}
        </p>
        <button
          aria-describedby="case-reference-title"
          className={`inline-flex min-h-[44px] min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-[var(--radius-box)] border px-4 text-sm font-medium transition-colors ${
            copied
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-[var(--brand)] bg-[var(--card)] text-[var(--brand-strong)] hover:bg-[var(--brand-soft)]"
          }`}
          onClick={() => void copy()}
          type="button"
        >
          {copied ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 3.5v-.5A1.5 1.5 0 009 1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.5" stroke="currentColor" strokeWidth="1.4" /></svg>
          )}
          <span>{copied ? t(locale, "confirm.ref.copied") : t(locale, "confirm.ref.copy")}</span>
        </button>
      </div>
      <p className="mt-4 text-sm leading-[1.65] text-[var(--text)]">{note ?? t(locale, "confirm.ref.reassure")}</p>
      <p aria-live="polite" className={state === "failed" ? "mt-2 text-sm text-[var(--danger)]" : "sr-only"} role="status">
        {state === "copied" ? t(locale, "confirm.ref.copiedAnnounce") : state === "failed" ? t(locale, "confirm.ref.copyFailed") : ""}
      </p>
    </section>
  );
}
