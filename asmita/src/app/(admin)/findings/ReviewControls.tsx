"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reviewFinding } from "./findings-client";

type Decision = "approve" | "dismiss";

const COPY: Record<Decision, { title: string; body: string; confirm: string }> = {
  approve: {
    title: "Approve this finding",
    body: "You are confirming, after your own check, that this is a copy of the survivor's image. Approval adds the page address to the survivor's case. Nothing is sent to a platform until a notice is previewed and sent.",
    confirm: "Approve finding",
  },
  dismiss: {
    title: "Dismiss this finding",
    body: "You are recording that this is not a copy of the survivor's image. It will not be added to the case.",
    confirm: "Dismiss finding",
  },
};

export function ReviewControls({
  findingId,
  reviewStatus,
  needsSecondReview,
  awaitingSecondReview,
  distance,
  currentAdminGaveFirstReview = false,
  crawlerEnabled = true,
  possibleMinorLabel = false,
}: {
  findingId: string;
  reviewStatus: "CANDIDATE" | "APPROVED" | "DISMISSED" | "MINOR_PROTOCOL";
  needsSecondReview: boolean;
  awaitingSecondReview: boolean;
  /** Null for an SSCD finding: the second layer has no PDQ distance (ADR 008). */
  distance: number | null;
  /** From the server: whether the admin viewing gave the first review. */
  currentAdminGaveFirstReview?: boolean;
  crawlerEnabled?: boolean;
  /** The possible-minor label is set (review labels WP37): the adult flow is stopped. */
  possibleMinorLabel?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [decision, setDecision] = useState<Decision>("approve");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();
  // Why two reviewers: a distance above the limit, or an SSCD match — the
  // second layer always starts strict (ADR 008, WP28).
  const secondReviewWhy =
    distance === null
      ? "An SSCD match has no hash distance, so it always needs two different reviewers"
      : `Distance ${distance} is above the limit for one reviewer`;

  function ask(next: Decision) {
    setDecision(next);
    setError(null);
    dialogRef.current?.showModal();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await reviewFinding(findingId, decision);
    setBusy(false);
    if (!result.ok) {
      // Keep the dialog open so the sentence is read next to the choice.
      setError(result.message);
      return;
    }
    dialogRef.current?.close();
    setDone(
      result.data.status === "APPROVED"
        ? "Approved and added to the case."
        : result.data.status === "AWAITING_SECOND_REVIEW"
          ? "Your approval is recorded. A second, different reviewer must now approve it."
          : "Dismissed.",
    );
    router.refresh();
  }

  // The safety switch first: while the possible-minor label is set, no
  // adult-flow action is offered at all, whatever the review status.
  if (possibleMinorLabel || reviewStatus === "MINOR_PROTOCOL") {
    return (
      <p className="text-sm" data-testid="minor-protocol-note" role="status">
        This finding is marked possible minor. The adult flow is stopped: it cannot be approved or dismissed and no
        representative notice can be sent. It sits in the minors protocol for crawler findings; a second, different
        admin must clear the label with a reason before review can resume.
      </p>
    );
  }

  if (reviewStatus !== "CANDIDATE") {
    return (
      <p className="text-sm" role="status">
        {reviewStatus === "APPROVED" ? "Approved." : "Dismissed."}
      </p>
    );
  }

  if (!crawlerEnabled) {
    return (
      <p className="text-sm" role="status">
        Not reviewed yet. Reviewing is unavailable while the crawler is switched off.
      </p>
    );
  }

  if (awaitingSecondReview && currentAdminGaveFirstReview) {
    return (
      <p className="text-sm" data-testid="second-review-note" role="status">
        You gave the first approval. {secondReviewWhy}, so a second, different admin
        must approve or dismiss it.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {needsSecondReview && (
        <p className="text-sm" data-testid="second-review-note">
          {awaitingSecondReview
            ? `${secondReviewWhy}. A first reviewer has approved. A second, different admin must approve it. If you gave the first review, you cannot give the second.`
            : `${secondReviewWhy}. Approval needs two different admins: you give the first, someone else the second.`}
        </p>
      )}
      {done && (
        <p className="text-sm text-[var(--brand)]" role="status">
          {done}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" onClick={() => ask("approve")} type="button">
          {awaitingSecondReview ? "Give second approval…" : "Approve…"}
        </button>
        <button className="btn btn-secondary" onClick={() => ask("dismiss")} type="button">
          Dismiss…
        </button>
      </div>
      <dialog
        aria-labelledby="review-dialog-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setError(null)}
        ref={dialogRef}
      >
        <h2 id="review-dialog-title">{COPY[decision].title}</h2>
        <p className="mt-3 text-sm">{COPY[decision].body}</p>
        {error && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={confirm} type="button">
            {busy ? "Saving…" : COPY[decision].confirm}
          </button>
        </div>
      </dialog>
    </div>
  );
}
