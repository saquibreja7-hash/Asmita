"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { AdminUrlReviewRow } from "@/lib/admin-cases";
import { ReviewActions } from "./ReviewActions";

const MAX = 50;

const ERRORS: Record<string, string> = {
  not_awaiting_review: "already decided",
  unknown_platform_requires_investigation: "unknown platform, can only be rejected",
  url_not_found: "not found",
};

type Result = { urlId: string; ok: boolean; error?: string };

function selectable(row: AdminUrlReviewRow) {
  return row.status === "PENDING_REVIEW" || row.status === "NOTICE_QUEUED";
}

export function FlaggedTable({ rows, canReview }: { rows: AdminUrlReviewRow[]; canReview: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const choosable = useMemo(() => rows.filter(selectable).slice(0, MAX), [rows]);
  const referenceOf = useMemo(() => new Map(rows.map((row) => [row.urlId, row.referenceNumber])), [rows]);
  const allChosen = choosable.length > 0 && choosable.every((row) => selected.has(row.urlId));
  const investigationSelected = rows.filter((row) => selected.has(row.urlId) && row.investigationOnly).length;

  function toggle(urlId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(urlId)) next.delete(urlId);
      else if (next.size < MAX) next.add(urlId);
      return next;
    });
  }

  async function run(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await csrfFetch("/api/admin/bulk/links", {
        method: "POST",
        body: JSON.stringify({
          decision,
          urlIds: Array.from(selected),
          ...(decision === "reject" ? { reason } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as { results?: Result[]; error?: string } | null;
      if (!response.ok || !body?.results) {
        setError(body?.error === "reason_required" ? "Give a reason of at least 3 characters." : "Nothing was changed: the request failed.");
        return;
      }
      setResults(body.results);
      setSelected(new Set(body.results.filter((result) => !result.ok).map((result) => result.urlId)));
      setRejecting(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Nothing was changed: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canReview && selected.size > 0 && (
        <div
          aria-label="Bulk actions"
          className="sticky top-2 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-box)] border border-[var(--ink)] bg-[var(--page)] p-3 text-sm"
          role="region"
        >
          <span className="tabular-nums">
            {selected.size} selected
            {investigationSelected > 0 && ` (${investigationSelected} on unknown platforms, reject only)`}
          </span>
          {!rejecting ? (
            <>
              <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => run("approve")} type="button">
                Approve {selected.size}
              </button>
              <button
                className="btn btn-secondary px-3 py-1 text-xs"
                disabled={busy}
                onClick={() => {
                  setRejecting(true);
                  setTimeout(() => reasonRef.current?.focus(), 0);
                }}
                type="button"
              >
                Reject {selected.size}…
              </button>
            </>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run("reject");
              }}
            >
              <label className="sr-only" htmlFor="bulk-reject-reason">
                Reason for rejecting, shown in the survivor&apos;s case
              </label>
              <input
                className="field py-1 text-sm"
                id="bulk-reject-reason"
                maxLength={500}
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason the survivor will see"
                ref={reasonRef}
                required
                value={reason}
              />
              <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy || reason.trim().length < 3} type="submit">
                Reject {selected.size}
              </button>
              <button className="link-underline text-xs" onClick={() => setRejecting(false)} type="button">
                Cancel
              </button>
            </form>
          )}
          <button className="link-underline ml-auto text-xs" onClick={() => setSelected(new Set())} type="button">
            Clear
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {results && (
        <div aria-live="polite" className="mt-4 text-sm" role="status">
          <p>
            {results.filter((result) => result.ok).length} done
            {results.some((result) => !result.ok) && `, ${results.filter((result) => !result.ok).length} not changed (still selected):`}
          </p>
          <ul className="mt-1 grid gap-1">
            {results
              .filter((result) => !result.ok)
              .map((result) => (
                <li className="text-[var(--danger)]" key={result.urlId}>
                  {referenceOf.get(result.urlId) ?? result.urlId}: {ERRORS[result.error ?? ""] ?? result.error}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-6 overflow-x-auto a-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Flagged links, oldest first</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              {canReview && (
                <th className="p-4" scope="col">
                  <input
                    aria-label={allChosen ? "Clear selection" : `Select the first ${choosable.length} links waiting for review`}
                    checked={allChosen}
                    disabled={choosable.length === 0}
                    onChange={() => setSelected(allChosen ? new Set() : new Set(choosable.map((row) => row.urlId)))}
                    type="checkbox"
                  />
                </th>
              )}
              {["Case", "Platform", "Domain", "Reason", "Age", "Status", "Actions"].map((heading) => (
                <th className="eyebrow p-4" key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--line)]" key={`${row.caseId}-${row.urlId}`}>
                {canReview && (
                  <td className="p-4">
                    {selectable(row) && (
                      <input
                        aria-label={`Select the ${row.domain} link in ${row.referenceNumber}`}
                        checked={selected.has(row.urlId)}
                        onChange={() => toggle(row.urlId)}
                        type="checkbox"
                      />
                    )}
                  </td>
                )}
                <td className="a-nowrap">
                  <Link className="link-underline font-mono" href={`/admin/cases/${row.referenceNumber}`}>
                    {row.referenceNumber}
                  </Link>
                </td>
                <td className="p-4">{row.platformName}</td>
                <td className="font-mono p-4 text-[var(--text-muted)]">{row.domain}</td>
                <td className="p-4">{row.reason}</td>
                <td className="a-nowrap tabular-nums">
                  {Math.floor(row.ageMinutes / 60)}h {row.ageMinutes % 60}m
                </td>
                <td className={`a-nowrap ${row.slaState === "breached" ? "font-semibold text-[var(--danger)]" : ""}`}>
                  {row.slaState === "breached" && <span aria-hidden="true">! </span>}
                  {row.slaState.replaceAll("_", " ")}
                </td>
                <td className="p-4">
                  {canReview ? (
                    <ReviewActions
                      caseId={row.caseId}
                      investigationOnly={row.investigationOnly}
                      status={row.status}
                      urlId={row.urlId}
                    />
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted p-6 text-center text-sm">No flagged submissions in the queue.</p>}
      </div>
    </>
  );
}
