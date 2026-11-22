"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { MESSAGE_CHECK_PATTERN_IDS, type MessageCheckPatternId } from "@/lib/lab/message-check/patterns";
import { countsAsFinding, detectedElements, ELEMENT_LABELS } from "@/lib/lab/message-check/elements";
import { SEXTORTION_ADVICE_IDS, type SextortionAdviceId } from "@/lib/lab/sextortion/advice";
import type { SextortionLabel } from "@/lib/lab/sextortion/taxonomy";

const MAX_CHARS = 4000;

type CheckResult = {
  matches: MessageCheckPatternId[];
  labels: SextortionLabel[];
  flagged: boolean;
  advice: SextortionAdviceId[];
  summary: string | null;
};
type Status = "idle" | "checking" | "done" | "minor" | "rateLimited" | "error";

// The ids the server may send back; anything else in the payload is dropped
// before it can reach an i18n lookup. The label list excludes MINOR_SIGNAL
// (the route never returns it outside the minor pathway) and NOT_THREAT
// (never a finding the page may show).
const KNOWN_IDS = new Set<string>(MESSAGE_CHECK_PATTERN_IDS);
const KNOWN_LABELS = new Set<string>(ELEMENT_LABELS);
const KNOWN_ADVICE = new Set<string>(SEXTORTION_ADVICE_IDS);

/**
 * WP93 + WP117 (docs/lab/beta-spec.md, docs/research/research-tools-spec.md
 * Track D): the paste-and-check form for the message check tool. The pasted
 * text goes to /api/lab/message-check only: nowhere else on this page
 * fetches anything, and links inside the text are never opened. The results
 * are plain sentences per detected element — WP93 rule matches and WP117
 * classifier labels merged, one sentence per element — followed by
 * stage-chosen advice. No score, percentage or verdict is ever shown.
 * Results are announced to screen readers (role="status" plus focus moved
 * to the results heading, the site's A5 pattern).
 */
export function MessageCheckForm({ locale }: { locale: Locale }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<CheckResult | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  // The displayed element lists: one sentence per element, labels first,
  // then the rules whose element no label already covers (elements.ts).
  const elements = result ? detectedElements(result.matches, result.labels) : null;
  // The warning headline only for a real finding: the flag, or an element
  // other than a victim's own plea (the API already drops unbacked labels;
  // this keeps the page honest whatever it is sent).
  const foundSomething = elements !== null && result !== null && countsAsFinding(elements, result.flagged);

  useEffect(() => {
    if (status === "done" || status === "minor") resultHeadingRef.current?.focus();
  }, [status]);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || status === "checking") return;
    setStatus("checking");
    setResult(null);
    try {
      const csrf = await (await fetch("/api/csrf", { cache: "no-store" })).json();
      const response = await fetch("/api/lab/message-check", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": (csrf as { token: string }).token },
        body: JSON.stringify({ text, locale }),
      });
      const payload = (await response.json().catch(() => null)) as {
        matches?: unknown;
        labels?: unknown;
        flagged?: unknown;
        advice?: unknown;
        summary?: unknown;
        minor?: boolean;
        error?: string;
      } | null;

      if (response.status === 429) {
        setStatus("rateLimited");
        return;
      }
      if (!response.ok || !payload) {
        setStatus("error");
        return;
      }
      if (payload.minor) {
        setStatus("minor");
        return;
      }
      const matches = Array.isArray(payload.matches)
        ? payload.matches.filter((id): id is MessageCheckPatternId => KNOWN_IDS.has(id as string))
        : [];
      const labels = Array.isArray(payload.labels)
        ? payload.labels.filter((label): label is SextortionLabel => KNOWN_LABELS.has(label as string))
        : [];
      const advice = Array.isArray(payload.advice)
        ? payload.advice.filter((id): id is SextortionAdviceId => KNOWN_ADVICE.has(id as string))
        : [];
      const summary = typeof payload.summary === "string" && payload.summary.trim() ? payload.summary : null;
      setResult({ matches, labels, flagged: payload.flagged === true, advice, summary });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={check} className="mx-auto max-w-xl">
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
        <label htmlFor="message-check-text" className="font-display text-[18px] font-normal leading-snug tracking-tight">
          {t(locale, "lab.message-check.form.label")}
        </label>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.message-check.form.hint")}</p>
        <textarea
          id="message-check-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_CHARS}
          rows={7}
          required
          placeholder={t(locale, "lab.message-check.form.placeholder")}
          className="input mt-4 resize-y"
        />
        <p aria-hidden="true" className="muted mt-2 text-right font-mono text-xs tabular-nums">
          {text.length} / {MAX_CHARS}
        </p>
        <button type="submit" disabled={status === "checking" || !text.trim()} className="btn btn-primary mt-4">
          {t(locale, "lab.message-check.form.button")}
        </button>
      </div>

      {/* Announced to screen readers only: the form's state changes. */}
      <p className="sr-only" role="status">
        {status === "checking"
          ? t(locale, "lab.message-check.form.checking")
          : status === "done"
            ? t(locale, "lab.message-check.result.title")
            : status === "minor"
              ? t(locale, "lab.message-check.minor.title")
              : ""}
      </p>

      {/* The tool did not run: the text mentions someone under 18. */}
      {status === "minor" && (
        <div className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" role="alert">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="font-display text-[20px] font-normal leading-[1.3] tracking-tight text-[var(--ink)] outline-none">
            {t(locale, "lab.message-check.minor.title")}
          </h2>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "lab.message-check.minor.body")}</p>
          <Link href="/minor-support" className="btn btn-primary mt-5">
            {t(locale, "lab.message-check.minor.cta")}
          </Link>
        </div>
      )}

      {status === "rateLimited" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="muted text-sm leading-[1.75]">{t(locale, "lab.message-check.error.rateLimited")}</p>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="muted text-sm leading-[1.75]">{t(locale, "lab.message-check.error.body")}</p>
        </div>
      )}

      {status === "done" && result && elements && (
        <div className="mt-6">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="eyebrow mb-4 block outline-none">
            {t(locale, "lab.message-check.result.title")}
          </h2>
          <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
            <p className="font-display text-[20px] font-normal leading-[1.3] tracking-tight text-[var(--ink)]">
              {t(locale, foundSomething ? "lab.message-check.result.some.title" : "lab.message-check.result.none.title")}
            </p>
            <p className="muted mt-3 text-sm leading-[1.75]">
              {t(locale, foundSomething ? "lab.message-check.result.some.body" : "lab.message-check.result.none.body")}
            </p>
            {foundSomething && (
              <ul className="mt-5 text-sm leading-[1.75] text-[var(--text)]">
                {elements.labels.map((label) => (
                  <li key={label} className="border-t border-[var(--line)] py-3 first:border-t-0 first:pt-0">
                    {t(locale, `lab.message-check.label.${label}` as MessageKey)}
                  </li>
                ))}
                {elements.rules.map((id) => (
                  <li key={id} className="border-t border-[var(--line)] py-3 first:border-t-0 first:pt-0">
                    {t(locale, `lab.message-check.pattern.${id}` as MessageKey)}
                  </li>
                ))}
              </ul>
            )}
            {result.advice.length > 0 && (
              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <h3 className="font-medium text-[var(--ink)]">{t(locale, "lab.message-check.advice.title")}</h3>
                <ul className="mt-3 space-y-2 text-sm leading-[1.75] text-[var(--text)]">
                  {result.advice.map((id) => (
                    <li key={id}>{t(locale, `lab.message-check.advice.${id}` as MessageKey)}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="muted mt-5 border-t border-[var(--line)] pt-4 text-xs leading-[1.6]">
              {t(locale, "lab.message-check.result.limit")}
            </p>
            {result.summary && (
              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="font-medium text-[var(--ink)]">{t(locale, "lab.message-check.summary.title")}</p>
                <p className="mt-2 text-sm leading-[1.75] text-[var(--text)]">{result.summary}</p>
                <p className="muted mt-2 text-xs leading-[1.6]">{t(locale, "lab.message-check.summary.note")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
