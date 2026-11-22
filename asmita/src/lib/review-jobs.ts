import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { encryptField } from "@/lib/encryption";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { MINOR_HOLD_QUEUE_KEY, SYSTEM_REVIEW_QUEUES } from "@/lib/review-queue-seeds";
import {
  ensureSystemReviewReasons,
  getReviewReasonByCode,
  reasonRequiresNote,
  resetReviewReasonMemory,
} from "@/lib/review-reasons";
import {
  getReviewAdapter,
  REVIEW_SUBJECT_KINDS,
  reviewVisibilityPermission,
  type ReviewSubjectKind,
  type ReviewSubjectState,
} from "@/lib/review-adapters";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Review console core (review-console-spec.md, WP140): queues, leased jobs
 * and decisions, on the three backends every Asmita module has — the memory
 * store without DATABASE_URL (dev/tests), Kysely on the Worker (Hyperdrive)
 * and Prisma otherwise. The source tables stay authoritative: jobs are a view
 * over the subjects that already need a human, every decision goes through
 * the existing library function (review-adapters.ts), and the rows carry ids
 * only — never an address, never survivor text.
 *
 * Safety (spec rule 0.2): nothing here dispatches a notice, sets a legal or
 * contact gate, or approves anything by itself. A job only ever chooses a
 * queue and a priority; a decision only ever calls the existing function.
 * The minor check runs before anything else: a subject under a "Possible
 * minor" label goes to the protected minor-hold queue (SUPER_ADMIN only, no
 * decision continues the adult flow from there), and no action in this file
 * can move a job out of it.
 */

export const CLAIM_MINUTES = 10;
export const SKIP_MINUTES = 30;
const SYNC_THROTTLE_MS = 30_000;

/** closedReason for a job whose subject was decided outside the console. */
export const CLOSE_REASON_RESOLVED_ELSEWHERE = "resolved_elsewhere";
/** reviewerEmailHash for system decisions (the sync closing a stale job). */
export const SYSTEM_REVIEWER = "";

export type ReviewEnqueueSource = "SYNC" | "RULE" | "MOVED" | "MANUAL";
export type ReviewJobStatus = "PENDING" | "CLOSED";

export type ReviewQueueRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subjectKind: ReviewSubjectKind | null;
  isDefault: boolean;
  protected: boolean;
  sortOrder: number;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
};

export type ReviewJobRow = {
  id: string;
  queueId: string;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  caseId: string | null;
  status: ReviewJobStatus;
  priority: number;
  claimedBy: string | null;
  claimedUntil: Date | null;
  enqueueSource: ReviewEnqueueSource;
  routedByRuleId: string | null;
  routedByRuleVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
};

/** The decision that closed a job. reasonNote holds encryptField output and never leaves the reviewer UI decrypted. */
export type ReviewDecisionRow = {
  id: string;
  jobId: string;
  queueId: string;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  caseId: string | null;
  reviewerEmailHash: string;
  decision: string;
  reasonCode: string | null;
  reasonNote: string | null;
  claimedAt: Date | null;
  decidedAt: Date;
  auditEventId: string | null;
};

/** What an API answers about a decision: never the note, never the reviewer's hash. */
export type ReviewDecisionView = {
  id: string;
  jobId: string;
  decision: string;
  reasonCode: string | null;
  hasNote: boolean;
  decidedAt: Date;
  closedReason: string | null;
};

type MemoryClaimRow = {
  id: string;
  jobId: string;
  reviewerEmailHash: string;
  claimedAt: Date;
  releasedAt: Date | null;
  outcome: string | null;
};

type MemorySkipRow = { reviewerEmailHash: string; jobId: string; until: Date };

type MemoryReviewQueue = ReviewQueueRow & { createdAt: Date; updatedAt: Date };

type MemoryReviewState = {
  queues: Map<string, MemoryReviewQueue>;
  jobs: Map<string, ReviewJobRow>;
  decisions: Map<string, ReviewDecisionRow>;
  claims: MemoryClaimRow[];
  skips: Map<string, MemorySkipRow>;
};

const memoryGlobals = globalThis as typeof globalThis & { __asmitaReviewStore?: MemoryReviewState };

/** The review memory store for dev/tests. Refuses to run in production. */
export function reviewMemory(): MemoryReviewState {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[review-jobs.ts] In-memory review state cannot be used in production.");
  }
  memoryGlobals.__asmitaReviewStore ??= {
    queues: new Map(),
    jobs: new Map(),
    decisions: new Map(),
    claims: [],
    skips: new Map(),
  };
  return memoryGlobals.__asmitaReviewStore;
}

/** Test seam: clears the memory store, the queue-ensure flag and the lazy-sync throttle. */
export function resetReviewMemory(): void {
  memoryGlobals.__asmitaReviewStore = undefined;
  queuesEnsured = false;
  lastLazySyncAt = 0;
  resetReviewReasonMemory();
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function skipKey(reviewerEmailHash: string, jobId: string) {
  return `${reviewerEmailHash}\u0000${jobId}`;
}

function decisionView(row: ReviewDecisionRow, closedReason: string | null): ReviewDecisionView {
  return {
    id: row.id,
    jobId: row.jobId,
    decision: row.decision,
    reasonCode: row.reasonCode,
    hasNote: row.reasonNote !== null,
    decidedAt: row.decidedAt,
    closedReason,
  };
}

// ---------------------------------------------------------------------------
// Queues

let queuesEnsured = false;

/**
 * Creates the system queues if they are missing. Idempotent and
 * create-only: an admin's later renames and edits (WP143) are never
 * clobbered by a re-run.
 */
export async function ensureSystemQueues(): Promise<void> {
  if (queuesEnsured) return;
  if (isDevNoDb()) {
    const memory = reviewMemory();
    for (const seed of SYSTEM_REVIEW_QUEUES) {
      if (!memory.queues.has(seed.key)) {
        const now = new Date();
        memory.queues.set(seed.key, { ...seed, createdAt: now, updatedAt: now });
      }
    }
  } else if (usesWorkerKysely()) {
    const now = new Date();
    await getWorkerDb()
      .insertInto("ReviewQueue")
      .values(
        SYSTEM_REVIEW_QUEUES.map((seed) => ({
          id: seed.id,
          key: seed.key,
          name: seed.name,
          description: seed.description,
          subjectKind: seed.subjectKind,
          isDefault: seed.isDefault,
          protected: seed.protected,
          sortOrder: seed.sortOrder,
          requireReasonOnReject: seed.requireReasonOnReject,
          requireReasonOnApprove: seed.requireReasonOnApprove,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflict((oc) => oc.column("key").doNothing())
      .execute();
  } else {
    const { db } = await import("@/lib/db");
    for (const seed of SYSTEM_REVIEW_QUEUES) {
      await db.reviewQueue.upsert({
        where: { key: seed.key },
        create: {
          id: seed.id,
          key: seed.key,
          name: seed.name,
          description: seed.description,
          subjectKind: seed.subjectKind,
          isDefault: seed.isDefault,
          protected: seed.protected,
          sortOrder: seed.sortOrder,
          requireReasonOnReject: seed.requireReasonOnReject,
          requireReasonOnApprove: seed.requireReasonOnApprove,
        },
        update: {},
      });
    }
  }
  queuesEnsured = true;
}

function toQueueRow(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subjectKind: ReviewSubjectKind | null;
  isDefault: boolean;
  protected: boolean;
  sortOrder: number;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
}): ReviewQueueRow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    subjectKind: row.subjectKind,
    isDefault: row.isDefault,
    protected: row.protected,
    sortOrder: row.sortOrder,
    requireReasonOnReject: row.requireReasonOnReject,
    requireReasonOnApprove: row.requireReasonOnApprove,
  };
}

export async function listReviewQueues(): Promise<ReviewQueueRow[]> {
  await ensureSystemQueues();
  if (isDevNoDb()) {
    return [...reviewMemory().queues.values()].map(toQueueRow).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewQueue").selectAll().orderBy("sortOrder", "asc").execute();
    return rows.map((row) => toQueueRow(row as unknown as Parameters<typeof toQueueRow>[0]));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewQueue.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((row) => toQueueRow(row));
}

export async function getReviewQueueByKey(key: string): Promise<ReviewQueueRow | null> {
  await ensureSystemQueues();
  if (isDevNoDb()) {
    const queue = reviewMemory().queues.get(key);
    return queue ? toQueueRow(queue) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewQueue").selectAll().where("key", "=", key).executeTakeFirst();
    return row ? toQueueRow(row as unknown as Parameters<typeof toQueueRow>[0]) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewQueue.findUnique({ where: { key } });
  return row ? toQueueRow(row) : null;
}

async function getReviewQueueById(id: string): Promise<ReviewQueueRow | null> {
  await ensureSystemQueues();
  if (isDevNoDb()) {
    const queue = [...reviewMemory().queues.values()].find((item) => item.id === id);
    return queue ? toQueueRow(queue) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewQueue").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toQueueRow(row as unknown as Parameters<typeof toQueueRow>[0]) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewQueue.findUnique({ where: { id } });
  return row ? toQueueRow(row) : null;
}

/** The kind's default queue, or null when seeding has not run. */
async function defaultQueueForKind(kind: ReviewSubjectKind): Promise<ReviewQueueRow | null> {
  const queues = await listReviewQueues();
  const defaults = queues.filter((queue) => queue.subjectKind === kind && queue.isDefault);
  return defaults.sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

/**
 * Whether a role may see a queue at all (spec: cases:read for the complaint
 * queues, the adapter's permission for partner applications, lab:manage for
 * lab reports; protected queues — minor-hold — are SUPER_ADMIN only, and an
 * any-kind queue is treated as protected regardless of its flag).
 */
export function canSeeReviewQueue(
  role: AdminRole,
  queue: { protected: boolean; subjectKind: ReviewSubjectKind | null },
): boolean {
  if (queue.protected || queue.subjectKind === null) return role === "SUPER_ADMIN";
  return hasAdminPermission(role, reviewVisibilityPermission(queue.subjectKind));
}

// ---------------------------------------------------------------------------
// Jobs

function toJobRow(row: ReviewJobRow): ReviewJobRow {
  return { ...row };
}

export async function getReviewJob(jobId: string): Promise<ReviewJobRow | null> {
  if (isDevNoDb()) {
    const job = reviewMemory().jobs.get(jobId);
    return job ? toJobRow(job) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewJob").selectAll().where("id", "=", jobId).executeTakeFirst();
    return row ? toJobRow(row as unknown as ReviewJobRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewJob.findUnique({ where: { id: jobId } });
  return row ? toJobRow(row as unknown as ReviewJobRow) : null;
}

/** The job and its queue, for the decision paths. */
export async function getReviewJobWithQueue(jobId: string): Promise<{ job: ReviewJobRow; queue: ReviewQueueRow } | null> {
  const job = await getReviewJob(jobId);
  if (!job) return null;
  const queue = await getReviewQueueById(job.queueId);
  if (!queue) return null;
  return { job, queue };
}

async function findOpenJobForSubject(kind: ReviewSubjectKind, subjectId: string): Promise<ReviewJobRow | null> {
  if (isDevNoDb()) {
    const job = [...reviewMemory().jobs.values()].find(
      (item) => item.subjectKind === kind && item.subjectId === subjectId && item.status === "PENDING",
    );
    return job ? toJobRow(job) : null;
  }
  const where = { subjectKind: kind, subjectId, status: "PENDING" as const };
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewJob").selectAll()
      .where("subjectKind", "=", kind).where("subjectId", "=", subjectId).where("status", "=", "PENDING")
      .executeTakeFirst();
    return row ? toJobRow(row as unknown as ReviewJobRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewJob.findFirst({ where });
  return row ? toJobRow(row as unknown as ReviewJobRow) : null;
}

type CreateJobInput = {
  queueId: string;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  caseId: string | null;
  enqueueSource: ReviewEnqueueSource;
  priority?: number;
  now: Date;
};

async function createJob(input: CreateJobInput): Promise<ReviewJobRow> {
  if (isDevNoDb()) {
    const job: ReviewJobRow = {
      id: randomUUID(),
      queueId: input.queueId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      caseId: input.caseId,
      status: "PENDING",
      priority: input.priority ?? 0,
      claimedBy: null,
      claimedUntil: null,
      enqueueSource: input.enqueueSource,
      routedByRuleId: null,
      routedByRuleVersion: null,
      createdAt: input.now,
      updatedAt: input.now,
      closedAt: null,
      closedReason: null,
    };
    reviewMemory().jobs.set(job.id, job);
    return toJobRow(job);
  }
  const data = {
    queueId: input.queueId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    caseId: input.caseId,
    status: "PENDING" as const,
    priority: input.priority ?? 0,
    enqueueSource: input.enqueueSource,
    createdAt: input.now,
    updatedAt: input.now,
  };
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().insertInto("ReviewJob").values({ id: randomUUID(), ...data })
      .returningAll().executeTakeFirstOrThrow();
    return toJobRow(row as unknown as ReviewJobRow);
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewJob.create({ data });
  return toJobRow(row as unknown as ReviewJobRow);
}

/**
 * The queue a subject belongs in: the minor check first (a "Possible minor"
 * label always wins, WP140), then the kind's default queue until WP143's
 * routing rules exist.
 */
async function queueForSubject(state: ReviewSubjectState, kind: ReviewSubjectKind): Promise<ReviewQueueRow | null> {
  if (state.minorHold) return getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
  return defaultQueueForKind(kind);
}

/**
 * Opens (or keeps open) the review job for one subject. A second enqueue
 * merges into the open job; when the minor check changes the subject's
 * queue, the open job moves and any lease is released.
 */
export async function enqueueForReview(
  kind: ReviewSubjectKind,
  subjectId: string,
  options: { caseId?: string | null; now?: Date; source?: ReviewEnqueueSource } = {},
): Promise<{ ok: true; jobId: string | null; merged: boolean } | { ok: false; error: string }> {
  const now = options.now ?? new Date();
  await ensureSystemQueues();
  const adapter = await getReviewAdapter(kind);
  if (!adapter) return { ok: false, error: "adapter_unavailable" };
  const state = await adapter.subjectNeedsReview(subjectId);
  if (!state) return { ok: true, jobId: null, merged: false };
  const queue = await queueForSubject(state, kind);
  if (!queue) return { ok: false, error: "review_queue_missing" };
  const caseId = options.caseId ?? state.caseId ?? null;

  const existing = await findOpenJobForSubject(kind, subjectId);
  if (existing) {
    if (existing.queueId === queue.id) {
      await touchJob(existing.id, now);
      return { ok: true, jobId: existing.id, merged: true };
    }
    await moveOpenJobToQueue(existing, queue, now);
    return { ok: true, jobId: existing.id, merged: true };
  }
  try {
    const job = await createJob({
      queueId: queue.id,
      subjectKind: kind,
      subjectId,
      caseId,
      enqueueSource: options.source ?? "MANUAL",
      now,
    });
    return { ok: true, jobId: job.id, merged: false };
  } catch (err) {
    // A concurrent enqueue of the same subject hit the one-open-job index;
    // the merge is exactly what should happen.
    if (isUniqueViolation(err)) return { ok: true, jobId: null, merged: true };
    throw err;
  }
}

function isUniqueViolation(err: unknown) {
  const code = (err as { code?: string })?.code;
  return code === "P2002" || code === "23505";
}

async function touchJob(jobId: string, now: Date) {
  if (isDevNoDb()) {
    const job = reviewMemory().jobs.get(jobId);
    if (job) job.updatedAt = now;
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("ReviewJob").set({ updatedAt: now }).where("id", "=", jobId).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.reviewJob.updateMany({ where: { id: jobId }, data: { updatedAt: now } });
}

/**
 * Moves an open job to another queue and releases any lease: the holder's
 * screen shows a lost claim, which is the safe outcome when an item's queue
 * changes under them. Guarded on PENDING, so a job decided in the meantime
 * is left alone.
 */
async function moveOpenJobToQueue(job: ReviewJobRow, queue: ReviewQueueRow, now: Date): Promise<boolean> {
  if (isDevNoDb()) {
    const memory = reviewMemory();
    const stored = memory.jobs.get(job.id);
    if (!stored || stored.status !== "PENDING") return false;
    stored.queueId = queue.id;
    stored.claimedBy = null;
    stored.claimedUntil = null;
    stored.updatedAt = now;
    await closeOpenClaims(memory, job.id, now, "released");
    return true;
  }
  const data = { queueId: queue.id, claimedBy: null, claimedUntil: null, updatedAt: now };
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("ReviewJob").set(data)
      .where("id", "=", job.id).where("status", "=", "PENDING").executeTakeFirst();
    const moved = Number(result.numUpdatedRows) > 0;
    if (moved) await closeOpenClaimRows(job.id, now, "released");
    return moved;
  }
  const { db } = await import("@/lib/db");
  const result = await db.reviewJob.updateMany({ where: { id: job.id, status: "PENDING" }, data });
  if (result.count > 0) await closeOpenClaimRows(job.id, now, "released");
  return result.count > 0;
}

function closeOpenClaims(memory: MemoryReviewState, jobId: string, now: Date, outcome: string) {
  for (const claim of memory.claims) {
    if (claim.jobId === jobId && claim.releasedAt === null) {
      claim.releasedAt = now;
      claim.outcome = outcome;
    }
  }
}

async function closeOpenClaimRows(jobId: string, now: Date, outcome: string) {
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("ReviewJobClaim").set({ releasedAt: now, outcome })
      .where("jobId", "=", jobId).where("releasedAt", "is", null).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.reviewJobClaim.updateMany({ where: { jobId, releasedAt: null }, data: { releasedAt: now, outcome } });
}

// ---------------------------------------------------------------------------
// The lease (claim, extend, skip, release)

export type ClaimResult = { job: ReviewJobRow | null; claimId: string | null };

/**
 * Claims the next job of a queue for a reviewer. One statement on Postgres
 * (FOR UPDATE SKIP LOCKED), the same semantics single-threaded on the
 * memory backend: a reviewer who already holds a job gets the same one back
 * (refresh-safe), an expired lease is handed over, and a job this reviewer
 * skipped in the last 30 minutes is not offered again.
 */
export async function claimNextJob(input: {
  queueId: string;
  reviewerEmailHash: string;
  now?: Date;
}): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  await ensureSystemQueues();

  if (isDevNoDb()) {
    const memory = reviewMemory();
    const candidates = [...memory.jobs.values()]
      .filter((job) => job.queueId === input.queueId && job.status === "PENDING")
      .filter(
        (job) =>
          job.claimedUntil === null ||
          job.claimedUntil.getTime() < now.getTime() ||
          job.claimedBy === input.reviewerEmailHash,
      )
      .filter((job) => {
        const skip = memory.skips.get(skipKey(input.reviewerEmailHash, job.id));
        return !skip || skip.until.getTime() <= now.getTime();
      })
      .sort(
        (left, right) =>
          Number(right.claimedBy === input.reviewerEmailHash) - Number(left.claimedBy === input.reviewerEmailHash) ||
          right.priority - left.priority ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
    const job = candidates[0];
    if (!job) return { job: null, claimId: null };
    job.claimedBy = input.reviewerEmailHash;
    job.claimedUntil = addMinutes(now, CLAIM_MINUTES);
    job.updatedAt = now;
    const claim: MemoryClaimRow = {
      id: randomUUID(),
      jobId: job.id,
      reviewerEmailHash: input.reviewerEmailHash,
      claimedAt: now,
      releasedAt: null,
      outcome: null,
    };
    memory.claims.push(claim);
    return { job: toJobRow(job), claimId: claim.id };
  }

  let claimed: ReviewJobRow[];
  if (usesWorkerKysely()) {
    claimed = (
      await sql<ReviewJobRow>`UPDATE "ReviewJob"
         SET "claimedBy" = ${input.reviewerEmailHash},
             "claimedUntil" = now() + interval '10 minutes',
             "updatedAt" = now()
       WHERE "id" = (
         SELECT "id" FROM "ReviewJob"
          WHERE "queueId" = ${input.queueId}
            AND "status" = 'PENDING'
            AND ("claimedUntil" IS NULL OR "claimedUntil" < now() OR "claimedBy" = ${input.reviewerEmailHash})
            AND "id" NOT IN (
              SELECT "jobId" FROM "ReviewSkip"
               WHERE "reviewerEmailHash" = ${input.reviewerEmailHash} AND "until" > now()
            )
          ORDER BY ("claimedBy" = ${input.reviewerEmailHash}) DESC NULLS LAST, "priority" DESC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
      RETURNING *`.execute(getWorkerDb())
    ).rows;
  } else {
    const { db } = await import("@/lib/db");
    claimed = await db.$queryRaw<ReviewJobRow[]>`
      UPDATE "ReviewJob"
         SET "claimedBy" = ${input.reviewerEmailHash},
             "claimedUntil" = now() + interval '10 minutes',
             "updatedAt" = now()
       WHERE "id" = (
         SELECT "id" FROM "ReviewJob"
          WHERE "queueId" = ${input.queueId}
            AND "status" = 'PENDING'
            AND ("claimedUntil" IS NULL OR "claimedUntil" < now() OR "claimedBy" = ${input.reviewerEmailHash})
            AND "id" NOT IN (
              SELECT "jobId" FROM "ReviewSkip"
               WHERE "reviewerEmailHash" = ${input.reviewerEmailHash} AND "until" > now()
            )
          ORDER BY ("claimedBy" = ${input.reviewerEmailHash}) DESC NULLS LAST, "priority" DESC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
      RETURNING *`;
  }
  const job = claimed[0];
  if (!job) return { job: null, claimId: null };

  const claim = { jobId: job.id, reviewerEmailHash: input.reviewerEmailHash, claimedAt: now };
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().insertInto("ReviewJobClaim")
      .values({ id: randomUUID(), ...claim })
      .returning("id").executeTakeFirst();
    return { job: toJobRow(job), claimId: row?.id ?? null };
  }
  const { db } = await import("@/lib/db");
  const created = await db.reviewJobClaim.create({ data: claim, select: { id: true } });
  return { job: toJobRow(job), claimId: created.id };
}

/** Common guard for acting on a held lease. */
async function requireHeldJob(
  jobId: string,
  reviewerEmailHash: string,
  now: Date,
): Promise<{ ok: true; job: ReviewJobRow } | { ok: false; error: "job_not_found" | "job_closed" | "claim_lost" }> {
  const job = await getReviewJob(jobId);
  if (!job) return { ok: false, error: "job_not_found" };
  if (job.status !== "PENDING") return { ok: false, error: "job_closed" };
  if (job.claimedBy !== reviewerEmailHash) return { ok: false, error: "claim_lost" };
  if (job.claimedUntil === null || job.claimedUntil.getTime() <= now.getTime()) {
    return { ok: false, error: "claim_lost" };
  }
  return { ok: true, job };
}

export type LeaseResult = { ok: true } | { ok: false; error: string };

/** Extends the caller's lease by another claim window, only while still held. */
export async function extendClaim(jobId: string, reviewerEmailHash: string, now = new Date()): Promise<LeaseResult> {
  await ensureSystemQueues();
  if (isDevNoDb()) {
    const held = await requireHeldJob(jobId, reviewerEmailHash, now);
    if (!held.ok) return held;
    const job = reviewMemory().jobs.get(jobId)!;
    job.claimedUntil = addMinutes(now, CLAIM_MINUTES);
    job.updatedAt = now;
    return { ok: true };
  }
  const claimedUntil = addMinutes(now, CLAIM_MINUTES);
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("ReviewJob")
      .set({ claimedUntil, updatedAt: now })
      .where("id", "=", jobId)
      .where("claimedBy", "=", reviewerEmailHash)
      .where("status", "=", "PENDING")
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) > 0) return { ok: true };
  } else {
    const { db } = await import("@/lib/db");
    const result = await db.reviewJob.updateMany({
      where: { id: jobId, claimedBy: reviewerEmailHash, status: "PENDING" },
      data: { claimedUntil, updatedAt: now },
    });
    if (result.count > 0) return { ok: true };
  }
  const held = await requireHeldJob(jobId, reviewerEmailHash, now);
  return held.ok ? { ok: true } : { ok: false, error: held.error };
}

/** Hides this job from this reviewer for the skip window, and releases their lease. */
export async function skipJob(jobId: string, reviewerEmailHash: string, now = new Date()): Promise<LeaseResult> {
  const held = await requireHeldJob(jobId, reviewerEmailHash, now);
  if (!held.ok) return held;
  const until = addMinutes(now, SKIP_MINUTES);
  if (isDevNoDb()) {
    const memory = reviewMemory();
    memory.skips.set(skipKey(reviewerEmailHash, jobId), { reviewerEmailHash, jobId, until });
    const job = memory.jobs.get(jobId)!;
    job.claimedBy = null;
    job.claimedUntil = null;
    job.updatedAt = now;
    closeOpenClaims(memory, jobId, now, "skipped");
    return { ok: true };
  }
  if (usesWorkerKysely()) {
    const db = getWorkerDb();
    await db.insertInto("ReviewSkip")
      .values({ reviewerEmailHash, jobId, until })
      .onConflict((oc) => oc.columns(["reviewerEmailHash", "jobId"]).doUpdateSet({ until }))
      .execute();
    await db.updateTable("ReviewJob")
      .set({ claimedBy: null, claimedUntil: null, updatedAt: now })
      .where("id", "=", jobId).where("claimedBy", "=", reviewerEmailHash).where("status", "=", "PENDING")
      .execute();
    await db.updateTable("ReviewJobClaim")
      .set({ releasedAt: now, outcome: "skipped" })
      .where("jobId", "=", jobId).where("reviewerEmailHash", "=", reviewerEmailHash).where("releasedAt", "is", null)
      .execute();
    return { ok: true };
  }
  const { db } = await import("@/lib/db");
  await db.reviewSkip.upsert({
    where: { reviewerEmailHash_jobId: { reviewerEmailHash, jobId } },
    create: { reviewerEmailHash, jobId, until },
    update: { until },
  });
  await db.reviewJob.updateMany({
    where: { id: jobId, claimedBy: reviewerEmailHash, status: "PENDING" },
    data: { claimedBy: null, claimedUntil: null, updatedAt: now },
  });
  await db.reviewJobClaim.updateMany({
    where: { jobId, reviewerEmailHash, releasedAt: null },
    data: { releasedAt: now, outcome: "skipped" },
  });
  return { ok: true };
}

/** Releases the caller's lease without a decision. */
export async function releaseJob(jobId: string, reviewerEmailHash: string, now = new Date()): Promise<LeaseResult> {
  await ensureSystemQueues();
  const job = await getReviewJob(jobId);
  if (!job) return { ok: false, error: "job_not_found" };
  if (job.status !== "PENDING") return { ok: false, error: "job_closed" };
  if (job.claimedBy === null) return { ok: true };
  if (job.claimedBy !== reviewerEmailHash) return { ok: false, error: "claim_lost" };

  if (isDevNoDb()) {
    const memory = reviewMemory();
    const stored = memory.jobs.get(jobId)!;
    stored.claimedBy = null;
    stored.claimedUntil = null;
    stored.updatedAt = now;
    closeOpenClaims(memory, jobId, now, "released");
    return { ok: true };
  }
  if (usesWorkerKysely()) {
    const db = getWorkerDb();
    await db.updateTable("ReviewJob")
      .set({ claimedBy: null, claimedUntil: null, updatedAt: now })
      .where("id", "=", jobId).where("claimedBy", "=", reviewerEmailHash).where("status", "=", "PENDING")
      .execute();
    await db.updateTable("ReviewJobClaim")
      .set({ releasedAt: now, outcome: "released" })
      .where("jobId", "=", jobId).where("reviewerEmailHash", "=", reviewerEmailHash).where("releasedAt", "is", null)
      .execute();
    return { ok: true };
  }
  const { db } = await import("@/lib/db");
  await db.reviewJob.updateMany({
    where: { id: jobId, claimedBy: reviewerEmailHash, status: "PENDING" },
    data: { claimedBy: null, claimedUntil: null, updatedAt: now },
  });
  await db.reviewJobClaim.updateMany({
    where: { jobId, reviewerEmailHash, releasedAt: null },
    data: { releasedAt: now, outcome: "released" },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Decisions

export type DecideJobResult =
  | { ok: true; closed: true; decision: ReviewDecisionView; idempotent?: boolean }
  | { ok: true; closed: false; status?: string }
  | { ok: false; error: string };

/**
 * Takes a decision on a held job through the existing function for its
 * subject (the adapter map). The decision must be one of the adapter's, the
 * queue's reason flags are enforced here on the server, and a job in the
 * protected minor-hold queue refuses every decision: nothing there
 * continues the adult flow.
 */
export async function decideJob(input: {
  jobId: string;
  /** The reviewer's email hash (the lease identity). */
  me: string;
  /** The admin session's subject id, what the existing functions take. */
  reviewerId: string;
  role: AdminRole;
  decision: string;
  reasonCode?: string;
  reasonNote?: string;
  now?: Date;
}): Promise<DecideJobResult> {
  const now = input.now ?? new Date();
  await ensureSystemQueues();
  await ensureSystemReviewReasons();
  const loaded = await getReviewJobWithQueue(input.jobId);
  if (!loaded) return { ok: false, error: "job_not_found" };
  const { job, queue } = loaded;

  // Idempotent retry: the earlier attempt closed the job and wrote its
  // decision, so the same reviewer gets the same answer back.
  const earlier = await getDecisionByJobId(job.id);
  if (earlier) {
    if (earlier.reviewerEmailHash === input.me) {
      return { ok: true, closed: true, decision: decisionView(earlier, job.closedReason), idempotent: true };
    }
    return { ok: false, error: "job_closed" };
  }

  if (job.status !== "PENDING") return { ok: false, error: "job_closed" };
  if (job.claimedBy !== input.me || job.claimedUntil === null || job.claimedUntil.getTime() <= now.getTime()) {
    return { ok: false, error: "claim_lost" };
  }
  if (queue.protected) return { ok: false, error: "minor_hold" };

  const adapter = await getReviewAdapter(job.subjectKind);
  if (!adapter) return { ok: false, error: "adapter_unavailable" };
  const decisionDef = adapter.decisions.find((item) => item.code === input.decision);
  if (!decisionDef) return { ok: false, error: "unknown_decision" };

  const hasReason = Boolean(input.reasonCode?.trim() || input.reasonNote?.trim());
  if (decisionDef.reasonKind === "reject" && queue.requireReasonOnReject && !hasReason) {
    return { ok: false, error: "reason_required" };
  }
  if (decisionDef.reasonKind === "approve" && queue.requireReasonOnApprove && !hasReason) {
    return { ok: false, error: "reason_required" };
  }

  // WP142: a picked reason must be one of this queue's active reasons for
  // this decision — a deactivated or invented code is refused before the
  // existing function runs — and "Other (explain)" carries its explanation
  // in the note. A plain note without a code stays valid (WP141 behaviour).
  if (input.reasonCode?.trim()) {
    const reason = await getReviewReasonByCode(queue.key, input.decision, input.reasonCode.trim());
    if (!reason || !reason.active) return { ok: false, error: "invalid_reason" };
    if (reasonRequiresNote(reason.code) && !input.reasonNote?.trim()) {
      return { ok: false, error: "reason_note_required" };
    }
  }

  const outcome = await adapter.decide(job.subjectId, input.decision, {
    reviewerId: input.reviewerId,
    reviewerEmailHash: input.me,
    role: input.role,
    caseId: job.caseId,
  });
  if (!outcome.ok) return outcome;

  if (!outcome.resolved) {
    // The existing function succeeded but the subject still needs a human
    // (a first approval awaiting a second analyst): the job stays open and
    // the lease goes back, so the existing function's own audit entry is
    // the only record — this reviewer is done with it.
    await releaseJob(job.id, input.me, now);
    return { ok: true, closed: false, status: outcome.status };
  }

  const claimedAt = await myOpenClaimStartedAt(job.id, input.me);
  const decisionRow = {
    id: randomUUID(),
    jobId: job.id,
    queueId: job.queueId,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    caseId: job.caseId,
    reviewerEmailHash: input.me,
    decision: input.decision,
    reasonCode: input.reasonCode?.trim() || null,
    reasonNote: input.reasonNote?.trim() ? encryptField(input.reasonNote.trim()) : null,
    claimedAt,
    decidedAt: now,
    auditEventId: null,
  };
  const requeue = outcome.requeueKey ? await getReviewQueueByKey(outcome.requeueKey) : null;
  if (outcome.requeueKey && !requeue) return { ok: false, error: "review_queue_missing" };

  try {
    await commitDecision(job, decisionRow, input.decision, requeue, now);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const earlierDecision = await getDecisionByJobId(job.id);
      if (earlierDecision && earlierDecision.reviewerEmailHash === input.me) {
        return { ok: true, closed: true, decision: decisionView(earlierDecision, input.decision), idempotent: true };
      }
    }
    throw err;
  }
  return { ok: true, closed: true, decision: decisionView(decisionRow, input.decision) };
}

/**
 * Records the decision and closes the job in one transaction where the
 * backend allows one, so a crash can never leave a decided subject with an
 * open job. The requeue (a possible-minor label moving the subject to
 * minor-hold) opens the follow-up job in the same transaction; if a job for
 * the subject is already open there, the insert is skipped, not failed.
 */
async function commitDecision(
  job: ReviewJobRow,
  decisionRow: Omit<ReviewDecisionRow, "auditEventId"> & { auditEventId: null },
  closedReason: string,
  requeue: ReviewQueueRow | null,
  now: Date,
): Promise<void> {
  if (isDevNoDb()) {
    const memory = reviewMemory();
    const stored = memory.jobs.get(job.id);
    if (!stored || stored.status !== "PENDING") throw new Error("job_closed");
    if (memory.decisions.has(job.id)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
    memory.decisions.set(job.id, decisionRow);
    stored.status = "CLOSED";
    stored.closedAt = now;
    stored.closedReason = closedReason;
    stored.claimedBy = null;
    stored.claimedUntil = null;
    stored.updatedAt = now;
    closeOpenClaims(memory, job.id, now, "decided");
    if (requeue && !hasOpenJob(memory, job.subjectKind, job.subjectId)) {
      memory.jobs.set(randomUUID(), {
        id: randomUUID(),
        queueId: requeue.id,
        subjectKind: job.subjectKind,
        subjectId: job.subjectId,
        caseId: job.caseId,
        status: "PENDING",
        priority: 0,
        claimedBy: null,
        claimedUntil: null,
        enqueueSource: "MOVED",
        routedByRuleId: null,
        routedByRuleVersion: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        closedReason: null,
      });
    }
    return;
  }

  if (usesWorkerKysely()) {
    await getWorkerDb().transaction().execute(async (trx) => {
      await trx.insertInto("ReviewDecision").values(decisionRow).execute();
      const closed = await trx.updateTable("ReviewJob")
        .set({ status: "CLOSED", closedAt: now, closedReason, claimedBy: null, claimedUntil: null, updatedAt: now })
        .where("id", "=", job.id).where("status", "=", "PENDING")
        .executeTakeFirst();
      if (Number(closed.numUpdatedRows) === 0) throw new Error("job_closed");
      await trx.updateTable("ReviewJobClaim")
        .set({ releasedAt: now, outcome: "decided" })
        .where("jobId", "=", job.id).where("releasedAt", "is", null)
        .execute();
      if (requeue) {
        await trx.insertInto("ReviewJob")
          .values({
            id: randomUUID(),
            queueId: requeue.id,
            subjectKind: job.subjectKind,
            subjectId: job.subjectId,
            caseId: job.caseId,
            status: "PENDING",
            priority: 0,
            enqueueSource: "MOVED",
            createdAt: now,
            updatedAt: now,
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    });
    return;
  }

  const { db } = await import("@/lib/db");
  await db.$transaction(async (tx) => {
    await tx.reviewDecision.create({ data: decisionRow });
    const closed = await tx.reviewJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "CLOSED", closedAt: now, closedReason, claimedBy: null, claimedUntil: null, updatedAt: now },
    });
    if (closed.count === 0) throw new Error("job_closed");
    await tx.reviewJobClaim.updateMany({
      where: { jobId: job.id, releasedAt: null },
      data: { releasedAt: now, outcome: "decided" },
    });
    if (requeue) {
      await tx.reviewJob.createMany({
        data: [
          {
            queueId: requeue.id,
            subjectKind: job.subjectKind,
            subjectId: job.subjectId,
            caseId: job.caseId,
            status: "PENDING",
            priority: 0,
            enqueueSource: "MOVED",
            createdAt: now,
            updatedAt: now,
          },
        ],
        skipDuplicates: true,
      });
    }
  });
}

function hasOpenJob(memory: MemoryReviewState, kind: ReviewSubjectKind, subjectId: string) {
  return [...memory.jobs.values()].some(
    (job) => job.subjectKind === kind && job.subjectId === subjectId && job.status === "PENDING",
  );
}

async function getDecisionByJobId(jobId: string): Promise<ReviewDecisionRow | null> {
  if (isDevNoDb()) {
    return reviewMemory().decisions.get(jobId) ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewDecision").selectAll().where("jobId", "=", jobId).executeTakeFirst();
    return row ? (row as unknown as ReviewDecisionRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewDecision.findUnique({ where: { jobId } });
  return row ? (row as unknown as ReviewDecisionRow) : null;
}

async function myOpenClaimStartedAt(jobId: string, reviewerEmailHash: string): Promise<Date | null> {
  if (isDevNoDb()) {
    const claim = reviewMemory()
      .claims.filter((claim) => claim.jobId === jobId && claim.reviewerEmailHash === reviewerEmailHash && claim.releasedAt === null)
      .at(-1);
    return claim?.claimedAt ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewJobClaim").select("claimedAt")
      .where("jobId", "=", jobId).where("reviewerEmailHash", "=", reviewerEmailHash).where("releasedAt", "is", null)
      .orderBy("claimedAt", "desc").executeTakeFirst();
    return row?.claimedAt ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewJobClaim.findFirst({
    where: { jobId, reviewerEmailHash, releasedAt: null },
    orderBy: { claimedAt: "desc" },
    select: { claimedAt: true },
  });
  return row?.claimedAt ?? null;
}

/**
 * Moves a job to another queue by hand: the move is recorded as the job's
 * closing decision, and the subject reopens in the target queue. Moving a
 * job OUT of the protected minor-hold queue is refused — only the existing
 * minor-clearing flow (a second admin clearing the label) brings a subject
 * back to the adult queues, and the sync follows it.
 */
export async function moveJob(
  jobId: string,
  me: string,
  toQueueId: string,
  options: { note?: string; now?: Date } = {},
): Promise<{ ok: true; jobId: string; queueKey: string } | { ok: false; error: string }> {
  const now = options.now ?? new Date();
  await ensureSystemQueues();
  const loaded = await getReviewJobWithQueue(jobId);
  if (!loaded) return { ok: false, error: "job_not_found" };
  const { job, queue } = loaded;
  const target = await getReviewQueueById(toQueueId);
  if (!target) return { ok: false, error: "queue_not_found" };
  if (job.status !== "PENDING") return { ok: false, error: "job_closed" };
  if (queue.protected) return { ok: false, error: "minor_hold" };
  if (target.subjectKind !== null && target.subjectKind !== job.subjectKind) {
    return { ok: false, error: "queue_kind_mismatch" };
  }

  const decisionRow = {
    id: randomUUID(),
    jobId: job.id,
    queueId: job.queueId,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    caseId: job.caseId,
    reviewerEmailHash: me,
    decision: "move",
    reasonCode: null,
    reasonNote: options.note?.trim() ? encryptField(options.note.trim()) : null,
    claimedAt: null,
    decidedAt: now,
    auditEventId: null,
  };
  const newJobId = randomUUID();

  if (isDevNoDb()) {
    const memory = reviewMemory();
    if (memory.decisions.has(job.id)) return { ok: false, error: "job_closed" };
    memory.decisions.set(job.id, decisionRow);
    const stored = memory.jobs.get(job.id)!;
    stored.status = "CLOSED";
    stored.closedAt = now;
    stored.closedReason = "moved";
    stored.claimedBy = null;
    stored.claimedUntil = null;
    stored.updatedAt = now;
    closeOpenClaims(memory, job.id, now, "released");
    if (!hasOpenJob(memory, job.subjectKind, job.subjectId)) {
      memory.jobs.set(newJobId, {
        id: newJobId,
        queueId: target.id,
        subjectKind: job.subjectKind,
        subjectId: job.subjectId,
        caseId: job.caseId,
        status: "PENDING",
        priority: 0,
        claimedBy: null,
        claimedUntil: null,
        enqueueSource: "MOVED",
        routedByRuleId: null,
        routedByRuleVersion: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        closedReason: null,
      });
    }
    return { ok: true, jobId: newJobId, queueKey: target.key };
  }

  if (usesWorkerKysely()) {
    await getWorkerDb().transaction().execute(async (trx) => {
      await trx.insertInto("ReviewDecision").values(decisionRow).execute();
      const closed = await trx.updateTable("ReviewJob")
        .set({ status: "CLOSED", closedAt: now, closedReason: "moved", claimedBy: null, claimedUntil: null, updatedAt: now })
        .where("id", "=", job.id).where("status", "=", "PENDING")
        .executeTakeFirst();
      if (Number(closed.numUpdatedRows) === 0) throw new Error("job_closed");
      await trx.updateTable("ReviewJobClaim")
        .set({ releasedAt: now, outcome: "released" })
        .where("jobId", "=", job.id).where("releasedAt", "is", null)
        .execute();
      await trx.insertInto("ReviewJob")
        .values({
          id: newJobId,
          queueId: target.id,
          subjectKind: job.subjectKind,
          subjectId: job.subjectId,
          caseId: job.caseId,
          status: "PENDING",
          priority: 0,
          enqueueSource: "MOVED",
          createdAt: now,
          updatedAt: now,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    });
    return { ok: true, jobId: newJobId, queueKey: target.key };
  }

  const { db } = await import("@/lib/db");
  await db.$transaction(async (tx) => {
    await tx.reviewDecision.create({ data: decisionRow });
    const closed = await tx.reviewJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "CLOSED", closedAt: now, closedReason: "moved", claimedBy: null, claimedUntil: null, updatedAt: now },
    });
    if (closed.count === 0) throw new Error("job_closed");
    await tx.reviewJobClaim.updateMany({
      where: { jobId: job.id, releasedAt: null },
      data: { releasedAt: now, outcome: "released" },
    });
    await tx.reviewJob.createMany({
      data: [
        {
          queueId: target.id,
          subjectKind: job.subjectKind,
          subjectId: job.subjectId,
          caseId: job.caseId,
          status: "PENDING",
          priority: 0,
          enqueueSource: "MOVED",
          createdAt: now,
          updatedAt: now,
        },
      ],
      skipDuplicates: true,
    });
  });
  return { ok: true, jobId: newJobId, queueKey: target.key };
}

// ---------------------------------------------------------------------------
// Summaries

export type ReviewQueueSummary = {
  key: string;
  name: string;
  description: string | null;
  subjectKind: ReviewSubjectKind | null;
  protected: boolean;
  sortOrder: number;
  pending: number;
  oldestCreatedAt: Date | null;
  pastFourHours: number;
  pastDay: number;
  heldByMe: number;
};

/**
 * Per visible queue: how many jobs wait, how old the oldest is, how many
 * arrived in the last four hours and the last day, and how many this
 * reviewer holds right now. Only ids and counts — nothing about a subject.
 */
export async function queueSummaries(
  viewer: { role: AdminRole; emailHash: string },
  now = new Date(),
): Promise<ReviewQueueSummary[]> {
  const queues = (await listReviewQueues()).filter((queue) => canSeeReviewQueue(viewer.role, queue));
  const fourHoursAgo = now.getTime() - 4 * 60 * 60_000;
  const dayAgo = now.getTime() - 24 * 60 * 60_000;

  let pendingJobs: Array<{ queueId: string; createdAt: Date; claimedBy: string | null; claimedUntil: Date | null }>;
  if (isDevNoDb()) {
    pendingJobs = [...reviewMemory().jobs.values()]
      .filter((job) => job.status === "PENDING")
      .map((job) => ({ queueId: job.queueId, createdAt: job.createdAt, claimedBy: job.claimedBy, claimedUntil: job.claimedUntil }));
  } else if (usesWorkerKysely()) {
    pendingJobs = await getWorkerDb().selectFrom("ReviewJob")
      .select(["queueId", "createdAt", "claimedBy", "claimedUntil"])
      .where("status", "=", "PENDING")
      .execute();
  } else {
    const { db } = await import("@/lib/db");
    pendingJobs = await db.reviewJob.findMany({
      where: { status: "PENDING" },
      select: { queueId: true, createdAt: true, claimedBy: true, claimedUntil: true },
    });
  }

  return queues.map((queue) => {
    const jobs = pendingJobs.filter((job) => job.queueId === queue.id);
    const created = jobs.map((job) => new Date(job.createdAt).getTime());
    return {
      key: queue.key,
      name: queue.name,
      description: queue.description,
      subjectKind: queue.subjectKind,
      protected: queue.protected,
      sortOrder: queue.sortOrder,
      pending: jobs.length,
      oldestCreatedAt: created.length ? new Date(Math.min(...created)) : null,
      pastFourHours: created.filter((time) => time >= fourHoursAgo).length,
      pastDay: created.filter((time) => time >= dayAgo).length,
      heldByMe: jobs.filter(
        (job) =>
          job.claimedBy === viewer.emailHash &&
          job.claimedUntil !== null &&
          new Date(job.claimedUntil).getTime() > now.getTime(),
      ).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Sync

export type ReviewSyncResult = {
  enqueued: number;
  closed: number;
  moved: number;
  kindsWithoutAdapters: ReviewSubjectKind[];
};

async function listPendingJobsOfKind(kind: ReviewSubjectKind): Promise<ReviewJobRow[]> {
  if (isDevNoDb()) {
    return [...reviewMemory().jobs.values()]
      .filter((job) => job.subjectKind === kind && job.status === "PENDING")
      .map(toJobRow);
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewJob").selectAll()
      .where("subjectKind", "=", kind).where("status", "=", "PENDING")
      .execute();
    return rows.map((row) => toJobRow(row as unknown as ReviewJobRow));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewJob.findMany({ where: { subjectKind: kind, status: "PENDING" } });
  return rows.map((row) => toJobRow(row as unknown as ReviewJobRow));
}

/**
 * Reconciles the jobs with the source of truth. The source tables stay
 * authoritative: subjects that need a human (the pages' own predicates,
 * through the adapters) get jobs, open jobs whose subject no longer needs
 * review are closed as resolved elsewhere, and the minor check runs before
 * anything else — a subject under a "Possible minor" label is moved to
 * minor-hold whatever else is true, and a label cleared through the
 * existing flow brings the subject back to its kind's queue.
 */
export async function syncReviewJobs(now = new Date()): Promise<ReviewSyncResult> {
  await ensureSystemQueues();
  const result: ReviewSyncResult = { enqueued: 0, closed: 0, moved: 0, kindsWithoutAdapters: [] };
  const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);

  for (const kind of REVIEW_SUBJECT_KINDS) {
    const adapter = await getReviewAdapter(kind);
    if (!adapter) {
      result.kindsWithoutAdapters.push(kind);
      continue;
    }
    const open = new Map<string, ReviewSubjectState>();
    for (const subject of await adapter.listOpenSubjects()) open.set(subject.subjectId, subject);

    const openJobs = new Map<string, ReviewJobRow>();
    for (const job of await listPendingJobsOfKind(kind)) openJobs.set(job.subjectId, job);

    for (const [subjectId, job] of openJobs) {
      const state = open.get(subjectId);
      if (!state) {
        if (await closeJobAsResolvedElsewhere(job, now)) result.closed += 1;
        continue;
      }
      const desired = state.minorHold ? minorHold : await defaultQueueForKind(kind);
      if (desired && job.queueId !== desired.id) {
        if (await moveOpenJobToQueue(job, desired, now)) result.moved += 1;
      }
    }

    for (const [subjectId, state] of open) {
      if (openJobs.has(subjectId)) continue;
      const queue = state.minorHold ? minorHold : await defaultQueueForKind(kind);
      if (!queue) continue;
      try {
        const job = await createJob({
          queueId: queue.id,
          subjectKind: kind,
          subjectId,
          caseId: state.caseId,
          enqueueSource: "SYNC",
          now,
        });
        openJobs.set(subjectId, job);
        result.enqueued += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }
  return result;
}

/**
 * Closes a job whose subject was decided outside the console: a
 * ReviewDecision by the system decider and closedReason resolved_elsewhere.
 * A job someone else decided first is left to that decision.
 */
async function closeJobAsResolvedElsewhere(job: ReviewJobRow, now: Date): Promise<boolean> {
  const decisionRow = {
    id: randomUUID(),
    jobId: job.id,
    queueId: job.queueId,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    caseId: job.caseId,
    reviewerEmailHash: SYSTEM_REVIEWER,
    decision: "close_stale",
    reasonCode: null,
    reasonNote: null,
    claimedAt: null,
    decidedAt: now,
    auditEventId: null,
  };

  if (isDevNoDb()) {
    const memory = reviewMemory();
    if (memory.decisions.has(job.id)) return false;
    const stored = memory.jobs.get(job.id);
    if (!stored || stored.status !== "PENDING") return false;
    memory.decisions.set(job.id, decisionRow);
    stored.status = "CLOSED";
    stored.closedAt = now;
    stored.closedReason = CLOSE_REASON_RESOLVED_ELSEWHERE;
    stored.claimedBy = null;
    stored.claimedUntil = null;
    stored.updatedAt = now;
    closeOpenClaims(memory, job.id, now, "released");
    return true;
  }

  if (usesWorkerKysely()) {
    try {
      await getWorkerDb().transaction().execute(async (trx) => {
        const closed = await trx.updateTable("ReviewJob")
          .set({ status: "CLOSED", closedAt: now, closedReason: CLOSE_REASON_RESOLVED_ELSEWHERE, claimedBy: null, claimedUntil: null, updatedAt: now })
          .where("id", "=", job.id).where("status", "=", "PENDING")
          .executeTakeFirst();
        if (Number(closed.numUpdatedRows) === 0) throw new Error("already_closed");
        await trx.insertInto("ReviewDecision").values(decisionRow).execute();
        await trx.updateTable("ReviewJobClaim")
          .set({ releasedAt: now, outcome: "released" })
          .where("jobId", "=", job.id).where("releasedAt", "is", null)
          .execute();
      });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      if (err instanceof Error && err.message === "already_closed") return false;
      throw err;
    }
  }

  const { db } = await import("@/lib/db");
  try {
    await db.$transaction(async (tx) => {
      const closed = await tx.reviewJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "CLOSED", closedAt: now, closedReason: CLOSE_REASON_RESOLVED_ELSEWHERE, claimedBy: null, claimedUntil: null, updatedAt: now },
      });
      if (closed.count === 0) throw new Error("already_closed");
      await tx.reviewDecision.create({ data: decisionRow });
      await tx.reviewJobClaim.updateMany({
        where: { jobId: job.id, releasedAt: null },
        data: { releasedAt: now, outcome: "released" },
      });
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    if (err instanceof Error && err.message === "already_closed") return false;
    throw err;
  }
}

let lastLazySyncAt = 0;

/**
 * The lazy sync for page loads: at most once per 30 seconds per isolate, so
 * a queue page is never more than half a minute behind the source tables
 * without paying the sync on every request. A failure logs a fixed code
 * and waits for the next window; the maintenance cron is the reliable run.
 */
export async function maybeSyncReviewJobs(now = new Date()): Promise<void> {
  if (now.getTime() - lastLazySyncAt < SYNC_THROTTLE_MS) return;
  lastLazySyncAt = now.getTime();
  try {
    await syncReviewJobs(now);
  } catch (err) {
    console.error("review_job_sync_failed", err instanceof Error ? err.message : err);
  }
}
