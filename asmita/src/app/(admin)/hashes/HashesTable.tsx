"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStepUpPost, type StepUpPostResult } from "../step-up-mfa";
import HashReviewActions from "./HashReviewActions";

/*
 * The Fingerprints queue's table (WP145): the page's own columns plus the
 * console's bulk bar. Every bulk decision opens a confirm step that states
 * the exact count and the decision; above ten items the operator types the
 * count, and the server refuses a mismatch. Each item still goes through
 * the same review as its single button — nothing here sends anything new.
 */

const MAX = 50;
const TYPE_ABOVE = 10;

const ERRORS: Record<string, string> = {
  hash_submission_already_reviewed: "already decided",
  hash_submission_not_found: "not found",
  hash_upload_disabled: "fingerprint intake is off",
};

export type HashesRowView = {
  id: string;
  referenceNumber: string;
  digestText: string;
  quality: number;
  platformName: string | null;
  flagReason: string | null;
  ageText: string;
};

type Result = { hashId: string; ok: boolean; error?: string };

export function HashesTable({ rows, canReview }: { rows: HashesRowView[]; canReview: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [typedCount, setTypedCount] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // WP144/WP145: a bulk decision over 10 items needs a fresh authenticator
  // code; the shared hook answers that refusal with a code dialog.
  const { post, stepUpDialog } = useStepUpPost();

  const choosable = useMemo(() => rows.slice(0, MAX), [rows]);
  const allChosen = choosable.length > 0 && choosable.every((row) => selected.has(row.id));
  const needsTyping = selected.size > TYPE_ABOVE;
  const typedOk = !needsTyping || typedCount.trim() === String(selected.size);

  function toggle(hashId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(hashId)) next.delete(hashId);
      else if (next.size < MAX) next.add(hashId);
      return next;
    });
  }

  function openConfirm(decision: "approve" | "reject") {
    setConfirming(decision);
    setTypedCount("");
    setError(null);
    setTimeout(() => {
      if (needsTyping) countRef.current?.focus();
      else confirmRef.current?.focus();
    }, 0);
  }

  async function run(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    setResults(null);
    const outcome: StepUpPostResult = await post("/api/admin/bulk/fingerprints", {
      decision,
      hashIds: Array.from(selected),
      // WP145: the confirmed count names exactly what will be decided.
      confirmedCount: selected.size,
    });
    setBusy(false);
    if (!outcome.ok) {
      const body = outcome.body as { results?: Result[] } | undefined;
      if (body?.results) setResults(body.results);
      setError(
        outcome.error === "mfa_step_up_required"
          ? "Nothing was changed: a bulk decision over 10 items needs a fresh authenticator code."
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
    setSelected(new Set(body.results.filter((result) => !result.ok).map((result) => result.hashId)));
    setConfirming(null);
    setTypedCount("");
    router.refresh();
  }

  const decisionText =
    confirming === "approve"
      ? selected.size === 1
        ? "approve 1 fingerprint"
        : `approve ${selected.size} fingerprints`
      : selected.size === 1
        ? "reject 1 fingerprint"
        : `reject ${selected.size} fingerprints`;

  return (
    <>
      {canReview && selected.size > 0 && (
        <div
          aria-label="Bulk actions"
          className="sticky top-2 z-10 mt-6 rounded-[var(--radius-box)] border border-[var(--ink)] bg-[var(--page)] p-3 text-sm"
          role="region"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">{selected.size} selected</span>
            {confirming === null ? (
              <>
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
                <p className="muted self-end text-xs">
                  The single Reject button takes no reason, and neither does this one; each fingerprint is
                  rejected on its own row.
                </p>
              )}
              <button
                className="btn btn-primary self-end px-3 py-1 text-xs"
                disabled={busy || !typedOk}
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
                <li className="text-[var(--danger)]" key={result.hashId}>
                  {result.hashId}: {ERRORS[result.error ?? ""] ?? result.error}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-6 overflow-x-auto a-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Fingerprints awaiting review, oldest first</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              {canReview && (
                <th className="p-4" scope="col">
                  <input
                    aria-label={allChosen ? "Clear selection" : `Select the first ${choosable.length} fingerprints`}
                    checked={allChosen}
                    disabled={choosable.length === 0}
                    onChange={() => setSelected(allChosen ? new Set() : new Set(choosable.map((row) => row.id)))}
                    type="checkbox"
                  />
                </th>
              )}
              {["Case", "Fingerprint", "Quality", "Platform", "Flags", "Age", "Actions"].map((heading) => (
                <th className="eyebrow p-4" key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--line)]" key={row.id}>
                {canReview && (
                  <td className="p-4">
                    <input
                      aria-label={`Select the fingerprint in ${row.referenceNumber}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      type="checkbox"
                    />
                  </td>
                )}
                <td className="font-mono p-4">{row.referenceNumber}</td>
                <td className="font-mono p-4 text-[var(--text-muted)]">{row.digestText}</td>
                <td className="p-4 tabular-nums">{row.quality}/100</td>
                <td className="p-4">{row.platformName ?? <span className="text-[var(--text-muted)]">-</span>}</td>
                <td className="p-4">{row.flagReason ?? "-"}</td>
                <td className="font-mono p-4 tabular-nums">{row.ageText}</td>
                <td className="p-4">
                  <HashReviewActions hashId={row.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted p-6 text-center text-sm">No hash submissions awaiting review.</p>}
      </div>
      {stepUpDialog}
    </>
  );
}
