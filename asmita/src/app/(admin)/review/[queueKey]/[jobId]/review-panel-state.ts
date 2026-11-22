/*
 * The decision panel's state rules (review-console-spec.md WP141), pure so
 * every state can be tested without a browser. The panel renders what this
 * computes; the server enforces the same rules again in decideJob, so the
 * disabled button is guidance, never the gate.
 */

export type PanelDecision = { code: string; label: string; reasonKind: "approve" | "reject" | null };

export type PanelStateInput = {
  decisions: ReadonlyArray<PanelDecision>;
  decision: string | null;
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
  submitDisabled: boolean;
  /** Why Submit is disabled, shown as text and as the button's tooltip. */
  hint: string;
};

export function panelState(input: PanelStateInput): PanelState {
  const chosen = input.decisions.find((entry) => entry.code === input.decision) ?? null;
  const reasonRequired = Boolean(
    chosen &&
      ((chosen.reasonKind === "reject" && input.requireReasonOnReject) ||
        (chosen.reasonKind === "approve" && input.requireReasonOnApprove)),
  );
  const reasonMet = !reasonRequired || input.note.trim().length > 0;
  const submitDisabled = !chosen || !reasonMet || input.busy || input.lost || !input.canDecide;
  const hint = input.lost
    ? ""
    : !input.canDecide
      ? "Your admin role cannot decide items in this queue."
      : !chosen
        ? "Choose a decision"
        : !reasonMet
          ? "Choose a reason"
          : "";
  return { reasonRequired, reasonMet, submitDisabled, hint };
}
