"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

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

export function ReviewActions({ caseId, urlId, status: rowStatus, investigationOnly = false }: Props) {
  const [status, setStatus] = useState<"idle" | "rejecting" | "loading" | "approved" | "rejected" | "error">(
    rowStatus === "REJECTED" ? "rejected" : "idle",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(decision: "approve" | "reject") {
    setStatus("loading");
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/review-queue/${caseId}/${urlId}/${decision}`, {
        method: "POST",
        body: JSON.stringify(decision === "reject" ? { reason: reason.trim() } : {}),
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
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void act("reject");
        }}
      >
        <label className="sr-only" htmlFor={`reject-reason-${urlId}`}>
          Reason for rejecting, shown in the survivor&apos;s case
        </label>
        <input
          autoFocus
          className="field py-1 text-xs"
          id={`reject-reason-${urlId}`}
          maxLength={500}
          minLength={3}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason the survivor will see"
          required
          value={reason}
        />
        <button className="btn btn-primary px-3 py-1 text-xs" disabled={reason.trim().length < 3} type="submit">
          Reject
        </button>
        <button className="link-underline text-xs" onClick={() => setStatus("idle")} type="button">
          Cancel
        </button>
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
