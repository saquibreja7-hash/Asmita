import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP140 on the Prisma (Node) path, against a mocked client in the style of
// the other Prisma tests. What the spec makes the real test: the claim is
// ONE raw statement against Postgres with the ReviewSkip subquery and FOR
// UPDATE SKIP LOCKED (captured with its parameters), a decision commits its
// ReviewDecision, its job closure and its claim closure in one transaction,
// the sync closes resolved-elsewhere jobs behind a PENDING guard, a retried
// decide returns the earlier decision, and the queue's reason flags are
// enforced on the server. The subjects come from stub adapters; the
// adapters' own database paths are exercised by their routes' tests.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    reviewDecision: { create: fn() },
    reviewJob: { updateMany: fn(), createMany: fn() },
    reviewJobClaim: { updateMany: fn() },
  };
  const self = {
    reviewQueue: { upsert: fn(), findUnique: fn(), findMany: fn() },
    reviewJob: { create: fn(), findUnique: fn(), findFirst: fn(), findMany: fn(), updateMany: fn() },
    reviewDecision: { create: fn(), findUnique: fn(), findMany: fn() },
    reviewJobClaim: { create: fn(), findFirst: fn(), updateMany: fn() },
    reviewSkip: { upsert: fn() },
    // WP144 queue access: the visibility checks read these.
    reviewQueueAccess: { findMany: fn(), create: fn(), deleteMany: fn() },
    // WP142 reasons: the seeded create-only upsert, and the code lookup
    // decideJob validates a picked reason with.
    reviewReason: { upsert: fn(), findUnique: fn(), findMany: fn() },
    // WP143 routing: the rules the sync asks about per kind (empty here —
    // these tests exercise the queue machinery, the routing tests their
    // own), the append-only version rows, and the deduped routing log.
    reviewRoutingRule: { findMany: fn(), findUnique: fn(), create: fn(), update: fn(), count: fn() },
    reviewRoutingRuleVersion: { findMany: fn(), create: fn() },
    reviewRoutingLog: { findMany: fn(), createMany: fn(), create: fn(), deleteMany: fn() },
    // WP145 decisions log: the case lookups (reference → id, id → reference).
    case: { findUnique: fn() },
    $queryRaw: fn(),
    $transaction: fn(),
    __tx: tx,
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("worker path must not run here"); } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { SYSTEM_REVIEW_QUEUES, MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { SYSTEM_REVIEW_REASONS } from "@/lib/review-reason-seeds";
import { registerReviewAdapter, resetReviewAdapters, type ReviewAdapter } from "@/lib/review-adapters";
import {
  claimNextJob,
  decideJob,
  ensureSystemQueues,
  moveJob,
  resetReviewMemory,
  skipJob,
  syncReviewJobs,
} from "@/lib/review-jobs";
import { reviewMetrics } from "@/lib/review-metrics";
import { listDecisionLogPage } from "@/lib/review-decisions-log";
import { decryptField } from "@/lib/encryption";

const NOW = new Date("2026-11-22T10:00:00Z");
const MINOR_HOLD_ID = SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === MINOR_HOLD_QUEUE_KEY)!.id;
const LINKS_QUEUE = SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === "links")!;

function seedQueueRow() {
  // Both lookups land here: by id (the job's queue) and by key (the requeue).
  db.reviewQueue.findUnique.mockImplementation(async (args: { where: { id?: string; key?: string } }) =>
    SYSTEM_REVIEW_QUEUES.find((queue) => queue.id === args.where.id || queue.key === args.where.key) ?? null,
  );
  db.reviewQueue.findMany.mockResolvedValue(SYSTEM_REVIEW_QUEUES as never);
  // WP142: the seeded reasons answer the code lookup decideJob makes, and
  // the create-only seeding upserts every seed with an empty update.
  db.reviewReason.findUnique.mockImplementation(
    async (args: { where: { queueKey_decision_code: { queueKey: string; decision: string; code: string } } }) => {
      const { queueKey, decision, code } = args.where.queueKey_decision_code;
      const seed = SYSTEM_REVIEW_REASONS.find(
        (reason) => reason.queueKey === queueKey && reason.decision === decision && reason.code === code,
      );
      return seed ? { id: `reason-${seed.code}`, ...seed, active: true, createdAt: NOW } : null;
    },
  );
  db.reviewReason.upsert.mockResolvedValue(null);
}

function seedJob(overrides: Record<string, unknown> = {}) {
  const job = {
    id: "job-1",
    queueId: LINKS_QUEUE.id,
    subjectKind: "FLAGGED_LINK",
    subjectId: "url-1",
    caseId: "case-1",
    status: "PENDING",
    priority: 0,
    claimedBy: null,
    claimedUntil: null,
    enqueueSource: "SYNC",
    routedByRuleId: null,
    routedByRuleVersion: null,
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: null,
    closedReason: null,
    ...overrides,
  };
  db.reviewJob.findUnique.mockResolvedValue(job as never);
  db.reviewJob.findFirst.mockResolvedValue(job as never);
  // listPendingJobsOfKind asks per kind; answer only for the seeded kind.
  db.reviewJob.findMany.mockImplementation(async (args: { where?: { subjectKind?: string } }) =>
    args.where?.subjectKind === job.subjectKind ? [job] : [],
  );
  return job;
}

/** A stub adapter per kind, so the queue machinery is tested on its own. */
function stubAdapter(kind: "FLAGGED_LINK" | "FINDING"): ReviewAdapter {
  return {
    kind,
    permission: "cases:review",
    decisions: [
      { code: "approve", label: "Approve", reasonKind: "approve" },
      { code: "reject", label: "Reject", reasonKind: "reject" },
    ],
    listOpenSubjects: async () => [],
    subjectNeedsReview: async () => null,
    decide: vi.fn(async (): Promise<import("@/lib/review-adapters").ReviewAdapterOutcome> => ({ ok: true, resolved: true })),
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  resetReviewMemory();
  resetReviewAdapters();
  vi.clearAllMocks();
  seedQueueRow();
  db.reviewDecision.findUnique.mockResolvedValue(null);
  // WP143: no rules configured, so every subject takes its kind's default
  // queue and no routing-log rows are written.
  db.reviewRoutingRule.findMany.mockResolvedValue([]);
  db.reviewRoutingRule.findUnique.mockResolvedValue(null);
  db.reviewRoutingRuleVersion.findMany.mockResolvedValue([]);
  db.reviewRoutingLog.findMany.mockResolvedValue([]);
  db.reviewRoutingLog.createMany.mockResolvedValue({ count: 0 });
  // WP144: no access rows, so every queue keeps today's visibility.
  db.reviewQueueAccess.findMany.mockResolvedValue([]);
  db.reviewQueueAccess.create.mockResolvedValue(null as never);
  db.reviewQueueAccess.deleteMany.mockResolvedValue({ count: 1 } as never);
  db.reviewJobClaim.create.mockResolvedValue({ id: "claim-new" });
  db.reviewJobClaim.findFirst.mockResolvedValue(null);
  db.reviewJob.updateMany.mockResolvedValue({ count: 1 });
  db.reviewJobClaim.updateMany.mockResolvedValue({ count: 1 });
  db.reviewJob.findMany.mockResolvedValue([]);
  // WP145 decisions log: page rows, routing provenance, case lookups and
  // the reason labels, all empty until a test seeds them.
  db.reviewDecision.findMany.mockResolvedValue([]);
  db.case.findUnique.mockResolvedValue(null);
  db.reviewReason.findMany.mockResolvedValue([]);
  db.__tx.reviewJob.updateMany.mockResolvedValue({ count: 1 });
  db.__tx.reviewJob.createMany.mockResolvedValue({ count: 1 });
  db.__tx.reviewJobClaim.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (run: (client: unknown) => Promise<unknown>) => run(db.__tx));
  registerReviewAdapter(stubAdapter("FLAGGED_LINK"));
  registerReviewAdapter(stubAdapter("FINDING"));
  for (const kind of ["FINGERPRINT", "PARTNER_APPLICATION", "LAB_REPORT"] as const) {
    registerReviewAdapter({
      kind,
      permission: "cases:review",
      decisions: [],
      listOpenSubjects: async () => [],
      subjectNeedsReview: async () => null,
      decide: vi.fn(async (): Promise<import("@/lib/review-adapters").ReviewAdapterOutcome> => ({ ok: true, resolved: true })),
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seeding the system queues", () => {
  it("upserts all six create-only, never clobbering later admin edits", async () => {
    await ensureSystemQueues();
    await ensureSystemQueues();
    // The second call is short-circuited per isolate; the first ran six upserts.
    expect(db.reviewQueue.upsert).toHaveBeenCalledTimes(6);
    const calls = db.reviewQueue.upsert.mock.calls as Array<[Record<string, unknown>]>;
    expect(calls.map(([args]) => (args.where as { key: string }).key)).toEqual(
      SYSTEM_REVIEW_QUEUES.map((queue) => queue.key),
    );
    const minorHold = calls[5]![0];
    expect(minorHold.create).toMatchObject({ protected: true, subjectKind: null });
    // A re-seed keeps an admin's renames: update is empty.
    expect(calls.every(([args]) => Object.keys(args.update as object).length === 0)).toBe(true);
  });

  it("seeds the WP142 reasons create-only as well", async () => {
    const { ensureSystemReviewReasons } = await import("@/lib/review-reasons");
    await ensureSystemReviewReasons();
    const calls = db.reviewReason.upsert.mock.calls as unknown as Array<[Record<string, Record<string, unknown>>]>;
    expect(calls).toHaveLength(SYSTEM_REVIEW_REASONS.length);
    // A re-seed keeps an admin's renames and deactivations: update is empty.
    expect(calls.every(([args]) => Object.keys(args.update).length === 0)).toBe(true);
    expect(calls[0]![0].create).toMatchObject({ queueKey: "links", decision: "reject", code: "not_reported_content" });
    // decideJob validates a picked reason against the same rows.
    const reason = await db.reviewReason.findUnique({
      where: { queueKey_decision_code: { queueKey: "links", decision: "reject", code: "not_reported_content" } },
    });
    expect(reason).toMatchObject({ label: "Not a link to the reported content", active: true });
  });
});

describe("the Prisma claim", () => {
  it("claims with one raw statement, exactly the spec's, and writes the claim row", async () => {
    db.$queryRaw.mockResolvedValue([
      {
        id: "job-1",
        queueId: LINKS_QUEUE.id,
        subjectKind: "FLAGGED_LINK",
        subjectId: "url-1",
        caseId: "case-1",
        status: "PENDING",
        priority: 0,
        claimedBy: "hash-a",
        claimedUntil: new Date(NOW.getTime() + 10 * 60_000),
        enqueueSource: "SYNC",
        routedByRuleId: null,
        routedByRuleVersion: null,
        createdAt: NOW,
        updatedAt: NOW,
        closedAt: null,
        closedReason: null,
      },
    ]);

    const claimed = await claimNextJob({ queueId: LINKS_QUEUE.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
    expect(claimed.job?.id).toBe("job-1");
    expect(claimed.claimId).toBe("claim-new");

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const tagged = (db.$queryRaw.mock.calls[0] as unknown[]) as [TemplateStringsArray, ...unknown[]];
    const text = tagged[0]!.join("");
    expect(text).toContain('UPDATE "ReviewJob"');
    expect(text).toContain('now() + interval \'10 minutes\'');
    expect(text).toContain('SELECT "jobId" FROM "ReviewSkip"');
    expect(text).toContain("FOR UPDATE SKIP LOCKED LIMIT 1");
    // The queue once and the reviewer four times, as parameters.
    expect(tagged.slice(1)).toEqual([
      "hash-a",
      LINKS_QUEUE.id,
      "hash-a",
      "hash-a",
      "hash-a",
    ]);
    expect(db.reviewJobClaim.create).toHaveBeenCalledWith({
      data: { jobId: "job-1", reviewerEmailHash: "hash-a", claimedAt: NOW },
      select: { id: true },
    });
  });

  it("answers with no job when the statement returns nothing", async () => {
    db.$queryRaw.mockResolvedValue([]);
    const claimed = await claimNextJob({ queueId: LINKS_QUEUE.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
    expect(claimed).toEqual({ job: null, claimId: null });
    expect(db.reviewJobClaim.create).not.toHaveBeenCalled();
  });
});

describe("the Prisma decide", () => {
  it("commits the decision, the job closure and the claim closure in one transaction", async () => {
    seedJob({ claimedBy: "hash-a", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    db.reviewJobClaim.findFirst.mockResolvedValue({ claimedAt: new Date(NOW.getTime() - 60_000) });

    const result = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "reject",
      reasonCode: "not_reported_content",
      reasonNote: "Checked twice: not a link to the reported content.",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.__tx.reviewDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        queueId: LINKS_QUEUE.id,
        decision: "reject",
        reviewerEmailHash: "hash-a",
        reasonCode: "not_reported_content",
        claimedAt: new Date(NOW.getTime() - 60_000),
        decidedAt: NOW,
      }),
    });
    // The free-text note is encrypted before it is stored, and never carries
    // an address even then.
    const decisionData = (db.__tx.reviewDecision.create.mock.calls[0] as [{ data: { reasonNote: string | null } }])[0].data;
    expect(decisionData.reasonNote).not.toBeNull();
    expect(decisionData.reasonNote).not.toContain("Checked twice");
    expect(decryptField(decisionData.reasonNote!)).toBe("Checked twice: not a link to the reported content.");

    expect(db.__tx.reviewJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "CLOSED",
        closedReason: "reject",
        claimedBy: null,
        claimedUntil: null,
      }),
    });
    expect(db.__tx.reviewJobClaim.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job-1", releasedAt: null },
      data: { releasedAt: NOW, outcome: "decided" },
    });
  });

  it("returns the earlier decision on a retried submit, without deciding again", async () => {
    db.reviewDecision.findUnique.mockResolvedValue({
      id: "decision-1",
      jobId: "job-1",
      queueId: LINKS_QUEUE.id,
      subjectKind: "FLAGGED_LINK",
      subjectId: "url-1",
      caseId: "case-1",
      reviewerEmailHash: "hash-a",
      decision: "reject",
      reasonCode: "not_reported_content",
      reasonNote: null,
      claimedAt: null,
      decidedAt: NOW,
      auditEventId: null,
    });
    seedJob({ status: "CLOSED", closedAt: NOW, closedReason: "reject" });

    const result = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "reject",
      reasonCode: "not_reported_content",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true, idempotent: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses without the lease, and enforces the queue's reason flag on the server", async () => {
    seedJob({ claimedBy: "hash-a", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });

    const lost = await decideJob({
      jobId: "job-1",
      me: "hash-b",
      reviewerId: "admin-2",
      role: "CASE_REVIEWER",
      decision: "approve",
      now: NOW,
    });
    expect(lost).toEqual({ ok: false, error: "claim_lost" });

    const noReason = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "reject",
      now: NOW,
    });
    expect(noReason).toEqual({ ok: false, error: "reason_required" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("requeues a possible-minor decision into minor-hold in the same transaction", async () => {
    const findingAdapter = stubAdapter("FINDING");
    registerReviewAdapter(findingAdapter);
    (findingAdapter.decide as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, resolved: true, requeueKey: "minor-hold" });
    seedJob({
      subjectKind: "FINDING",
      queueId: SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === "findings")!.id,
      claimedBy: "hash-a",
      claimedUntil: new Date(NOW.getTime() + 10 * 60_000),
    });

    const result = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "approve",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    expect(db.__tx.reviewJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          queueId: MINOR_HOLD_ID,
          subjectKind: "FINDING",
          subjectId: "url-1",
          status: "PENDING",
          enqueueSource: "MOVED",
        }),
      ],
      skipDuplicates: true,
    });
  });
});

describe("the Prisma sync, skip and move", () => {
  it("closes a resolved-elsewhere job behind the PENDING guard, with a system decision", async () => {
    seedJob({ subjectId: "url-gone" });
    const result = await syncReviewJobs(NOW);
    expect(result.closed).toBe(1);

    expect(db.$transaction).toHaveBeenCalled();
    expect(db.__tx.reviewJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CLOSED", closedReason: "resolved_elsewhere", claimedBy: null }),
    });
    expect(db.__tx.reviewDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "job-1", decision: "close_stale", reviewerEmailHash: "" }),
    });
    expect(db.__tx.reviewJobClaim.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job-1", releasedAt: null },
      data: { releasedAt: NOW, outcome: "released" },
    });
  });

  it("skips for this reviewer only: skip upsert, lease release, claim closed", async () => {
    seedJob({ claimedBy: "hash-a", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    expect(await skipJob("job-1", "hash-a", NOW)).toEqual({ ok: true });

    expect(db.reviewSkip.upsert).toHaveBeenCalledWith({
      where: { reviewerEmailHash_jobId: { reviewerEmailHash: "hash-a", jobId: "job-1" } },
      create: { reviewerEmailHash: "hash-a", jobId: "job-1", until: new Date(NOW.getTime() + 30 * 60_000) },
      update: { until: new Date(NOW.getTime() + 30 * 60_000) },
    });
    expect(db.reviewJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", claimedBy: "hash-a", status: "PENDING" },
      data: { claimedBy: null, claimedUntil: null, updatedAt: NOW },
    });
    expect(db.reviewJobClaim.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job-1", reviewerEmailHash: "hash-a", releasedAt: null },
      data: { releasedAt: NOW, outcome: "skipped" },
    });
  });

  it("moves a job into minor-hold: decision, closure and reopen in one transaction", async () => {
    seedJob({ claimedBy: "hash-a", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    const result = await moveJob("job-1", "hash-a", MINOR_HOLD_ID, { note: "Suspected minor, escalated.", now: NOW });
    expect(result).toMatchObject({ ok: true, queueKey: MINOR_HOLD_QUEUE_KEY });

    expect(db.__tx.reviewDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "job-1", decision: "move", reviewerEmailHash: "hash-a" }),
    });
    const moveDecision = (db.__tx.reviewDecision.create.mock.calls[0] as [{ data: { reasonNote: string | null } }])[0].data;
    expect(decryptField(moveDecision.reasonNote!)).toBe("Suspected minor, escalated.");
    expect(db.__tx.reviewJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "PENDING" },
      data: expect.objectContaining({ closedReason: "moved" }),
    });
    expect(db.__tx.reviewJob.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ queueId: MINOR_HOLD_ID, subjectId: "url-1", enqueueSource: "MOVED" })],
      skipDuplicates: true,
    });
  });

  it("refuses to move out of minor-hold and to a queue of another kind", async () => {
    seedJob({ claimedBy: "hash-a", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    expect(await moveJob("job-1", "hash-a", SYSTEM_REVIEW_QUEUES.find((q) => q.key === "fingerprints")!.id, { now: NOW })).toEqual({
      ok: false,
      error: "queue_kind_mismatch",
    });

    seedJob({ id: "job-2", subjectId: "url-2", queueId: MINOR_HOLD_ID, claimedBy: "hash-b", claimedUntil: new Date(NOW.getTime() + 10 * 60_000) });
    db.reviewQueue.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      const queue = SYSTEM_REVIEW_QUEUES.find((item) => item.id === args.where.id);
      return queue ? { ...queue, protected: queue.key === MINOR_HOLD_QUEUE_KEY } : null;
    });
    expect(await moveJob("job-2", "hash-b", LINKS_QUEUE.id, { now: NOW })).toEqual({
      ok: false,
      error: "minor_hold",
    });
    expect(db.__tx.reviewDecision.create).not.toHaveBeenCalled();
  });
});

describe("the Prisma decisions log and metrics (WP145)", () => {
  it("filters and keyset-pages decisions through the client, never selecting the note", async () => {
    const decidedAt = new Date("2026-11-22T09:00:00Z");
    db.reviewDecision.findMany.mockResolvedValue([
      {
        id: "decision-1",
        jobId: "job-1",
        queueId: LINKS_QUEUE.id,
        subjectKind: "FLAGGED_LINK",
        subjectId: "url-1",
        caseId: "case-1",
        reviewerEmailHash: "hash-a",
        decision: "reject",
        reasonCode: "duplicate_link",
        claimedAt: new Date("2026-11-22T08:59:00Z"),
        decidedAt,
      },
    ]);
    db.reviewJob.findMany.mockResolvedValue([{ id: "job-1", routedByRuleId: null, routedByRuleVersion: null }]);
    db.reviewReason.findMany.mockResolvedValue([
      { queueKey: "links", decision: "reject", code: "duplicate_link", label: "Duplicate of another link" },
    ]);
    db.case.findUnique.mockImplementation(async (args: { where: { id?: string; referenceNumber?: string } }) => {
      if (args.where.referenceNumber === "ASMITA-2026-PRISM") return { id: "case-1" };
      if (args.where.id === "case-1") return { id: "case-1", referenceNumber: "ASMITA-2026-PRISM" };
      return null;
    });

    const cursorTime = new Date("2026-11-22T10:00:00Z");
    const page = await listDecisionLogPage(
      { emailHash: "hash-a" },
      { queueKey: "links", decision: "reject", fromIstDay: "2026-11-20", toIstDay: "2026-11-22", caseReference: "ASMITA-2026-PRISM" },
      { before: `${cursorTime.getTime()}:decision-0`, limit: 50 },
    );

    const query = db.reviewDecision.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, string>>;
      take: number;
      select: Record<string, boolean>;
    };
    expect(query.where.queueId).toBe(LINKS_QUEUE.id);
    expect(query.where.decision).toBe("reject");
    expect(query.where.caseId).toBe("case-1");
    // IST days are inclusive: the 20th starts at 00:00 IST.
    expect((query.where.decidedAt as { gte: Date }).gte).toEqual(new Date("2026-11-19T18:30:00Z"));
    expect((query.where.decidedAt as { lte: Date }).lte).toEqual(new Date("2026-11-22T18:29:59.999Z"));
    // The keyset cursor: strictly older, or the same instant with a lower id.
    expect(query.where.OR).toEqual([
      { decidedAt: { lt: cursorTime } },
      { AND: [{ decidedAt: cursorTime }, { id: { lt: "decision-0" } }] },
    ]);
    expect(query.orderBy).toEqual([{ decidedAt: "desc" }, { id: "desc" }]);
    expect(query.take).toBe(51);
    // The safe columns only — never the note.
    expect(Object.keys(query.select)).not.toContain("reasonNote");

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      queueName: "Flagged links",
      decision: "reject",
      reasonLabel: "Duplicate of another link",
      reviewer: "You",
      caseReference: "ASMITA-2026-PRISM",
      routing: "Default queue",
      handleSeconds: 60,
    });
  });

  it("runs the metric group-bys as raw statements against Postgres", async () => {
    const windowStart = new Date(NOW.getTime() - 7 * 86_400_000);
    db.$queryRaw
      .mockResolvedValueOnce([{ bucket: new Date("2026-11-21T00:00:00Z"), n: 3 }])
      .mockResolvedValueOnce([{ queueId: LINKS_QUEUE.id, n: 2, oldest: new Date("2026-11-20T00:00:00Z") }])
      .mockResolvedValueOnce([{ secs: 100 }, { secs: 300 }, { secs: 200 }, { secs: 500 }, { secs: 400 }])
      .mockResolvedValueOnce([{ secs: 10 }, { secs: 30 }, { secs: 20 }, { secs: 40 }, { secs: 50 }])
      .mockResolvedValueOnce([{ queueId: LINKS_QUEUE.id, n: 5 }])
      .mockResolvedValueOnce([{ reviewerEmailHash: "hash-a", n: 5 }])
      .mockResolvedValueOnce([{ queueId: LINKS_QUEUE.id, n: 2 }])
      .mockResolvedValueOnce([{ n: 1 }]);

    const metrics = await reviewMetrics({ days: 7, bucket: "day", now: NOW });

    const calls = db.$queryRaw.mock.calls as unknown as Array<
      [Array<string>, ...unknown[]]
    >;
    expect(calls).toHaveLength(8);
    expect(String(calls[0]![0])).toContain("date_trunc(");
    expect(String(calls[0]![0])).toContain("GROUP BY 1 ORDER BY 1");
    // The bucket selector and the window start are both parameters.
    expect(calls[0]![1]).toBe("day");
    expect(calls[0]![2]).toEqual(windowStart);
    expect(String(calls[2]![0])).toContain('EXTRACT(EPOCH FROM (d."decidedAt" - j."createdAt"))');
    expect(String(calls[6]![0])).toContain('FROM "ReviewJobClaim" c JOIN "ReviewJob" j ON j."id" = c."jobId"');
    expect(String(calls[7]![0])).toContain("resolved_elsewhere");

    expect(metrics.jobsCreatedPerBucket.at(-1)).toMatchObject({ count: 0 });
    expect(metrics.jobsCreatedPerBucket.find((entry) => entry.bucketStart.startsWith("2026-11-21"))).toMatchObject({ count: 3 });
    expect(metrics.openNow).toBe(2);
    expect(metrics.timeToDecision).toEqual({ samples: 5, medianSeconds: 300, p90Seconds: 500 });
    expect(metrics.handleTime).toEqual({ samples: 5, medianSeconds: 30 });
    expect(metrics.decisionsByQueue).toEqual([{ queueId: LINKS_QUEUE.id, queueKey: "links", queueName: "Flagged links", count: 5 }]);
    expect(metrics.decisionsByReviewer).toEqual([{ reviewerEmailHash: "hash-a", count: 5 }]);
    expect(metrics.skipsByQueue).toEqual([{ queueId: LINKS_QUEUE.id, queueKey: "links", queueName: "Flagged links", count: 2 }]);
    expect(metrics.resolvedElsewhere).toBe(1);
  });
});
