import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP145 (review-console-spec.md): the review metrics on the memory backend,
// on fixed fixtures pinned to one clock, so every number is exact: jobs
// created per day and week bucket (date_trunc edges, the window boundary,
// empty buckets kept), what is open now per queue with the oldest item,
// median and p90 time from creation to decision, median handle time, the
// small-sample rule (under five decisions the figures are null, the sample
// count is not), decisions by queue and by reviewer, skips by queue, and
// jobs closed as resolved elsewhere. Invented ids only; nothing here is
// survivor data.

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  MIN_METRIC_SAMPLES,
  medianSeconds,
  p90Seconds,
  parseMetricBucket,
  parseMetricWindow,
  reviewMetrics,
} from "@/lib/review-metrics";
import { ensureSystemQueues, resetReviewMemory, reviewMemory, type ReviewJobRow } from "@/lib/review-jobs";

const NOW = new Date("2026-11-22T12:00:00Z");
const LINKS_ID = "review-queue-links";
const FINGERPRINTS_ID = "review-queue-fingerprints";

let counter = 0;
function id(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

function seedJob(overrides: Partial<ReviewJobRow> = {}): ReviewJobRow {
  const job: ReviewJobRow = {
    id: id("job"),
    queueId: LINKS_ID,
    subjectKind: "FLAGGED_LINK",
    subjectId: id("url"),
    caseId: `case-${counter}`,
    status: "CLOSED",
    priority: 0,
    claimedBy: null,
    claimedUntil: null,
    enqueueSource: "SYNC",
    routedByRuleId: null,
    routedByRuleVersion: null,
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: NOW,
    closedReason: "approve",
    ...overrides,
  };
  reviewMemory().jobs.set(job.id, job);
  return job;
}

/** A decision for a job, keyed by jobId exactly as decideJob stores it. */
function seedDecision(
  job: ReviewJobRow,
  overrides: { reviewerEmailHash?: string; decidedAt?: Date; claimedAt?: Date | null } = {},
) {
  reviewMemory().decisions.set(job.id, {
    id: id("decision"),
    jobId: job.id,
    queueId: job.queueId,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    caseId: job.caseId,
    reviewerEmailHash: overrides.reviewerEmailHash ?? "hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    decision: "approve",
    reasonCode: null,
    reasonNote: null,
    claimedAt: overrides.claimedAt ?? null,
    decidedAt: overrides.decidedAt ?? NOW,
    auditEventId: null,
  });
}

function seedClaim(jobId: string, claimedAt: Date, outcome: "skipped" | "released" | "decided" | "expired") {
  reviewMemory().claims.push({
    id: id("claim"),
    jobId,
    reviewerEmailHash: "hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    claimedAt,
    releasedAt: claimedAt,
    outcome,
  });
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  resetReviewMemory();
  await ensureSystemQueues();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the shared maths", () => {
  it("medians over odd and even samples, and refuses an empty set", () => {
    expect(medianSeconds([30, 10, 20])).toBe(20);
    expect(medianSeconds([40, 10, 30, 20])).toBe(25);
    expect(medianSeconds([])).toBeNull();
  });

  it("p90 is the nearest-rank percentile", () => {
    expect(p90Seconds([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(90);
    expect(p90Seconds([1, 2, 3, 4, 100])).toBe(100);
    expect(p90Seconds([])).toBeNull();
  });

  it("parses the window and bucket, defaulting to 30 days by day", () => {
    expect(parseMetricWindow("7")).toBe(7);
    expect(parseMetricWindow("90")).toBe(90);
    expect(parseMetricWindow("12")).toBe(30);
    expect(parseMetricWindow(undefined)).toBe(30);
    expect(parseMetricBucket("week")).toBe("week");
    expect(parseMetricBucket("month")).toBe("day");
    expect(MIN_METRIC_SAMPLES).toBe(5);
  });
});

describe("reviewMetrics on fixed fixtures", () => {
  it("counts every figure exactly, window boundaries included", async () => {
    // Two jobs still open: the window boundary itself and the fingerprints queue.
    seedJob({ id: "job-old", status: "PENDING", closedAt: null, closedReason: null, createdAt: new Date("2026-11-15T06:00:00Z") });
    seedJob({
      id: "job-open-fp",
      queueId: FINGERPRINTS_ID,
      subjectKind: "FINGERPRINT",
      status: "PENDING",
      closedAt: null,
      closedReason: null,
      createdAt: new Date("2026-11-22T05:00:00Z"),
    });

    // Five decided jobs, all decided at NOW, each from a known creation time:
    // created-to-decided [129600, 108000, 86400, 64800, 21600] seconds and
    // handle times [60, 120, 180, 240, 300] seconds.
    const fixtures: Array<[string, string, number]> = [
      ["d1", "2026-11-21T00:00:00Z", 60],
      ["d2", "2026-11-21T06:00:00Z", 120],
      ["d3", "2026-11-21T12:00:00Z", 180],
      ["d4", "2026-11-21T18:00:00Z", 240],
      ["d5", "2026-11-22T06:00:00Z", 300],
    ];
    for (const [jobId, created, handle] of fixtures) {
      const job = seedJob({ id: jobId, createdAt: new Date(created) });
      seedDecision(job, {
        decidedAt: NOW,
        claimedAt: new Date(NOW.getTime() - handle * 1000),
        reviewerEmailHash: jobId === "d5" ? "hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" : "hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
    }

    // A decision outside the window changes nothing.
    const outside = seedJob({ id: "job-outside", createdAt: new Date("2026-11-09T00:00:00Z") });
    seedDecision(outside, { decidedAt: new Date("2026-11-10T00:00:00Z") });

    // Skips: two on links, one on fingerprints, one outside the window.
    seedClaim("job-old", new Date("2026-11-22T08:00:00Z"), "skipped");
    seedClaim("d5", new Date("2026-11-22T09:00:00Z"), "skipped");
    seedClaim("job-open-fp", new Date("2026-11-22T09:30:00Z"), "skipped");
    seedClaim("d1", new Date("2026-11-01T08:00:00Z"), "skipped");

    // One job closed as resolved elsewhere inside the window, one outside.
    seedJob({ id: "job-resolved", closedReason: "resolved_elsewhere", createdAt: new Date("2026-11-19T00:00:00Z"), closedAt: new Date("2026-11-20T00:00:00Z") });
    seedJob({ id: "job-resolved-old", closedReason: "resolved_elsewhere", createdAt: new Date("2026-10-30T00:00:00Z"), closedAt: new Date("2026-11-01T00:00:00Z") });

    const metrics = await reviewMetrics({ days: 7, bucket: "day", now: NOW });

    // Jobs created: four on the 21st, two on the 22nd, nothing on the days
    // between, and the 15th stays at zero because the window begins at noon.
    expect(metrics.jobsCreatedPerBucket).toHaveLength(8);
    expect(metrics.jobsCreatedPerBucket.map((entry) => [entry.bucketStart.slice(0, 10), entry.count])).toEqual([
      ["2026-11-15", 0],
      ["2026-11-16", 0],
      ["2026-11-17", 0],
      ["2026-11-18", 0],
      ["2026-11-19", 1],
      ["2026-11-20", 0],
      ["2026-11-21", 4],
      ["2026-11-22", 2],
    ]);

    expect(metrics.openNow).toBe(2);
    expect(metrics.openPerQueue).toEqual([
      { queueId: FINGERPRINTS_ID, queueKey: "fingerprints", queueName: "Fingerprints", count: 1, oldestCreatedAt: "2026-11-22T05:00:00.000Z" },
      { queueId: LINKS_ID, queueKey: "links", queueName: "Flagged links", count: 1, oldestCreatedAt: "2026-11-15T06:00:00.000Z" },
    ]);

    expect(metrics.timeToDecision).toEqual({ samples: 5, medianSeconds: 86400, p90Seconds: 129600 });
    expect(metrics.handleTime).toEqual({ samples: 5, medianSeconds: 180 });
    expect(metrics.decisionsByQueue).toEqual([{ queueId: LINKS_ID, queueKey: "links", queueName: "Flagged links", count: 5 }]);
    expect(metrics.decisionsByReviewer).toEqual([
      { reviewerEmailHash: "hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", count: 4 },
      { reviewerEmailHash: "hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", count: 1 },
    ]);
    expect(metrics.skipsByQueue).toEqual([
      { queueId: LINKS_ID, queueKey: "links", queueName: "Flagged links", count: 2 },
      { queueId: FINGERPRINTS_ID, queueKey: "fingerprints", queueName: "Fingerprints", count: 1 },
    ]);
    expect(metrics.resolvedElsewhere).toBe(1);
  });

  it("shows no figure under five samples, but reports the sample count", async () => {
    for (const created of ["2026-11-21T00:00:00Z", "2026-11-21T12:00:00Z", "2026-11-22T00:00:00Z"]) {
      const job = seedJob({ createdAt: new Date(created) });
      seedDecision(job, { decidedAt: NOW, claimedAt: new Date(NOW.getTime() - 60_000) });
    }
    const metrics = await reviewMetrics({ days: 7, bucket: "day", now: NOW });
    expect(metrics.timeToDecision).toEqual({ samples: 3, medianSeconds: null, p90Seconds: null });
    expect(metrics.handleTime).toEqual({ samples: 3, medianSeconds: null });
    // Counts are counts: they still show, small or not.
    expect(metrics.decisionsByQueue[0]!.count).toBe(3);
    expect(metrics.resolvedElsewhere).toBe(0);
  });

  it("buckets weeks like Postgres date_trunc: Monday edges", async () => {
    // The 16th and 18th of November 2026 are in the week starting Monday
    // the 16th; the window itself starts inside the week of the 9th.
    seedJob({ id: "w1", createdAt: new Date("2026-11-16T10:00:00Z") });
    seedJob({ id: "w2", createdAt: new Date("2026-11-18T10:00:00Z") });
    const metrics = await reviewMetrics({ days: 7, bucket: "week", now: NOW });
    expect(metrics.jobsCreatedPerBucket).toHaveLength(2);
    expect(metrics.jobsCreatedPerBucket.map((entry) => [entry.bucketStart.slice(0, 10), entry.count])).toEqual([
      ["2026-11-09", 0],
      ["2026-11-16", 2],
    ]);
  });
});
