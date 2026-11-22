import type { ReviewJobRow, ReviewQueueRow } from "@/lib/review-jobs";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Read models for the review loop's screens (review-console-spec.md, WP141).
 * Everything here is a view over what WP140 already stores: pending jobs of
 * a queue, the case context of a job, and the decision history of a case.
 * Ids, counts, ages and queue names only — no subject text, no address, no
 * reviewer email. The note of a ReviewDecision never appears here (it stays
 * encrypted and internal), and a reviewer is shown as "You" or a short
 * handle, never an email.
 *
 * Backends follow the module pattern: memory without DATABASE_URL (dev and
 * tests), Kysely on the Worker, Prisma otherwise.
 */

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** "3h 10m", "2d 4h", "45m" — the console's age wording (case-format.ts). */
export function shortAge(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

// ---------------------------------------------------------------------------
// Pending jobs of one queue

/** The pending jobs of a queue, oldest first, lease state included. */
export async function listPendingJobsForQueue(queueId: string): Promise<ReviewJobRow[]> {
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    return [...reviewMemory().jobs.values()]
      .filter((job) => job.queueId === queueId && job.status === "PENDING")
      .sort((left, right) => right.priority - left.priority || left.createdAt.getTime() - right.createdAt.getTime())
      .map((job) => ({ ...job }));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewJob").selectAll()
      .where("queueId", "=", queueId).where("status", "=", "PENDING")
      .orderBy("priority", "desc").orderBy("createdAt", "asc")
      .execute();
    return rows as unknown as ReviewJobRow[];
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewJob.findMany({
    where: { queueId, status: "PENDING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return rows as unknown as ReviewJobRow[];
}

/** How many jobs wait in one queue — the decision panel's "N left". */
export async function countPendingJobsForQueue(queueId: string): Promise<number> {
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    return [...reviewMemory().jobs.values()].filter((job) => job.queueId === queueId && job.status === "PENDING").length;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewJob")
      .select((eb) => eb.fn.countAll<string>().as("num"))
      .where("queueId", "=", queueId).where("status", "=", "PENDING")
      .executeTakeFirst();
    return Number(row?.num ?? 0);
  }
  const { db } = await import("@/lib/db");
  return await db.reviewJob.count({ where: { queueId, status: "PENDING" } });
}

export type QueuePreviewRow = {
  jobId: string;
  subjectKind: ReviewJobRow["subjectKind"];
  subjectId: string;
  caseId: string | null;
  createdAt: string;
  priority: number;
  ageMinutes: number;
  /** Who holds the lease, without ever naming another admin. */
  heldBy: "you" | "another" | null;
};

/**
 * The Preview page's rows for one queue: what waits, how old it is, who
 * holds it. Claiming nothing, touching nothing.
 */
export async function listQueuePreview(
  queue: ReviewQueueRow,
  viewer: { emailHash: string },
  now = new Date(),
): Promise<QueuePreviewRow[]> {
  const jobs = await listPendingJobsForQueue(queue.id);
  return jobs.map((job) => ({
    jobId: job.id,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    caseId: job.caseId,
    createdAt: new Date(job.createdAt).toISOString(),
    priority: job.priority,
    ageMinutes: Math.max(0, Math.floor((now.getTime() - new Date(job.createdAt).getTime()) / 60_000)),
    heldBy:
      job.claimedBy === null || (job.claimedUntil !== null && new Date(job.claimedUntil).getTime() <= now.getTime())
        ? null
        : job.claimedBy === viewer.emailHash
          ? "you"
          : "another",
  }));
}

// ---------------------------------------------------------------------------
// The claim state of one job

/** Whether the viewer still holds an unexpired lease on the job. */
export function claimHeldBy(job: ReviewJobRow, viewerEmailHash: string, now = new Date()) {
  return (
    job.claimedBy === viewerEmailHash &&
    job.claimedUntil !== null &&
    new Date(job.claimedUntil).getTime() > now.getTime()
  );
}

// ---------------------------------------------------------------------------
// Case context

export type CaseJobRow = {
  jobId: string;
  queueName: string;
  queueKey: string;
  ageMinutes: number;
};

/** The case's other open jobs, excluding the one on screen. */
export async function listOtherOpenJobsForCase(
  caseId: string,
  excludeJobId: string | null,
  now = new Date(),
): Promise<CaseJobRow[]> {
  let jobs: ReviewJobRow[];
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    jobs = [...reviewMemory().jobs.values()].filter(
      (job) => job.caseId === caseId && job.status === "PENDING",
    );
  } else if (usesWorkerKysely()) {
    jobs = (await getWorkerDb().selectFrom("ReviewJob").selectAll()
      .where("caseId", "=", caseId).where("status", "=", "PENDING")
      .orderBy("createdAt", "asc")
      .execute()) as unknown as ReviewJobRow[];
  } else {
    const { db } = await import("@/lib/db");
    jobs = (await db.reviewJob.findMany({
      where: { caseId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    })) as unknown as ReviewJobRow[];
  }
  const { listReviewQueues } = await import("@/lib/review-jobs");
  const queuesById = new Map((await listReviewQueues()).map((queue) => [queue.id, queue]));
  return jobs
    .filter((job) => job.id !== excludeJobId)
    .flatMap((job) => {
      const queue = queuesById.get(job.queueId);
      if (!queue) return [];
      return [{
        jobId: job.id,
        queueName: queue.name,
        queueKey: queue.key,
        ageMinutes: Math.max(0, Math.floor((now.getTime() - new Date(job.createdAt).getTime()) / 60_000)),
      }];
    });
}

/** The case reference of a case id, without loading the case. */
export async function caseReferenceFor(caseId: string): Promise<string | null> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    return cases.get(caseId)?.referenceNumber ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("Case").select("referenceNumber")
      .where("id", "=", caseId).executeTakeFirst();
    return row?.referenceNumber ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.case.findUnique({ where: { id: caseId }, select: { referenceNumber: true } });
  return row?.referenceNumber ?? null;
}

export type CaseTimelineEvent = {
  sequence: number;
  eventType: string;
  actorId: string;
  createdAt: string;
};

/**
 * The case timeline for the job screen (WP141: "reuse the case page
 * component"): the audit events of the case and of the item under review,
 * same shape the case page's timeline renders.
 */
export async function caseTimelineFor(caseId: string, subjectId: string | null, limit = 30): Promise<CaseTimelineEvent[]> {
  const { readAuditTrailForEntities } = await import("@/lib/audit");
  const entityIds = subjectId ? [caseId, subjectId] : [caseId];
  const events = await readAuditTrailForEntities(entityIds, limit);
  return events.map((event) => ({
    sequence: event.sequence,
    eventType: event.eventType,
    actorId: event.actorId || "system",
    createdAt: event.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Previous decisions on a case

/** The decision codes the console shows in words (WP145 builds the log page). */
export const REVIEW_DECISION_LABELS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  dismiss: "Dismissed",
  label_possible_minor: "Labelled Possible minor",
  contacted: "Marked contacted",
  move: "Moved to another queue",
  close_stale: "Closed (resolved elsewhere)",
  send_email: "Sent by email",
  send_web_form: "Recorded a web-form submission",
};

export type ReviewDecisionLabel = "You" | "System" | string;

/**
 * A reviewer's display name: "You" for the viewer, "System" for the sync,
 * otherwise a short handle from the email hash — never the email, never
 * enough of the hash to identify anyone.
 */
export function reviewerHandle(reviewerEmailHash: string, viewerEmailHash: string): ReviewDecisionLabel {
  if (reviewerEmailHash === viewerEmailHash) return "You";
  if (reviewerEmailHash === "") return "System";
  return `Reviewer ${reviewerEmailHash.slice(0, 4)}`;
}

export type CaseDecisionRow = {
  jobId: string;
  decision: string;
  decisionLabel: string;
  reasonCode: string | null;
  reviewer: ReviewDecisionLabel;
  decidedAt: string;
};

type DecisionRow = {
  jobId: string;
  decision: string;
  reasonCode: string | null;
  reviewerEmailHash: string;
  decidedAt: Date | string;
};

/** The case's decisions, newest first — the reason note never leaves the row. */
export async function listCaseDecisions(
  caseId: string,
  viewerEmailHash: string,
  limit = 20,
): Promise<CaseDecisionRow[]> {
  let rows: DecisionRow[];
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    rows = [...reviewMemory().decisions.values()]
      .filter((decision) => decision.caseId === caseId)
      .sort((left, right) => new Date(right.decidedAt).getTime() - new Date(left.decidedAt).getTime());
  } else if (usesWorkerKysely()) {
    rows = (await getWorkerDb().selectFrom("ReviewDecision")
      .select(["jobId", "decision", "reasonCode", "reviewerEmailHash", "decidedAt"])
      .where("caseId", "=", caseId)
      .orderBy("decidedAt", "desc")
      .limit(limit)
      .execute()) as unknown as DecisionRow[];
  } else {
    const { db } = await import("@/lib/db");
    rows = (await db.reviewDecision.findMany({
      where: { caseId },
      orderBy: { decidedAt: "desc" },
      take: limit,
      select: { jobId: true, decision: true, reasonCode: true, reviewerEmailHash: true, decidedAt: true },
    })) as unknown as DecisionRow[];
  }
  return rows.map((row) => ({
    jobId: row.jobId,
    decision: row.decision,
    decisionLabel: REVIEW_DECISION_LABELS[row.decision] ?? row.decision.replaceAll("_", " "),
    reasonCode: row.reasonCode,
    reviewer: reviewerHandle(row.reviewerEmailHash, viewerEmailHash),
    decidedAt: new Date(row.decidedAt).toISOString(),
  }));
}
