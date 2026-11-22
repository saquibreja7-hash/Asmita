"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStepUpPost, type StepUpPostResult } from "../step-up-mfa";
import type { AdminUrlReviewRow } from "@/lib/admin-cases";
import { ReviewActions } from "./ReviewActions";

const MAX = 50;
// WP145 bulk safety: above this many items the operator types the exact
// count before the decision runs.
const TYPE_ABOVE = 10;

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
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [typedCount, setTypedCount] = useState("");
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // WP144: a bulk decision over 10 items needs a fresh authenticator code;
  // the shared hook answers that refusal with a code dialog and retries.
  const { post, stepUpDialog } = useStepUpPost();

  const choosable = useMemo(() => rows.filter(selectable).slice(0, MAX), [rows]);
  const referenceOf = useMemo(() => new Map(rows.map((row) => [row.urlId, row.referenceNumber])), [rows]);
  const allChosen = choosable.length > 0 && choosable.every((row) => selected.has(row.urlId));
  const investigationSelected = rows.filter((row) => selected.has(row.urlId) && row.investigationOnly).length;
  // WP145 bulk safety: above ten items the operator types the exact count
  // before the decision runs; the server refuses a mismatch.
  const needsTyping = selected.size > TYPE_ABOVE;
  const typedOk = !needsTyping || typedCount.trim() === String(selected.size);

  function toggle(urlId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(urlId)) next.delete(urlId);
      else if (next.size < MAX) next.add(urlId);
      return next;
    });
  }

  function openConfirm(decision: "approve" | "reject") {
    setConfirming(decision);
    setTypedCount("");
    setError(null);
    setTimeout(() => {
      if (needsTyping) countRef.current?.focus();
      else if (decision === "reject") reasonRef.current?.focus();
      else confirmRef.current?.focus();
    }, 0);
  }

  async function run(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    setResults(null);
    const outcome: StepUpPostResult = await post("/api/admin/bulk/links", {
      decision,
      urlIds: Array.from(selected),
      // WP145: the confirmed count names exactly what will be decided.
      confirmedCount: selected.size,
      ...(decision === "reject" ? { reason } : {}),
    });
    setBusy(false);
    if (!outcome.ok) {
      const body = outcome.body as { results?: Result[] } | undefined;
      if (body?.results) setResults(body.results);
      setError(
        outcome.error === "mfa_step_up_required"
          ? "Nothing was changed: a bulk decision over 10 items needs a fresh authenticator code."
          : outcome.error === "reason_required"
            ? "Give a reason of at least 3 characters."
            : outcome.error === "count_not_confirmed"
              ? "Nothing was changed: type the exact count to confirm."
              : "Nothing was changed: the request failed.",
      );
      return;
    }
    const body = outcome.body as { results?: Result[] } | undefined;
    if (!body?.results) {
      setError("Nothing was changed: the request failed.");
      return;
    }
    setResults(body.results);
    setSelected(new Set(body.results.filter((result) => !result.ok).map((result) => result.urlId)));
    setConfirming(null);
    setTypedCount("");
    setReason("");
    router.refresh();
  }

  const decisionText =
    confirming === "approve"
      ? selected.size === 1
        ? "approve 1 link"
        : `approve ${selected.size} links`
      : selected.size === 1
        ? "reject 1 link"
        : `reject ${selected.size} links`;

  return (
    <>
      {canReview && selected.size > 0 && (
        <div
          aria-label="Bulk actions"
          className="sticky top-2 z-10 mt-6 rounded-[var(--radius-box)] border border-[var(--ink)] bg-[var(--page)] p-3 text-sm"
          role="region"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">
              {selected.size} selected
              {investigationSelected > 0 && ` (${investigationSelected} on unknown platforms, reject only)`}
            </span>
            {confirming === null ? (
              <>
                {/* WP145: a bulk decision opens a confirm step that states
                    the exact count and the decision, never a one-click run. */}
                <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => openConfirm("approve")} type="button">
                  Approve {selected.size}…
                </button>
                <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => openConfirm("reject")} type="button">
                  Reject {selected.size}…
                </button>
              </>
            ) : (
              <span className="font-medium">{`You are about to ${decisionText}.`}</span>
            )}
            <button
              className="link-underline ml-auto text-xs"
              onClick={() => {
                setSelected(new Set());
                setConfirming(null);
                setTypedCount("");
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          {confirming !== null && (
            <form
              className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 md:grid-cols-[auto_1fr_auto_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                void run(confirming);
              }}
            >
              {needsTyping && (
                <label className="grid gap-1 text-xs">
                  <span className="eyebrow">Type {selected.size} to confirm</span>
                  <input
                    aria-label={`Type ${selected.size} to confirm`}
                    className="field py-1 text-sm"
                    inputMode="numeric"
                    onChange={(event) => setTypedCount(event.target.value)}
                    placeholder={String(selected.size)}
                    ref={countRef}
                    value={typedCount}
                  />
                </label>
              )}
              {confirming === "reject" && (
                <label className="grid gap-1 text-xs">
                  <span className="eyebrow">Reason for rejecting, shown in the survivor&apos;s case</span>
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
                </label>
              )}
              <button
                className="btn btn-primary self-end px-3 py-1 text-xs"
                disabled={busy || !typedOk || (confirming === "reject" && reason.trim().length < 3)}
                ref={confirmRef}
                type="submit"
              >
                {`Confirm: ${decisionText}`}
              </button>
              <button
                className="link-underline self-end text-xs"
                onClick={() => {
                  setConfirming(null);
                  setTypedCount("");
                }}
                type="button"
              >
                Cancel
              </button>
            </form>
          )}
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
      {stepUpDialog}
    </>
  );
}
