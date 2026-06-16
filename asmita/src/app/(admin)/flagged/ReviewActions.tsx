"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

interface Props {
  caseId: string;
  urlId: string;
  status: string;
}

export function ReviewActions({ caseId, urlId, status: rowStatus }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "approved" | "rejected" | "error">(
    rowStatus === "NOTICE_QUEUED" ? "approved" : rowStatus === "REJECTED" ? "rejected" : "idle",
  );

  async function act(decision: "approve" | "reject") {
    setStatus("loading");
    try {
      const res = await csrfFetch(
        `/api/admin/review-queue/${caseId}/${urlId}/${decision}`,
        { method: "POST" },
      );
      setStatus(res.ok ? (decision === "approve" ? "approved" : "rejected") : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "approved") return <span className="text-xs font-semibold text-[var(--teal)]">Approved</span>;
  if (status === "rejected") return <span className="text-xs font-semibold text-[var(--rose)]">Rejected</span>;
  if (status === "error") return <span className="text-xs text-[var(--rose)]">Error - reload</span>;

  return (
    <div className="flex gap-2">
      <button
        className="btn btn-primary py-1 px-3 text-xs"
        disabled={status === "loading"}
        onClick={() => act("approve")}
        type="button"
      >
        Approve
      </button>
      <button
        className="btn btn-secondary py-1 px-3 text-xs"
        disabled={status === "loading"}
        onClick={() => act("reject")}
        type="button"
      >
        Reject
      </button>
    </div>
  );
}
