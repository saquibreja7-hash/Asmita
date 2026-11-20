"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FindingLabel } from "@/lib/crawl-findings";
import { LABEL_TEXT, shortDate } from "./finding-view";
import { clearFindingLabel, setFindingLabel, type FindingLabels } from "./findings-client";

// Review labels WP37: set and clear the three analyst labels. "Possible
// minor" is a safety switch — setting it stops the adult flow for the
// finding, and only a second, different admin with a written reason can
// clear it — so both directions of that one ask for confirmation, and the
// clear asks for the reason.

type Row = { findingId: string; labels: FindingLabels; crawlerEnabled: boolean; currentAdminSetMinorLabel: boolean };

const MINOR_SET_COPY = {
  title: "Mark this finding possible minor",
  body:
    "This is the safety switch. Setting it stops the adult flow for this finding at once: it cannot be approved or dismissed, no representative notice can be sent, and it leaves the review queue for the minors protocol. There is no written crawler-minors procedure yet, so also tell the SUPER_ADMIN straight away (ADR 006, go-live gate 3).",
  confirm: "Mark possible minor",
};

const MINOR_CLEAR_COPY = {
  title: "Clear the possible-minor label",
  body:
    "Clearing returns the finding to the adult flow (to review, or to approved if it was approved). You must be a different admin from the one who set the label, and you must record why it is safe to clear.",
  confirm: "Clear possible minor",
};

function setStateLabel(labels: FindingLabels, label: FindingLabel): string {
  const state = labels[label];
  return state.set ? `Set ${state.setAt ? shortDate(state.setAt) : ""} UTC`.trim() : "Not set";
}

export function LabelControls({ findingId, labels, crawlerEnabled, currentAdminSetMinorLabel }: Row) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Mirror of the dialog's open state: reading dialogRef.current during
  // render is not allowed, so the render reads this state and the handlers
  // keep it in step with the element.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<{ label: FindingLabel; action: "set" | "clear" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  function ask(label: FindingLabel, action: "set" | "clear") {
    if (label === "possibleMinor") {
      setPending({ label, action });
      setReason("");
      setError(null);
      setDialogOpen(true);
      dialogRef.current?.showModal();
      return;
    }
    // The two informational labels act at once.
    void act(label, action);
  }

  async function act(label: FindingLabel, action: "set" | "clear") {
    setBusy(true);
    setError(null);
    const result = action === "set" ? await setFindingLabel(findingId, label) : await clearFindingLabel(findingId, label, action === "clear" && label === "possibleMinor" ? reason : undefined);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setDone(`${LABEL_TEXT[label]} ${action === "set" ? "set" : "cleared"}${result.data.changed ? "." : " (it already was)."}`);
    router.refresh();
    return true;
  }

  async function confirmMinor() {
    if (!pending) return;
    const ok = await act(pending.label, pending.action);
    if (ok) dialogRef.current?.close();
  }

  const minorCleared = !labels.possibleMinor.set && labels.possibleMinor.clearedAt !== null;

  return (
    <div className="grid gap-3">
      {crawlerEnabled ? (
        <ul className="grid gap-3 text-sm">
          {(["aiMade", "sexual", "possibleMinor"] as const).map((label) => {
            const isMinor = label === "possibleMinor";
            const set = labels[label].set;
            const blocked = isMinor && set && currentAdminSetMinorLabel;
            return (
              <li className="flex flex-wrap items-center justify-between gap-3" data-label={label} key={label}>
                <div>
                  <p className="font-medium">{LABEL_TEXT[label]}</p>
                  <p className="muted">{setStateLabel(labels, label)}</p>
                  {isMinor && blocked && (
                    <p className="text-xs" data-testid="minor-clear-blocked">
                      You set this label, so another admin must clear it.
                    </p>
                  )}
                  {isMinor && minorCleared && labels.possibleMinor.clearReason && (
                    <p className="muted text-xs">
                      Cleared {shortDate(labels.possibleMinor.clearedAt!)} UTC by a second admin: {labels.possibleMinor.clearReason}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {set ? (
                    <button
                      aria-label={`Clear ${LABEL_TEXT[label]}`}
                      className="btn btn-secondary"
                      data-testid={`clear-${label}`}
                      disabled={busy || blocked}
                      onClick={() => ask(label, "clear")}
                      type="button"
                    >
                      Clear…
                    </button>
                  ) : (
                    <button
                      aria-label={`Set ${LABEL_TEXT[label]}`}
                      className="btn btn-secondary"
                      data-testid={`set-${label}`}
                      disabled={busy}
                      onClick={() => ask(label, "set")}
                      type="button"
                    >
                      Set…
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm" role="status">
          Labels cannot be changed while the crawler is switched off. They stay as they are.
        </p>
      )}
      {done && (
        <p className="text-sm text-[var(--brand)]" role="status">
          {done}
        </p>
      )}
      {error && !dialogOpen && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <dialog
        aria-labelledby="label-dialog-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => {
          setDialogOpen(false);
          setError(null);
        }}
        ref={dialogRef}
      >
        {pending && (
          <>
            <h2 id="label-dialog-title">{pending.action === "set" ? MINOR_SET_COPY.title : MINOR_CLEAR_COPY.title}</h2>
            <p className="mt-3 text-sm">{pending.action === "set" ? MINOR_SET_COPY.body : MINOR_CLEAR_COPY.body}</p>
            {pending.action === "clear" && (
              <label className="mt-4 grid gap-1 text-sm" htmlFor="minor-clear-reason">
                <span>Reason (required)</span>
                <textarea
                  className="field"
                  id="minor-clear-reason"
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  value={reason}
                />
              </label>
            )}
            {error && (
              <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || (pending.action === "clear" && reason.trim() === "")} onClick={confirmMinor} type="button">
                {busy ? "Saving…" : pending.action === "set" ? MINOR_SET_COPY.confirm : MINOR_CLEAR_COPY.confirm}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
