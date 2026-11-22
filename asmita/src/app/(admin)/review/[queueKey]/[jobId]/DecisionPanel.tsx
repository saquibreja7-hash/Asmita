"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { panelState } from "./review-panel-state";
import { panelShortcut } from "./review-shortcuts";

/*
 * The sticky decision panel of the review screen (WP141). It receives ids
 * and counts only — never subject data, never a survivor's material. The
 * decisions come from the adapter (the existing functions' own labels), the
 * reason stays internal (WP142 builds the reason picker; until then a note
 * is the reason), and the lease rules live on the server: this panel only
 * refuses to submit what the server would refuse anyway.
 */

const HEARTBEAT_MS = 4 * 60_000;
const SHORTCUTS_STORAGE_KEY = "asmita.review.shortcuts";

export type DecisionPanelProps = {
  jobId: string;
  queueKey: string;
  queueName: string;
  /** The adapter's decisions, in button order. Empty for the protected queue. */
  decisions: ReadonlyArray<{ code: string; label: string; reasonKind: "approve" | "reject" | null }>;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
  /** How many jobs wait in this queue, including this one. */
  left: number;
  /** The server's verdict on the viewer's lease. */
  claimLost: boolean;
  /** Why the lease is not held, in the state's own words (spec: "Someone else has this now"). */
  lostMessage?: string;
  /** Whether the viewer's role passes the adapter's permission. */
  canDecide: boolean;
  /** minor-hold: no decision continues the adult flow from there. */
  protectedQueue: boolean;
};

// The server's refusal codes in words (the redesign's rule: the code in
// words, never "Error - reload").
const ERRORS: Record<string, string> = {
  reason_required: "Choose a reason first.",
  unknown_decision: "That decision is not offered for this item.",
  permission_denied: "Your admin role cannot decide this item.",
  rate_limited: "Too many decisions in a short time. Wait a moment, then try again.",
  job_closed: "This item was just decided by someone else. Nothing was sent twice.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
};

function readShortcutsOn(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeShortcutsOn(on: boolean): void {
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // A private window or a blocked storage just does not remember the choice.
  }
}

/** One job API call: CSRF-minted, JSON, with the refusal code kept verbatim. */
async function postJob(path: string, jobId: string, body?: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const response = await csrfFetch(`/api/admin/review/jobs/${jobId}/${path}`, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json().catch(() => null)) as { error?: string; status?: string; closed?: boolean } | null;
    if (response.ok) return { ok: true, data };
    return { ok: false, error: data?.error ?? "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

export function DecisionPanel(props: DecisionPanelProps) {
  const { jobId, queueKey, queueName, decisions, left, claimLost, canDecide, protectedQueue } = props;
  const lostMessage = props.lostMessage ?? "Someone else has this now";
  const router = useRouter();
  const [decision, setDecision] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(claimLost);
  // The per-admin off switch, remembered in the browser like the case list's
  // shortcuts (same pattern, CaseTable.tsx).
  const [shortcutsOn, setShortcutsOn] = useState(() => (typeof window === "undefined" ? true : readShortcutsOn()));
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const guidanceRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const skipRef = useRef<(() => Promise<void>) | null>(null);

  const chosen = decisions.find((entry) => entry.code === decision) ?? null;
  const { submitDisabled, hint, reasonRequired } = panelState({
    decisions,
    decision,
    note,
    requireReasonOnReject: props.requireReasonOnReject,
    requireReasonOnApprove: props.requireReasonOnApprove,
    canDecide,
    lost,
    busy,
  });
  const nextHref = `/admin/review/${queueKey}`;

  async function call(path: string, body?: Record<string, unknown>) {
    return postJob(path, jobId, body);
  }

  async function submit() {
    if (!chosen || submitDisabled) return;
    setBusy(true);
    setError(null);
    const result = await call("decide", { decision: chosen.code, reasonNote: note.trim() || undefined });
    if (!result.ok) {
      setBusy(false);
      if (result.error === "claim_lost" || result.error === "job_closed") {
        setLost(result.error === "claim_lost");
        if (result.error === "job_closed") {
          setError(ERRORS.job_closed);
          router.push(nextHref);
        }
        return;
      }
      setError(ERRORS[result.error ?? ""] ?? "Not saved. Nothing was sent. Reload and try again.");
      return;
    }
    // Submitted: the next job loads automatically. When the existing
    // function kept the subject open (a first approval waiting for a second
    // analyst, an application marked contacted), say so on the next screen.
    const data = result.data as { closed?: boolean; status?: string } | undefined;
    const noted = data && data.closed === false && data.status ? `?noted=${encodeURIComponent(data.status)}` : "";
    router.push(`${nextHref}${noted}`);
  }

  async function skip() {
    if (busy || lost) return;
    setBusy(true);
    setError(null);
    const result = await call("skip");
    if (!result.ok) {
      setBusy(false);
      if (result.error === "claim_lost") setLost(true);
      return;
    }
    router.push(nextHref);
  }

  // The keyboard handler reads the latest submit/skip through refs; updating
  // them is an effect, never render work.
  useEffect(() => {
    submitRef.current = submit;
    skipRef.current = skip;
  });

  // The lease heartbeat: every 4 minutes while the tab is visible. A lost
  // lease is shown at once and the panel stops submitting; the server
  // re-checks the claim on every call regardless.
  useEffect(() => {
    if (lost) return;
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await postJob("extend", jobId);
      if (!result.ok && (result.error === "claim_lost" || result.error === "job_closed")) setLost(true);
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [jobId, lost]);

  // The keyboard map. Suppressed while typing; the off switch is in the
  // shortcuts sheet.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = panelShortcut(
        { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, target: event.target as never },
        { shortcutsOn, decisionCount: decisions.length },
      );
      if (!shortcut) return;
      const openDialog = document.querySelector("dialog[open]");
      switch (shortcut.type) {
        case "decision":
          event.preventDefault();
          setDecision(decisions[shortcut.index].code);
          break;
        case "focusReason":
          event.preventDefault();
          reasonRef.current?.focus();
          break;
        case "submit":
          event.preventDefault();
          void submitRef.current?.();
          break;
        case "skip":
          event.preventDefault();
          void skipRef.current?.();
          break;
        case "guidance":
          event.preventDefault();
          guidanceRef.current?.showModal();
          break;
        case "help":
          event.preventDefault();
          helpRef.current?.showModal();
          break;
        case "close":
          if (openDialog) {
            event.preventDefault();
            (openDialog as HTMLDialogElement).close();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutsOn, decisions]);

  return (
    <div className="a-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">{queueName}</p>
        <p className="muted tabular-nums text-xs">{left} left in this queue</p>
      </div>

      {lost ? (
        <div className="mt-4 grid gap-3">
          <p className="font-medium text-[var(--danger)]" role="status">
            <span aria-hidden="true">! </span>{lostMessage}
          </p>
          <p className="muted text-xs">Nothing you typed was sent. The server re-checks every hold on every request.</p>
          <Link className="btn btn-primary w-fit" href={nextHref} prefetch={false}>
            Get the next one
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => guidanceRef.current?.showModal()} type="button">
              Guidance
            </button>
            <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => void skip()} type="button">
              Skip
            </button>
            <button className="link-underline text-xs" onClick={() => helpRef.current?.showModal()} type="button">
              Shortcuts
            </button>
          </div>

          {protectedQueue ? (
            <p className="muted mt-4 text-xs">
              Possible minor. Nothing here continues the adult flow: only the existing two-admin
              label-clearing flow can let this item move on.
            </p>
          ) : canDecide ? (
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold">Decision</legend>
              <div className="mt-2 grid gap-1.5">
                {decisions.map((entry, index) => {
                  const id = `decision-${entry.code}`;
                  const selected = decision === entry.code;
                  return (
                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-box)] border px-3 py-2 text-xs leading-[1.5] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)] ${
                        selected
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink)]"
                          : "border-[var(--line)] bg-[var(--card)] hover:border-[var(--brand)]"
                      }`}
                      htmlFor={id}
                      key={entry.code}
                    >
                      <input
                        aria-describedby="decision-hint"
                        checked={selected}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                        id={id}
                        name="decision"
                        onChange={() => setDecision(entry.code)}
                        type="radio"
                        value={entry.code}
                      />
                      <span>
                        {decisions.length <= 9 && (
                          <span className="a-kbd mr-1.5" aria-hidden="true">
                            {index + 1}
                          </span>
                        )}
                        {entry.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p className="muted mt-4 text-xs">Your admin role cannot decide items in this queue.</p>
          )}

          <div className="mt-4">
            <label className="grid gap-1" htmlFor="decision-note">
              <span className="text-xs font-semibold">Reason (internal)</span>
              <textarea
                aria-describedby="decision-note-hint"
                className="field min-h-[72px] py-2 text-xs"
                id="decision-note"
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
                placeholder={reasonRequired ? "Required for this decision" : "Optional"}
                ref={reasonRef}
                rows={3}
                value={note}
              />
            </label>
            <p className="muted mt-1 text-[11px]" id="decision-note-hint">
              Recorded encrypted, internal only. Never sent to the survivor or a platform.
            </p>
          </div>

          <button
            aria-describedby="decision-hint"
            className="btn btn-primary mt-4 w-full"
            disabled={submitDisabled}
            onClick={() => void submit()}
            title={hint || undefined}
            type="button"
          >
            {busy ? "Sending…" : "Submit"}
          </button>
          <p aria-live="polite" className="muted mt-2 text-xs" id="decision-hint">
            {hint}
          </p>
          {error && (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      <dialog aria-labelledby="guidance-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]" ref={guidanceRef}>
        <h2 className="text-[var(--t-lg)]" id="guidance-title">
          Guidance · {queueName}
        </h2>
        {/* WP142 writes the per-queue guidance files; until they exist this
            drawer says so instead of inventing advice. */}
        <p className="muted mt-3 text-sm">No written guidance for this queue yet.</p>
        <div className="mt-6 flex justify-end">
          <button className="btn btn-secondary" onClick={() => guidanceRef.current?.close()} type="button">
            Close
          </button>
        </div>
      </dialog>

      <dialog aria-labelledby="shortcuts-title" className="m-auto w-[min(28rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]" ref={helpRef}>
        <h2 className="text-[var(--t-lg)]" id="shortcuts-title">
          Keyboard shortcuts
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt><span className="a-kbd">1</span>–<span className="a-kbd">9</span></dt>
          <dd>Choose a decision</dd>
          <dt><span className="a-kbd">r</span></dt>
          <dd>Focus the reason</dd>
          <dt><span className="a-kbd">Ctrl</span>/<span className="a-kbd">Cmd</span> + <span className="a-kbd">Enter</span></dt>
          <dd>Submit</dd>
          <dt><span className="a-kbd">s</span></dt>
          <dd>Skip this item</dd>
          <dt><span className="a-kbd">g</span></dt>
          <dd>Open guidance</dd>
          <dt><span className="a-kbd">?</span></dt>
          <dd>This sheet</dd>
          <dt><span className="a-kbd">Esc</span></dt>
          <dd>Close</dd>
        </dl>
        <p className="muted mt-3 text-xs">Shortcuts are off while you type. Ctrl/Cmd + Enter and Esc always work.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            checked={shortcutsOn}
            onChange={(event) => {
              setShortcutsOn(event.target.checked);
              writeShortcutsOn(event.target.checked);
            }}
            type="checkbox"
          />
          Single-key shortcuts on this screen
        </label>
        <div className="mt-6 flex justify-end">
          <button className="btn btn-secondary" onClick={() => helpRef.current?.close()} type="button">
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
