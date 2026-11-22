import { reasonRequiresNote } from "@/lib/review-reason-seeds";

/*
 * The decision panel's state rules (review-console-spec.md WP141 + WP142),
 * pure so every state can be tested without a browser. The panel renders
 * what this computes; the server enforces the same rules again in
 * decideJob, so the disabled button is guidance, never the gate.
 *
 * WP142 adds the reason picker: each decision may offer the queue's active
 * reasons, and "Other (explain)" carries its explanation in the note. A
 * decision without offered reasons keeps the WP141 note-only flow: the note
 * is the reason.
 */

export type PanelDecision = { code: string; label: string; reasonKind: "approve" | "reject" | null };

/** One pickable reason of the chosen decision. */
export type PanelReason = { code: string; label: string };

export type PanelStateInput = {
  decisions: ReadonlyArray<PanelDecision>;
  decision: string | null;
  /** The chosen reason's code, when one was picked. */
  reasonCode: string | null;
  /** The active reasons on offer, keyed by decision code. */
  reasons: Record<string, ReadonlyArray<PanelReason>>;
  note: string;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
  canDecide: boolean;
  lost: boolean;
  busy: boolean;
};

export type PanelState = {
  /** Whether the chosen decision needs a reason under the queue's flags. */
  reasonRequired: boolean;
  reasonMet: boolean;
  /** Whether the chosen reason requires a note ("Other (explain)"). */
  noteRequired: boolean;
  noteMet: boolean;
  submitDisabled: boolean;
  /** Why Submit is disabled, shown as text and as the button's tooltip. */
  hint: string;
};

export function panelState(input: PanelStateInput): PanelState {
  const chosen = input.decisions.find((entry) => entry.code === input.decision) ?? null;
  const offered = chosen ? (input.reasons[chosen.code] ?? []) : [];
  const picked = offered.find((entry) => entry.code === input.reasonCode) ?? null;
  const reasonRequired = Boolean(
    chosen &&
      ((chosen.reasonKind === "reject" && input.requireReasonOnReject) ||
        (chosen.reasonKind === "approve" && input.requireReasonOnApprove)),
  );
  const reasonMet = !reasonRequired || picked !== null || input.note.trim().length > 0;
  const noteRequired = picked !== null && reasonRequiresNote(picked.code);
  const noteMet = !noteRequired || input.note.trim().length > 0;
  const submitDisabled = !chosen || !reasonMet || !noteMet || input.busy || input.lost || !input.canDecide;
  const hint = input.lost
    ? ""
    : !input.canDecide
      ? "Your admin role cannot decide items in this queue."
      : !chosen
        ? "Choose a decision"
        : !reasonMet
          ? "Choose a reason"
          : !noteMet
            ? "Explain this reason in the note"
            : "";
  return { reasonRequired, reasonMet, noteRequired, noteMet, submitDisabled, hint };
}
