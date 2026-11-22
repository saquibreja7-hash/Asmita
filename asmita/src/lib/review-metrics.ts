import { sql } from "kysely";
import { listReviewQueues, type ReviewQueueRow } from "@/lib/review-jobs";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Review metrics (review-console-spec.md, WP145): jobs created per day or
 * week bucket, what is open now per queue with the oldest item, median and
 * p90 time from a job's creation to its decision, median handle time (claim
 * to decision), decisions by queue and by reviewer, skips by queue, and
 * jobs closed as resolved elsewhere. Counts, ages and hashes only — no
 * subject data, no addresses; a reviewer is rendered by the page as a
 * handle, never an email.
 *
 * Backends follow the module pattern. The database paths do the grouping in
 * Postgres (date_trunc buckets and group-bys, one statement per metric);
 * the memory backend computes the same maths over the dev store. Medians,
 * percentiles and the small-sample rule are shared by every backend, so
 * the page can never show a figure the fixtures did not test.
 */

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export type MetricWindow = 7 | 30 | 90;
export const METRIC_WINDOWS: readonly MetricWindow[] = [7, 30, 90];
export type MetricBucket = "day" | "week";
export const METRIC_BUCKETS: readonly MetricBucket[] = ["day", "week"];

/**
 * Under this many samples the page shows "Not enough data" instead of a
 * misleading median or percentile (spec WP145).
 */
export const MIN_METRIC_SAMPLES = 5;

export type BucketCount = { bucketStart: string; count: number };

export type QueueOpen = {
  queueId: string;
  queueKey: string;
  queueName: string;
  count: number;
  /** The oldest open job's creation time; null when nothing waits. */
  oldestCreatedAt: string | null;
};

export type QueueMetric = { queueId: string; queueKey: string; queueName: string; count: number };

export type ReviewMetrics = {
  windowDays: MetricWindow;
  bucket: MetricBucket;
  windowStart: string;
  /** Jobs created per bucket, continuous (empty buckets included), oldest first. */
  jobsCreatedPerBucket: BucketCount[];
  openNow: number;
  openPerQueue: QueueOpen[];
  /** Job created → decided, seconds. Null figures mean "Not enough data". */
  timeToDecision: { samples: number; medianSeconds: number | null; p90Seconds: number | null };
  /** Claim → decision, seconds, for decisions made from a held claim. */
  handleTime: { samples: number; medianSeconds: number | null };
  decisionsByQueue: QueueMetric[];
  decisionsByReviewer: Array<{ reviewerEmailHash: string; count: number }>;
  skipsByQueue: QueueMetric[];
  resolvedElsewhere: number;
};

export function parseMetricWindow(raw: string | undefined): MetricWindow {
  const value = Number(raw);
  return METRIC_WINDOWS.includes(value as MetricWindow) ? (value as MetricWindow) : 30;
}

export function parseMetricBucket(raw: string | undefined): MetricBucket {
  return raw === "day" || raw === "week" ? raw : "day";
}

// ---------------------------------------------------------------------------
// The maths every backend shares.

export function medianSeconds(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(value);
}

/** Nearest-rank p90: the ceil(0.9 × n)-th smallest value. */
export function p90Seconds(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(0.9 * sorted.length));
  return Math.round(sorted[rank - 1]!);
}

/** date_trunc('day'|'week') in UTC, matching the Postgres bucket edges. */
function truncBucket(value: Date | string, bucket: MetricBucket): Date {
  const date = new Date(value);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (bucket === "day") return new Date(dayStart);
  // Postgres weeks start Monday.
  const weekday = (new Date(dayStart).getUTCDay() + 6) % 7;
  return new Date(dayStart - weekday * 86_400_000);
}

function continuousBuckets(from: Date, to: Date, bucket: MetricBucket): Date[] {
  const step = bucket === "day" ? 86_400_000 : 7 * 86_400_000;
  const buckets: Date[] = [];
  for (let time = truncBucket(from, bucket).getTime(); time <= truncBucket(to, bucket).getTime(); time += step) {
    buckets.push(new Date(time));
  }
  return buckets;
}

function toQueueMetrics(counts: Array<{ queueId: string; count: number }>, queues: ReviewQueueRow[]): QueueMetric[] {
  const byId = new Map(queues.map((queue) => [queue.id, queue]));
  return counts
    .flatMap((entry) => {
      const queue = byId.get(entry.queueId);
      if (!queue) return [];
      return [{ queueId: entry.queueId, queueKey: queue.key, queueName: queue.name, count: entry.count }];
    })
    .sort((left, right) => right.count - left.count || left.queueName.localeCompare(right.queueName));
}

// ---------------------------------------------------------------------------
// Queries

type RawGroup = Record<string, unknown>;

function groupCount(rows: RawGroup[], key: string): Array<{ queueId: string; count: number }> {
  return rows.map((row) => ({ queueId: String(row[key]), count: Number(row.n) }));
}

/**
 * The metrics for one window. Every figure comes from the jobs, decisions,
 * claims and skips WP140 already stores; nothing here decides, dispatches
 * or reads subject text.
 */
export async function reviewMetrics(input: {
  days: MetricWindow;
  bucket: MetricBucket;
  now?: Date;
}): Promise<ReviewMetrics> {
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - input.days * 86_400_000);
  const queues = await listReviewQueues();

  let createdPerBucket: BucketCount[];
  let openRows: Array<{ queueId: string; count: number; oldest: Date | string | null }>;
  let decisionDurations: number[];
  let handleDurations: number[];
  let decisionsByQueue: Array<{ queueId: string; count: number }>;
  let decisionsByReviewerRows: Array<{ reviewerEmailHash: string; count: number }>;
  let skipsByQueue: Array<{ queueId: string; count: number }>;
  let resolvedElsewhere: number;

  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    const memory = reviewMemory();
    const jobs = [...memory.jobs.values()];
    const decisions = [...memory.decisions.values()];
    const inWindow = (value: Date | string | null) => value !== null && new Date(value).getTime() >= windowStart.getTime();

    const bucketCounts = new Map<string, number>();
    for (const job of jobs) {
      if (!inWindow(job.createdAt)) continue;
      const key = truncBucket(job.createdAt, input.bucket).toISOString();
      bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
    }
    createdPerBucket = continuousBuckets(windowStart, now, input.bucket).map((start) => ({
      bucketStart: start.toISOString(),
      count: bucketCounts.get(start.toISOString()) ?? 0,
    }));

    const open = jobs.filter((job) => job.status === "PENDING");
    const openByQueue = new Map<string, { count: number; oldest: Date | null }>();
    for (const job of open) {
      const entry = openByQueue.get(job.queueId) ?? { count: 0, oldest: null };
      entry.count += 1;
      if (!entry.oldest || job.createdAt.getTime() < entry.oldest.getTime()) entry.oldest = job.createdAt;
      openByQueue.set(job.queueId, entry);
    }
    openRows = [...openByQueue.entries()].map(([queueId, entry]) => ({ queueId, count: entry.count, oldest: entry.oldest }));

    const jobById = new Map(jobs.map((job) => [job.id, job]));
    decisionDurations = decisions
      .filter((decision) => inWindow(decision.decidedAt))
      .flatMap((decision) => {
        const job = jobById.get(decision.jobId);
        if (!job) return [];
        return [Math.max(0, (new Date(decision.decidedAt).getTime() - job.createdAt.getTime()) / 1000)];
      });
    handleDurations = decisions
      .filter((decision) => inWindow(decision.decidedAt) && decision.claimedAt !== null)
      .map((decision) => Math.max(0, (new Date(decision.decidedAt).getTime() - new Date(decision.claimedAt!).getTime()) / 1000));

    const decisionsByQueueMap = new Map<string, number>();
    for (const decision of decisions) {
      if (!inWindow(decision.decidedAt)) continue;
      decisionsByQueueMap.set(decision.queueId, (decisionsByQueueMap.get(decision.queueId) ?? 0) + 1);
    }
    decisionsByQueue = [...decisionsByQueueMap.entries()].map(([queueId, count]) => ({ queueId, count }));

    const byReviewer = new Map<string, number>();
    for (const decision of decisions) {
      if (!inWindow(decision.decidedAt)) continue;
      byReviewer.set(decision.reviewerEmailHash, (byReviewer.get(decision.reviewerEmailHash) ?? 0) + 1);
    }
    decisionsByReviewerRows = [...byReviewer.entries()].map(([reviewerEmailHash, count]) => ({ reviewerEmailHash, count }));

    const skipsByQueueMap = new Map<string, number>();
    for (const claim of memory.claims) {
      if (claim.outcome !== "skipped" || !inWindow(claim.claimedAt)) continue;
      const job = jobById.get(claim.jobId);
      if (!job) continue;
      skipsByQueueMap.set(job.queueId, (skipsByQueueMap.get(job.queueId) ?? 0) + 1);
    }
    skipsByQueue = [...skipsByQueueMap.entries()].map(([queueId, count]) => ({ queueId, count }));

    resolvedElsewhere = jobs.filter(
      (job) => job.closedReason === "resolved_elsewhere" && job.closedAt !== null && inWindow(job.closedAt),
    ).length;
  } else if (usesWorkerKysely()) {
    const db = getWorkerDb();
    const bucketRows = (
      await sql<RawGroup>`SELECT date_trunc(${input.bucket}, "createdAt") AS "bucket", count(*)::int AS "n"
        FROM "ReviewJob" WHERE "createdAt" >= ${windowStart}
        GROUP BY 1 ORDER BY 1`.execute(db)
    ).rows;
    const bucketCounts = new Map<string, number>(
      bucketRows.map((row) => [truncBucket(row.bucket as Date, input.bucket).toISOString(), Number(row.n)]),
    );
    createdPerBucket = continuousBuckets(windowStart, now, input.bucket).map((start) => ({
      bucketStart: start.toISOString(),
      count: bucketCounts.get(start.toISOString()) ?? 0,
    }));

    openRows = (
      await sql<RawGroup>`SELECT "queueId", count(*)::int AS "n", min("createdAt") AS "oldest"
        FROM "ReviewJob" WHERE "status" = 'PENDING' GROUP BY "queueId"`.execute(db)
    ).rows.map((row) => ({ queueId: String(row.queueId), count: Number(row.n), oldest: (row.oldest as Date) ?? null }));

    decisionDurations = (
      await sql<RawGroup>`SELECT EXTRACT(EPOCH FROM (d."decidedAt" - j."createdAt"))::double precision AS "secs"
        FROM "ReviewDecision" d JOIN "ReviewJob" j ON j."id" = d."jobId"
        WHERE d."decidedAt" >= ${windowStart}`.execute(db)
    ).rows.map((row) => Number(row.secs));
    handleDurations = (
      await sql<RawGroup>`SELECT EXTRACT(EPOCH FROM ("decidedAt" - "claimedAt"))::double precision AS "secs"
        FROM "ReviewDecision"
        WHERE "decidedAt" >= ${windowStart} AND "claimedAt" IS NOT NULL`.execute(db)
    ).rows.map((row) => Number(row.secs));

    decisionsByQueue = groupCount(
      (await sql<RawGroup>`SELECT "queueId", count(*)::int AS "n" FROM "ReviewDecision"
        WHERE "decidedAt" >= ${windowStart} GROUP BY "queueId"`.execute(db)).rows,
      "queueId",
    );
    decisionsByReviewerRows = (
      await sql<RawGroup>`SELECT "reviewerEmailHash", count(*)::int AS "n" FROM "ReviewDecision"
        WHERE "decidedAt" >= ${windowStart} GROUP BY "reviewerEmailHash"`.execute(db)
    ).rows.map((row) => ({ reviewerEmailHash: String(row.reviewerEmailHash), count: Number(row.n) }));
    skipsByQueue = groupCount(
      (
        await sql<RawGroup>`SELECT j."queueId", count(*)::int AS "n"
          FROM "ReviewJobClaim" c JOIN "ReviewJob" j ON j."id" = c."jobId"
          WHERE c."outcome" = 'skipped' AND c."claimedAt" >= ${windowStart}
          GROUP BY j."queueId"`.execute(db)
      ).rows,
      "queueId",
    );
    resolvedElsewhere = Number(
      (
        await sql<RawGroup>`SELECT count(*)::int AS "n" FROM "ReviewJob"
          WHERE "closedReason" = 'resolved_elsewhere' AND "closedAt" >= ${windowStart}`.execute(db)
      ).rows[0]?.n ?? 0,
    );
  } else {
    const { db } = await import("@/lib/db");
    const bucketRows = await db.$queryRaw<RawGroup[]>`
      SELECT date_trunc(${input.bucket}, "createdAt") AS "bucket", count(*)::int AS "n"
      FROM "ReviewJob" WHERE "createdAt" >= ${windowStart}
      GROUP BY 1 ORDER BY 1`;
    const bucketCounts = new Map<string, number>(
      bucketRows.map((row) => [truncBucket(row.bucket as Date, input.bucket).toISOString(), Number(row.n)]),
    );
    createdPerBucket = continuousBuckets(windowStart, now, input.bucket).map((start) => ({
      bucketStart: start.toISOString(),
      count: bucketCounts.get(start.toISOString()) ?? 0,
    }));

    openRows = (await db.$queryRaw<RawGroup[]>`
      SELECT "queueId", count(*)::int AS "n", min("createdAt") AS "oldest"
      FROM "ReviewJob" WHERE "status" = 'PENDING' GROUP BY "queueId"`)
      .map((row) => ({ queueId: String(row.queueId), count: Number(row.n), oldest: (row.oldest as Date) ?? null }));

    decisionDurations = (await db.$queryRaw<RawGroup[]>`
      SELECT EXTRACT(EPOCH FROM (d."decidedAt" - j."createdAt"))::double precision AS "secs"
      FROM "ReviewDecision" d JOIN "ReviewJob" j ON j."id" = d."jobId"
      WHERE d."decidedAt" >= ${windowStart}`).map((row) => Number(row.secs));
    handleDurations = (await db.$queryRaw<RawGroup[]>`
      SELECT EXTRACT(EPOCH FROM ("decidedAt" - "claimedAt"))::double precision AS "secs"
      FROM "ReviewDecision"
      WHERE "decidedAt" >= ${windowStart} AND "claimedAt" IS NOT NULL`).map((row) => Number(row.secs));

    decisionsByQueue = groupCount(await db.$queryRaw<RawGroup[]>`
      SELECT "queueId", count(*)::int AS "n" FROM "ReviewDecision"
      WHERE "decidedAt" >= ${windowStart} GROUP BY "queueId"`, "queueId");
    decisionsByReviewerRows = (await db.$queryRaw<RawGroup[]>`
      SELECT "reviewerEmailHash", count(*)::int AS "n" FROM "ReviewDecision"
      WHERE "decidedAt" >= ${windowStart} GROUP BY "reviewerEmailHash"`)
      .map((row) => ({ reviewerEmailHash: String(row.reviewerEmailHash), count: Number(row.n) }));
    skipsByQueue = groupCount(await db.$queryRaw<RawGroup[]>`
      SELECT j."queueId", count(*)::int AS "n"
      FROM "ReviewJobClaim" c JOIN "ReviewJob" j ON j."id" = c."jobId"
      WHERE c."outcome" = 'skipped' AND c."claimedAt" >= ${windowStart}
      GROUP BY j."queueId"`, "queueId");
    resolvedElsewhere = Number(
      (await db.$queryRaw<RawGroup[]>`
        SELECT count(*)::int AS "n" FROM "ReviewJob"
        WHERE "closedReason" = 'resolved_elsewhere' AND "closedAt" >= ${windowStart}`)[0]?.n ?? 0,
    );
  }

  const timeSamples = decisionDurations.length >= MIN_METRIC_SAMPLES ? decisionDurations : [];
  const handleSamples = handleDurations.length >= MIN_METRIC_SAMPLES ? handleDurations : [];
  const byId = new Map(queues.map((queue) => [queue.id, queue]));

  return {
    windowDays: input.days,
    bucket: input.bucket,
    windowStart: windowStart.toISOString(),
    jobsCreatedPerBucket: createdPerBucket,
    openNow: openRows.reduce((total, row) => total + row.count, 0),
    openPerQueue: openRows
      .flatMap((row) => {
        const queue = byId.get(row.queueId);
        if (!queue) return [];
        return [{
          queueId: row.queueId,
          queueKey: queue.key,
          queueName: queue.name,
          count: row.count,
          oldestCreatedAt: row.oldest ? new Date(row.oldest).toISOString() : null,
        }];
      })
      .sort((left, right) => right.count - left.count || left.queueName.localeCompare(right.queueName)),
    timeToDecision: {
      samples: decisionDurations.length,
      medianSeconds: medianSeconds(timeSamples),
      p90Seconds: p90Seconds(timeSamples),
    },
    handleTime: {
      samples: handleDurations.length,
      medianSeconds: medianSeconds(handleSamples),
    },
    decisionsByQueue: toQueueMetrics(decisionsByQueue, queues),
    decisionsByReviewer: decisionsByReviewerRows.sort((left, right) => right.count - left.count),
    skipsByQueue: toQueueMetrics(skipsByQueue, queues),
    resolvedElsewhere,
  };
}
