"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AdminCaseDetail } from "@/lib/admin-cases";
import { ReviewActions } from "../flagged/ReviewActions";
import {
  LADDER_BLOCK_LABELS,
  LADDER_STEP_LABELS,
  LINK_STATUS_LABELS,
  REPLY_LABELS,
  STATUS_LABELS,
  dueText,
  formatIst,
  nextActionLabel,
} from "./case-format";

// JSON turns the due date into a string.
type Detail = Omit<AdminCaseDetail, "work"> & {
  work: Omit<AdminCaseDetail["work"], "dueAt"> & { dueAt: string | null };
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; detail: Detail; canReview: boolean };

/**
 * A non-modal side panel: the list stays usable, j and k move it from case to
 * case, Esc closes it and returns focus to the row. Quick review only;
 * sending, replies and reveals stay on the full case page.
 */
export function CasePeek({
  reference,
  onClose,
  panelRef,
}: {
  reference: string;
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = "case-peek-title";

  useEffect(() => {
    // The parent keys this panel by reference, so each case starts loading.
    const controller = new AbortController();
    fetch(`/api/admin/cases/${encodeURIComponent(reference)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { detail?: Detail; canReview?: boolean; error?: string }
          | null;
        if (!response.ok || !body?.detail) {
          setState({ kind: "error", message: body?.error === "case_not_found" ? "This case no longer exists." : "Could not load this case. Nothing has changed." });
          return;
        }
        setState({ kind: "ready", detail: body.detail, canReview: Boolean(body.canReview) });
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") {
          setState({ kind: "error", message: "Could not load this case. Nothing has changed." });
        }
      });
    return () => controller.abort();
  }, [reference]);

  useEffect(() => {
    // Focus moves into the panel when it opens, so screen readers announce it.
    if (!panelRef.current?.contains(document.activeElement)) headingRef.current?.focus();
  }, [reference, panelRef]);

  return (
    <aside
      aria-labelledby={titleId}
      className="fixed inset-0 z-30 overflow-y-auto border-l border-[var(--line)] bg-[var(--page)] p-6 shadow-xl md:inset-y-0 md:left-auto md:right-0 md:w-[min(34rem,45vw)]"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="page-title-sm font-mono text-xl outline-none" id={titleId} ref={headingRef} tabIndex={-1}>
          {reference}
        </h2>
        <button aria-label="Close preview" className="link-underline text-sm" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {state.kind === "loading" && (
        <div aria-busy="true" aria-live="polite" className="mt-6 grid gap-3">
          <span className="sr-only">Loading the case</span>
          {[0, 1, 2, 3].map((index) => (
            <div className="h-5 animate-pulse rounded bg-[var(--line)] motion-reduce:animate-none" key={index} />
          ))}
        </div>
      )}

      {state.kind === "error" && (
        <p className="mt-6 text-sm text-[var(--danger)]" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && <PeekBody canReview={state.canReview} detail={state.detail} />}
    </aside>
  );
}

function PeekBody({ detail, canReview }: { detail: Detail; canReview: boolean }) {
  const now = new Date();
  const due = dueText(detail.work.nextAction, detail.work.dueAt ? new Date(detail.work.dueAt) : null, now);
  const fingerprintCounts = detail.fingerprints.reduce<Record<string, number>>((counts, hash) => {
    counts[hash.status] = (counts[hash.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="mt-4 grid gap-6 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Fact label="Status">{STATUS_LABELS[detail.status] ?? detail.status}</Fact>
        <Fact label="Next action">{nextActionLabel(detail.work.nextAction, detail.work.actionCount)}</Fact>
        <Fact label="Due">
          <span className={due.overdue ? "text-[var(--danger)]" : undefined}>
            {due.overdue && <span aria-hidden="true">! </span>}
            {due.text}
          </span>
        </Fact>
        <Fact label="Created">{formatIst(detail.createdAt)}</Fact>
      </dl>

      <section>
        <h3 className="eyebrow">Links</h3>
        <ul className="mt-2 grid gap-3">
          {detail.links.map((link, index) => {
            const needsReview = link.status === "PENDING_REVIEW" || (link.flaggedForReview && link.status !== "REJECTED");
            const statusLabel =
              link.noticeSent && link.status === "NOTICE_QUEUED"
                ? LINK_STATUS_LABELS.NOTICE_SENT
                : (LINK_STATUS_LABELS[link.status] ?? link.status);
            return (
              <li className="rounded border border-[var(--line)] p-3" key={link.id}>
                <p>
                  <span className="muted">Link {index + 1}</span> <span className="font-mono">{link.domain}</span> ·{" "}
                  {link.platformName}
                </p>
                <p className="mt-1">
                  {statusLabel}
                  {link.status !== "REMOVED" && link.ladderStep
                    ? ` · step ${link.ladderStep}, ${LADDER_STEP_LABELS[link.ladderStep - 1].toLowerCase()}`
                    : ""}
                  {link.reply?.responseType ? ` · reply: ${REPLY_LABELS[link.reply.responseType] ?? link.reply.responseType}` : ""}
                </p>
                {link.flagReason && <p className="muted mt-1 text-xs">Flag: {link.flagReason}</p>}
                {link.ladderBlock && (
                  <p className="mt-1 text-xs text-[var(--danger)]">
                    <span aria-hidden="true">! </span>
                    Escalation blocked: {LADDER_BLOCK_LABELS[link.ladderBlock] ?? link.ladderBlock}
                  </p>
                )}
                {canReview && needsReview && (
                  <div className="mt-2">
                    <ReviewActions caseId={detail.caseId} status={link.status} urlId={link.id} />
                  </div>
                )}
              </li>
            );
          })}
          {detail.links.length === 0 && <li className="muted">No links.</li>}
        </ul>
      </section>

      {detail.fingerprints.length > 0 && (
        <section>
          <h3 className="eyebrow">Fingerprints</h3>
          <p className="mt-2">
            {Object.entries(fingerprintCounts)
              .map(([status, count]) => `${count} ${status.replace("_", " ").toLowerCase()}`)
              .join(", ")}
          </p>
        </section>
      )}

      {detail.timeline.length > 0 && (
        <section>
          <h3 className="eyebrow">Latest events</h3>
          <ol className="mt-2 grid gap-1">
            {detail.timeline.slice(0, 5).map((event) => (
              <li key={event.sequence}>
                <span className="muted tabular-nums">{formatIst(event.createdAt)}</span>{" "}
                {event.eventType.replaceAll("_", " ").toLowerCase()}
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link className="btn btn-secondary justify-self-start" href={`/admin/cases/${detail.referenceNumber}`}>
        Open the full case
      </Link>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
