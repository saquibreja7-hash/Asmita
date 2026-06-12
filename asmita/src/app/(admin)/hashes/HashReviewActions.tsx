"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

export default function HashReviewActions({ hashId }: { hashId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function act(decision: "approve" | "reject") {
    if (decision === "reject") {
      const confirmed = window.confirm("Reject this hash submission?");
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/hashes/${hashId}/${decision}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `status_${response.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn-primary px-3 py-1 text-xs"
        disabled={busy}
        onClick={() => act("approve")}
      >
        Approve
      </button>
      <button
        type="button"
        className="btn px-3 py-1 text-xs"
        disabled={busy}
        onClick={() => act("reject")}
      >
        Reject
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
