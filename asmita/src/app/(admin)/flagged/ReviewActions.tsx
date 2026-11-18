"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import {
  REJECTION_PRESETS,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  presetText,
  rejectionReasonText,
  type RejectionChoice,
} from "@/lib/rejection-reasons";

interface Props {
  caseId: string;
  urlId: string;
  status: string;
  investigationOnly?: boolean;
}

const ERRORS: Record<string, string> = {
  not_awaiting_review: "Already decided. Reload to see it.",
  unknown_platform_requires_investigation: "Unknown platform: reject or investigate.",
  permission_denied: "Your admin role cannot review links.",
};

// The reasons the survivor reads in her case. Picking one fills the exact
// text sent; "Other" opens a box for a reason written by hand.
export function RejectReasonPicker({
  name,
  choice,
  other,
  onChoice,
  onOther,
}: {
  name: string;
  choice: RejectionChoice | null;
  other: string;
  onChoice: (choice: RejectionChoice) => void;
  onOther: (text: string) => void;
}) {
  const options: { id: RejectionChoice; text: string }[] = [
    ...REJECTION_PRESETS.map((preset) => ({ id: preset.id, text: presetText(preset.id) ?? "" })),
    { id: "other", text: "Other: write the reason" },
  ];
  const otherId = `${name}-other-text`;
  const otherHintId = `${name}-other-hint`;
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold text-[var(--ink)]">Reason the survivor will see</legend>
      <p className="muted mt-0.5 text-xs">Shown in her case, in her language, exactly as chosen.</p>
      <div className="mt-2 grid gap-1.5">
        {options.map((option) => {
          const id = `${name}-${option.id}`;
          const selected = choice === option.id;
          return (
            <label
              key={option.id}
              htmlFor={id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-box)] border px-3 py-2 text-xs leading-[1.5] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)] ${
                selected
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--brand)]"
              }`}
            >
              <input
                checked={selected}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                id={id}
                name={name}
                onChange={() => onChoice(option.id)}
                type="radio"
                value={option.id}
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
      {choice === "other" && (
        <div className="mt-2">
          <label className="sr-only" htmlFor={otherId}>
            Reason for rejecting, shown in the survivor&apos;s case
          </label>
          <textarea
            aria-describedby={otherHintId}
            autoFocus
            className="field min-h-[72px] py-2 text-xs"
            id={otherId}
            maxLength={REJECTION_REASON_MAX}
            minLength={REJECTION_REASON_MIN}
            onChange={(event) => onOther(event.target.value)}
            placeholder="Write it kindly and plainly. No case details or links."
            required
            rows={3}
            value={other}
          />
          <p id={otherHintId} className="muted mt-1 text-[11px] tabular-nums">
            {other.trim().length}/{REJECTION_REASON_MAX} characters, at least {REJECTION_REASON_MIN}
          </p>
        </div>
      )}
    </fieldset>
  );
}

export function ReviewActions({ caseId, urlId, status: rowStatus, investigationOnly = false }: Props) {
  const [status, setStatus] = useState<"idle" | "rejecting" | "loading" | "approved" | "rejected" | "error">(
    rowStatus === "REJECTED" ? "rejected" : "idle",
  );
  const [choice, setChoice] = useState<RejectionChoice | null>(null);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reason = rejectionReasonText(choice, other);

  async function act(decision: "approve" | "reject") {
    if (decision === "reject" && !reason) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/review-queue/${caseId}/${urlId}/${decision}`, {
        method: "POST",
        body: JSON.stringify(decision === "reject" ? { reason } : {}),
      });
      if (res.ok) {
        setStatus(decision === "approve" ? "approved" : "rejected");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(ERRORS[body?.error ?? ""] ?? "Not saved. Reload and try again.");
      setStatus("error");
    } catch {
      setError("Not saved. Reload and try again.");
      setStatus("error");
    }
  }

  if (status === "approved") return <span className="text-xs font-medium text-[var(--brand)]">Approved</span>;
  if (status === "rejected") return <span className="text-xs font-medium text-[var(--danger)]">Rejected</span>;
  if (status === "error") {
    return (
      <span className="text-xs text-[var(--danger)]" role="alert">
        {error}
      </span>
    );
  }

  if (status === "rejecting") {
    return (
      <form
        className="w-full min-w-[15rem] max-w-md space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void act("reject");
        }}
      >
        <RejectReasonPicker
          choice={choice}
          name={`reject-reason-${urlId}`}
          onChoice={setChoice}
          onOther={setOther}
          other={other}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary px-3 py-1 text-xs" disabled={!reason} type="submit">
            Reject
          </button>
          <button
            className="link-underline text-xs"
            onClick={() => {
              setStatus("idle");
              setChoice(null);
              setOther("");
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      {!investigationOnly && (
        <button
          className="btn btn-primary px-3 py-1 text-xs"
          disabled={status === "loading"}
          onClick={() => act("approve")}
          type="button"
        >
          Approve
        </button>
      )}
      {investigationOnly && <span className="text-xs text-[var(--text-muted)]">Investigate reporting route</span>}
      <button
        className="btn btn-secondary px-3 py-1 text-xs"
        disabled={status === "loading"}
        onClick={() => setStatus("rejecting")}
        type="button"
      >
        Reject…
      </button>
    </div>
  );
}
