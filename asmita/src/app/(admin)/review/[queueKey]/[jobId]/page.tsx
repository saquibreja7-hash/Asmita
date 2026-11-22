import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { getReviewAdapter, type ReviewAdapterDecision } from "@/lib/review-adapters";
import { canSeeReviewQueue, getReviewJobWithQueue } from "@/lib/review-jobs";
import { routingExplanationForJob } from "@/lib/review-routing";
import { listReviewReasons } from "@/lib/review-reasons";
import { guidanceHtmlForQueue } from "@/lib/review-guidance";
import { listCaseNotes } from "@/lib/case-notes";
import {
  caseReferenceFor,
  caseTimelineFor,
  claimHeldBy,
  countPendingJobsForQueue,
  listCaseDecisions,
  listOtherOpenJobsForCase,
} from "@/lib/review-views";
import { recordAdminAccess } from "@/lib/admin-access-log";
import { CaseTimeline } from "@/app/(admin)/cases/[reference]/CaseTimeline";
import { formatIst } from "@/app/(admin)/cases/case-format";
import { RevealAddress } from "@/app/(admin)/findings/RevealAddress";
import { CaseNotes } from "@/app/(admin)/cases/[reference]/CaseNotes";
import { describeReviewSubject } from "../../subject-view";
import { DecisionPanel } from "./DecisionPanel";

export const dynamic = "force-dynamic";

// The review screen (review-console-spec.md, WP141): the item on the left,
// in the words its own page uses, with its case context under it, and the
// sticky decision panel on the right. Nothing here decides anything the
// existing functions do not already decide — the panel only calls their
// routes — and no address is shown: a finding's address stays behind the
// existing reasoned, logged Reveal.
const NOTED_MESSAGES: Record<string, string> = {
  AWAITING_SECOND_REVIEW: "First review recorded — waiting for a second reviewer.",
  CONTACTED: "Marked contacted.",
};

export default async function ReviewJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ queueKey: string; jobId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  const { queueKey, jobId } = await params;
  const loaded = await getReviewJobWithQueue(jobId);
  if (!loaded) notFound();
  const { job, queue } = loaded;

  // A job the sync moved to another queue keeps its own URL shape.
  if (queue.key !== queueKey) redirect(`/admin/review/${queue.key}/${job.id}`);

  if (!canSeeReviewQueue(auth.session.adminRole, queue)) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot review this queue.</p>
      </section>
    );
  }
  // Decided while it was open: straight to the next one.
  if (job.status !== "PENDING") redirect(`/admin/review/${queue.key}`);

  const now = new Date();
  const held = claimHeldBy(job, auth.session.emailHash, now);
  const expired = !held && job.claimedBy === auth.session.emailHash;
  const lostMessage = held
    ? ""
    : job.claimedBy === null
      ? "Nobody holds this item yet. Start reviewing to take it."
      : expired
        ? "Your hold on this item ended."
        : "Someone else has this now";

  const adapter = queue.protected ? null : await getReviewAdapter(job.subjectKind);
  const decisions: readonly ReviewAdapterDecision[] = queue.protected ? [] : adapter?.decisions ?? [];
  const canDecide = Boolean(adapter && hasAdminPermission(auth.session.adminRole, adapter.permission));
  const canNote = hasAdminPermission(auth.session.adminRole, "cases:note");

  // The queue's active reasons per decision, for the panel's reason picker
  // (WP142). Inactive reasons never reach the picker.
  const reasons: Record<string, Array<{ code: string; label: string }>> = {};
  for (const entry of decisions) {
    reasons[entry.code] = (await listReviewReasons(queue.key, entry.code, { activeOnly: true }))
      .map((reason) => ({ code: reason.code, label: reason.label }));
  }

  const [subject, left, caseReference, otherJobs, timeline, caseDecisions, notes, routing] = await Promise.all([
    describeReviewSubject(job.subjectKind, job.subjectId, now),
    countPendingJobsForQueue(queue.id),
    job.caseId ? caseReferenceFor(job.caseId) : Promise.resolve(null),
    job.caseId ? listOtherOpenJobsForCase(job.caseId, job.id, now) : Promise.resolve([]),
    job.caseId ? caseTimelineFor(job.caseId, job.subjectId) : Promise.resolve([]),
    job.caseId ? listCaseDecisions(job.caseId, auth.session.emailHash) : Promise.resolve([]),
    job.caseId
      ? listCaseNotes(job.caseId, { emailHash: auth.session.emailHash, role: auth.session.adminRole })
      : Promise.resolve([]),
    // WP143: "Routed here by rule X (version N)" or "Default queue". The
    // protected queue explains itself already, so it shows no line.
    queue.protected ? Promise.resolve(null) : routingExplanationForJob(job, job.id),
  ]);

  // The job screen shows case data; the console logs case views like the
  // case page and the preview panel do.
  if (job.caseId) {
    await recordAdminAccess(
      { adminId: auth.session.sub, action: "case_viewed", entityType: "Case", entityId: job.caseId },
      await headers(),
    );
  }

  const raw = (await searchParams) || {};
  const noted = one(raw.noted);
  const notedMessage = noted ? (NOTED_MESSAGES[noted] ?? "Recorded.") : null;
  const reference = subject?.caseReference ?? caseReference;

  return (
    <section>
      <p className="eyebrow">
        Console · Review ·{" "}
        <Link className="link-underline" href="/admin/review">
          Queues
        </Link>
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="mt-3">{subject?.summary ?? "Item for review"}</h1>
        <Link className="link-underline text-sm" href={`/admin/review/${queue.key}/preview`}>
          Queue preview
        </Link>
      </div>
      {reference && (
        <p className="mt-2 text-sm">
          Case{" "}
          <Link className="link-underline font-mono" href={`/admin/cases/${reference}`}>
            {reference}
          </Link>
        </p>
      )}
      {routing && (
        <p className="muted mt-1 text-xs">
          {routing.line}
          {routing.draftLine && <span> · {routing.draftLine}</span>}
        </p>
      )}
      {notedMessage && (
        <p className="mt-3 text-sm text-[var(--brand)]" role="status">
          {notedMessage}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {subject ? (
            <div className="a-card p-4">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                {subject.fields.map((field) => (
                  <div key={field.label}>
                    <dt className="eyebrow">{field.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words">{field.value}</dd>
                  </div>
                ))}
              </dl>
              {job.subjectKind === "FINDING" && (
                <div className="mt-4 border-t border-[var(--line)] pt-4">
                  <p className="eyebrow">Address</p>
                  <div className="mt-2">
                    <RevealAddress findingId={job.subjectId} urlsPurged={subject.urlsPurged} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="a-card muted p-6 text-sm">
              This item no longer resolves. It may have been decided or removed elsewhere; the sync will
              close its job.
            </p>
          )}

          <div className="mt-8">
            <h2>Context</h2>
            {job.caseId ? (
              <>
                {otherJobs.length > 0 && (
                  <div className="mt-4">
                    <p className="eyebrow">Other open items on this case</p>
                    <ul className="mt-2 grid gap-1 text-sm">
                      {otherJobs.map((row) => (
                        <li className="flex flex-wrap items-baseline justify-between gap-2" key={row.jobId}>
                          <span>{row.queueName}</span>
                          <span className="muted tabular-nums text-xs">waiting {row.ageMinutes}m</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-6">
                  <p className="eyebrow">Timeline</p>
                  <CaseTimeline events={timeline} />
                </div>
                <div className="mt-6">
                  <p className="eyebrow">Previous decisions on this case</p>
                  {caseDecisions.length === 0 ? (
                    <p className="muted mt-2 text-sm">No recorded decisions.</p>
                  ) : (
                    <ul className="mt-2 grid gap-1 text-sm">
                      {caseDecisions.map((row) => (
                        <li className="flex flex-wrap items-baseline justify-between gap-2" key={row.jobId}>
                          <span>
                            {row.decisionLabel}
                            {row.reasonLabel && <span className="muted"> · {row.reasonLabel}</span>}
                            <span className="muted"> · {row.reviewer}</span>
                          </span>
                          <span className="muted tabular-nums text-xs">{formatIst(row.decidedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-6">
                  <p className="eyebrow">Internal notes</p>
                  <CaseNotes
                    canNote={canNote}
                    caseId={job.caseId}
                    jobId={job.id}
                    notes={notes}
                  />
                </div>
              </>
            ) : (
              <p className="muted mt-3 text-sm">This item has no case.</p>
            )}
          </div>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-6">
            <DecisionPanel
              canDecide={canDecide}
              claimLost={!held}
              decisions={decisions}
              guidanceHtml={guidanceHtmlForQueue(queue.key)}
              jobId={job.id}
              left={left}
              lostMessage={lostMessage || undefined}
              protectedQueue={queue.protected}
              queueKey={queue.key}
              queueName={queue.name}
              reasons={reasons}
              requireReasonOnApprove={queue.requireReasonOnApprove}
              requireReasonOnReject={queue.requireReasonOnReject}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
