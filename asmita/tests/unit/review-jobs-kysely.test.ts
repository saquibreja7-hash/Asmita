import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP140 on the Kysely (Worker) path, against a recording fake in the style
// of the other crawler tests. What the spec makes the real test: the claim
// is ONE statement against Postgres (captured raw, with the ReviewSkip
// subquery and FOR UPDATE SKIP LOCKED, and a ReviewJobClaim row written
// after it), a decision commits its ReviewDecision, its job closure and its
// claim closure in one transaction, the sync closes resolved-elsewhere jobs
// behind a PENDING guard, and the minor check moves a job's queue. The
// subjects come from stub adapters: the adapters' own database paths are
// exercised by their routes' tests, not here.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    raws: [] as Array<{ text: string[]; values: unknown[] }>,
    rawRows: [] as Array<Record<string, unknown>>,
  };

  const plain = (col: string) => (col.includes(".") ? col.split(".")[1]! : col);

  function matches(row: Record<string, unknown>, wheres: unknown[]): boolean {
    return wheres.every((raw) => {
      if (!Array.isArray(raw) || typeof raw[0] !== "string") return true;
      const [col, op, value] = raw as [string, string, unknown];
      const cell = row[plain(col)];
      switch (op) {
        case "=":
          return cell instanceof Date || value instanceof Date
            ? cell instanceof Date && value instanceof Date && cell.getTime() === value.getTime()
            : cell === value;
        case "in":
          return Array.isArray(value) && value.some((item) => item === cell);
        case "is":
          return (cell ?? null) === (value ?? null);
        case "is not":
          return (cell ?? null) !== (value ?? null);
        default:
          return true;
      }
    });
  }

  function rowsFor(op: string, table: string, detail: Record<string, unknown>): Array<Record<string, unknown>> {
    if (op === "insert") return [];
    let rows = (state.rows[table] ?? []).filter((row) => matches(row, (detail.wheres as unknown[]) ?? []));
    const order = detail.orderBy as [string, string | undefined] | undefined;
    if (order) {
      rows = [...rows].sort((a, b) => {
        const cmp = String(a[plain(order[0])]).localeCompare(String(b[plain(order[0])]));
        return order[1] === "desc" ? -cmp : cmp;
      });
    }
    if (detail.limit !== undefined) rows = rows.slice(0, detail.limit as number);
    return rows.map((row) => ({ ...row }));
  }

  function builder(op: string, table: string, detail: Record<string, unknown>) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return undefined;
          if (prop === "execute" || prop === "executeTakeFirst" || prop === "executeTakeFirstOrThrow") {
            return async () => {
              state.calls.push({ op, table, detail });
              if (op === "update") {
                // The module reads Number(numUpdatedRows), like the Worker path does.
                const updated = [{ numUpdatedRows: rowsFor(op, table, detail).length }];
                return prop === "execute" ? updated : updated[0];
              }
              if (op === "insert") return (Array.isArray(detail.values) ? detail.values : [detail.values]).map((row) => ({ ...row }));
              const rows = rowsFor(op, table, detail);
              return prop === "execute" ? rows : rows[0];
            };
          }
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
            else if (prop === "selectAll") detail.selectAll = true;
            else if (prop === "returning") detail.returning = args[0];
            else if (prop === "returningAll") detail.returningAll = true;
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
            else if (prop === "limit") detail.limit = args[0];
            else if (prop === "orderBy") detail.orderBy = args;
            else if (prop === "onConflict") {
              const conflict: Record<string, unknown> = { columns: null, action: null, set: null };
              detail.onConflict = conflict;
              const act = (action: string) => (set?: Record<string, unknown>) => {
                conflict.action = action;
                if (set !== undefined) conflict.set = set;
              };
              // Kysely allows a conflict action without a target
              // (doNothing on any unique violation), and with one.
              const target = { doNothing: act("doNothing"), doUpdateSet: act("doUpdateSet") };
              (args[0] as (oc: unknown) => unknown)({
                ...target,
                column: (name: string) => {
                  conflict.columns = [name];
                  return target;
                },
                columns: (names: string[]) => {
                  conflict.columns = names;
                  return target;
                },
              });
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  function record(op: string, name: string) {
    const table = name.split(" ")[0];
    const detail: Record<string, unknown> = {};
    return builder(op, table, detail);
  }

  const db = {
    selectFrom: (name: string) => record("select", name),
    insertInto: (name: string) => record("insert", name),
    updateTable: (name: string) => record("update", name),
    deleteFrom: (name: string) => record("delete", name),
    transaction: () => ({ execute: async (run: (tx: unknown) => Promise<unknown>) => run(db) }),
  };
  return { db, state };
});

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    // The claim is raw SQL (one statement against Postgres); the fake
    // records the fragments and answers with the configured rows.
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      execute: async () => {
        kysely.state.raws.push({ text: [...strings], values });
        return { rows: kysely.state.rawRows };
      },
    }),
  };
});
vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => true, getWorkerDb: () => kysely.db }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { SYSTEM_REVIEW_QUEUES, MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { registerReviewAdapter, resetReviewAdapters, type ReviewAdapter } from "@/lib/review-adapters";
import {
  canSeeReviewQueue,
  claimNextJob,
  decideJob,
  getReviewQueueByKey,
  moveJob,
  resetReviewMemory,
  skipJob,
  syncReviewJobs,
} from "@/lib/review-jobs";

const NOW = new Date("2026-11-22T10:00:00Z");
const MINOR_HOLD_ID = SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === MINOR_HOLD_QUEUE_KEY)!.id;
const LINKS_ID = SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === "links")!.id;
const FINGERPRINTS_ID = SYSTEM_REVIEW_QUEUES.find((queue) => queue.key === "fingerprints")!.id;

function seedQueues() {
  kysely.state.rows.ReviewQueue = SYSTEM_REVIEW_QUEUES.map((queue) => ({
    id: queue.id,
    key: queue.key,
    name: queue.name,
    description: queue.description,
    subjectKind: queue.subjectKind,
    isDefault: queue.isDefault,
    protected: queue.protected,
    sortOrder: queue.sortOrder,
    requireReasonOnReject: queue.requireReasonOnReject,
    requireReasonOnApprove: queue.requireReasonOnApprove,
  }));
}

function seedJob(overrides: Record<string, unknown> = {}) {
  const job = {
    id: "job-1",
    queueId: LINKS_ID,
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
  kysely.state.rows.ReviewJob = [...(kysely.state.rows.ReviewJob ?? []), job];
  return job;
}

/** A stub adapter per kind, so the queue machinery is tested on its own. */
function stubAdapter(kind: "FLAGGED_LINK" | "FINGERPRINT" | "FINDING" | "PARTNER_APPLICATION" | "LAB_REPORT", decide: ReviewAdapter["decide"]): ReviewAdapter {
  return {
    kind,
    permission: "cases:review",
    decisions: [{ code: "approve", label: "Approve", reasonKind: "approve" }],
    listOpenSubjects: async () => [],
    subjectNeedsReview: async () => null,
    decide,
  };
}

function callsOn(op: string, table: string) {
  return kysely.state.calls.filter((call) => call.op === op && call.table === table);
}

function setOf(call: { detail: Record<string, unknown> } | undefined): Record<string, unknown> | undefined {
  return call?.detail.set as Record<string, unknown> | undefined;
}

function valuesOf(call: { detail: Record<string, unknown> } | undefined): Record<string, unknown> | undefined {
  return call?.detail.values as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  resetReviewMemory();
  resetReviewAdapters();
  kysely.state.rows = {};
  kysely.state.calls = [];
  kysely.state.raws = [];
  kysely.state.rawRows = [];
  seedQueues();
  registerReviewAdapter(stubAdapter("FLAGGED_LINK", async () => ({ ok: true, resolved: true })));
  registerReviewAdapter(stubAdapter("FINGERPRINT", async () => ({ ok: true, resolved: true })));
  registerReviewAdapter(stubAdapter("FINDING", async () => ({ ok: true, resolved: true })));
  registerReviewAdapter(stubAdapter("PARTNER_APPLICATION", async () => ({ ok: true, resolved: true })));
  registerReviewAdapter(stubAdapter("LAB_REPORT", async () => ({ ok: true, resolved: true })));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Kysely claim", () => {
  it("claims with one raw statement, exactly the spec's, and writes the claim row", async () => {
    const queue = await getReviewQueueByKey("links");
    kysely.state.rawRows = [
      {
        id: "job-1",
        queueId: queue!.id,
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
    ];

    const claimed = await claimNextJob({ queueId: queue!.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
    expect(claimed.job?.id).toBe("job-1");
    expect(claimed.job?.claimedBy).toBe("hash-a");

    expect(kysely.state.raws).toHaveLength(1);
    const text = kysely.state.raws[0]!.text.join("");
    expect(text).toContain('UPDATE "ReviewJob"');
    expect(text).toContain("FOR UPDATE SKIP LOCKED LIMIT 1");
    expect(text).toContain('FROM "ReviewSkip"');
    // The refresh-safe ordering puts the reviewer's own held job first.
    expect(text).toContain('ORDER BY ("claimedBy" = ');
    // The queue, the reviewer and the skip window are all parameters.
    expect(kysely.state.raws[0]!.values).toContain(queue!.id);
    expect(kysely.state.raws[0]!.values.filter((value) => value === "hash-a")).toHaveLength(4);

    // The claim row follows the lease.
    const claimInsert = callsOn("insert", "ReviewJobClaim")[0];
    expect(claimInsert).toBeTruthy();
    expect(claimInsert!.detail.values).toMatchObject({
      jobId: "job-1",
      reviewerEmailHash: "hash-a",
      claimedAt: NOW,
    });
  });

  it("answers with no job when the statement returns nothing", async () => {
    const queue = await getReviewQueueByKey("links");
    kysely.state.rawRows = [];
    const claimed = await claimNextJob({ queueId: queue!.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
    expect(claimed).toEqual({ job: null, claimId: null });
  });
});

describe("the Kysely sync", () => {
  it("enqueues a job for an open subject in the kind's default queue", async () => {
    registerReviewAdapter({
      kind: "FLAGGED_LINK",
      permission: "cases:review",
      decisions: [],
      listOpenSubjects: async () => [{ subjectId: "url-9", caseId: "case-9", minorHold: false }],
      subjectNeedsReview: async () => ({ subjectId: "url-9", caseId: "case-9", minorHold: false }),
      decide: async () => ({ ok: false, error: "not_used" }),
    });

    const result = await syncReviewJobs(NOW);
    expect(result.enqueued).toBe(1);
    const inserts = callsOn("insert", "ReviewJob");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.detail.values).toMatchObject({
      queueId: LINKS_ID,
      subjectKind: "FLAGGED_LINK",
      subjectId: "url-9",
      caseId: "case-9",
      status: "PENDING",
      enqueueSource: "SYNC",
    });
  });

  it("closes a resolved-elsewhere job in one transaction, behind the PENDING guard", async () => {
    seedJob({ subjectId: "url-gone" });
    const result = await syncReviewJobs(NOW);
    expect(result.closed).toBe(1);

    const closeUpdate = callsOn("update", "ReviewJob").find((call) => setOf(call)?.status === "CLOSED");
    expect(closeUpdate?.detail.wheres).toEqual([["id", "=", "job-1"], ["status", "=", "PENDING"]]);
    expect(closeUpdate?.detail.set).toMatchObject({ closedReason: "resolved_elsewhere" });

    const decisionInsert = callsOn("insert", "ReviewDecision")[0];
    expect(decisionInsert!.detail.values).toMatchObject({
      jobId: "job-1",
      decision: "close_stale",
      reviewerEmailHash: "",
    });

    const claimClose = callsOn("update", "ReviewJobClaim").find((call) => setOf(call)?.outcome === "released");
    expect(claimClose).toBeTruthy();
  });

  it("moves an open job to minor-hold when the minor check says so", async () => {
    registerReviewAdapter({
      kind: "FINDING",
      permission: "findings:review",
      decisions: [],
      listOpenSubjects: async () => [{ subjectId: "finding-1", caseId: "case-9", minorHold: true }],
      subjectNeedsReview: async () => ({ subjectId: "finding-1", caseId: "case-9", minorHold: true }),
      decide: async () => ({ ok: false, error: "not_used" }),
    });
    const job = seedJob({ subjectKind: "FINDING", subjectId: "finding-1", queueId: SYSTEM_REVIEW_QUEUES.find((q) => q.key === "findings")!.id });

    const result = await syncReviewJobs(NOW);
    expect(result.moved).toBe(1);
    const move = callsOn("update", "ReviewJob").find((call) => setOf(call)?.queueId === MINOR_HOLD_ID);
    expect(move?.detail.wheres).toContainEqual(["id", "=", job.id]);
    expect(move?.detail.set).toMatchObject({ claimedBy: null, claimedUntil: null });
  });
});

describe("the Kysely decide", () => {
  it("commits the decision, the job closure and the claim closure in one transaction", async () => {
    const claimedUntil = new Date(NOW.getTime() + 10 * 60_000);
    seedJob({ claimedBy: "hash-a", claimedUntil });
    kysely.state.rows.ReviewJobClaim = [
      { id: "claim-1", jobId: "job-1", reviewerEmailHash: "hash-a", claimedAt: new Date(NOW.getTime() - 60_000), releasedAt: null, outcome: null },
    ];

    const result = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "approve",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true });

    const decisionInsert = callsOn("insert", "ReviewDecision")[0];
    expect(decisionInsert!.detail.values).toMatchObject({
      jobId: "job-1",
      queueId: LINKS_ID,
      decision: "approve",
      reviewerEmailHash: "hash-a",
      claimedAt: new Date(NOW.getTime() - 60_000),
      decidedAt: NOW,
    });

    const close = callsOn("update", "ReviewJob").find((call) => setOf(call)?.status === "CLOSED");
    expect(close?.detail.set).toMatchObject({ closedReason: "approve", claimedBy: null });
    expect(close?.detail.wheres).toContainEqual(["id", "=", "job-1"]);

    const claimClose = callsOn("update", "ReviewJobClaim").find((call) => setOf(call)?.outcome === "decided");
    expect(claimClose?.detail.wheres).toContainEqual(["jobId", "=", "job-1"]);
  });

  it("requeues a possible-minor decision into minor-hold in the same transaction", async () => {
    registerReviewAdapter(stubAdapter("FINDING", async () => ({ ok: true, resolved: true, requeueKey: "minor-hold" })));
    const claimedUntil = new Date(NOW.getTime() + 10 * 60_000);
    seedJob({ subjectKind: "FINDING", queueId: SYSTEM_REVIEW_QUEUES.find((q) => q.key === "findings")!.id, claimedBy: "hash-a", claimedUntil });

    const result = await decideJob({
      jobId: "job-1",
      me: "hash-a",
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "approve",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    const requeue = callsOn("insert", "ReviewJob").find((call) => valuesOf(call)?.enqueueSource === "MOVED");
    expect(requeue?.detail.values).toMatchObject({ queueId: MINOR_HOLD_ID, subjectId: "url-1" });
  });
});

describe("the Kysely skip and move", () => {
  it("upserts the skip on its key, releases the lease and closes the claim as skipped", async () => {
    const claimedUntil = new Date(NOW.getTime() + 10 * 60_000);
    seedJob({ claimedBy: "hash-a", claimedUntil });
    kysely.state.rows.ReviewJobClaim = [
      { id: "claim-1", jobId: "job-1", reviewerEmailHash: "hash-a", claimedAt: NOW, releasedAt: null, outcome: null },
    ];

    expect(await skipJob("job-1", "hash-a", NOW)).toEqual({ ok: true });
    const skipInsert = callsOn("insert", "ReviewSkip")[0];
    expect(skipInsert?.detail.onConflict).toMatchObject({ columns: ["reviewerEmailHash", "jobId"], action: "doUpdateSet" });
    expect(skipInsert?.detail.values).toMatchObject({ reviewerEmailHash: "hash-a", jobId: "job-1" });
    const release = callsOn("update", "ReviewJob").find((call) => setOf(call)?.claimedBy === null);
    expect(release?.detail.wheres).toContainEqual(["claimedBy", "=", "hash-a"]);
    const claim = callsOn("update", "ReviewJobClaim").find((call) => setOf(call)?.outcome === "skipped");
    expect(claim).toBeTruthy();
  });

  it("refuses to move a job out of minor-hold and to a queue of another kind", async () => {
    const claimedUntil = new Date(NOW.getTime() + 10 * 60_000);
    seedJob({ claimedBy: "hash-a", claimedUntil });
    expect(await moveJob("job-1", "hash-a", FINGERPRINTS_ID, { now: NOW })).toMatchObject({
      ok: false,
      error: "queue_kind_mismatch",
    });

    const inHold = seedJob({
      id: "job-2",
      subjectId: "url-2",
      queueId: MINOR_HOLD_ID,
      claimedBy: "hash-b",
      claimedUntil,
    });
    void inHold;
    const findingsQueueId = SYSTEM_REVIEW_QUEUES.find((q) => q.key === "findings")!.id;
    expect(await moveJob("job-2", "hash-b", findingsQueueId, { now: NOW })).toMatchObject({
      ok: false,
      error: "minor_hold",
    });
    expect(callsOn("insert", "ReviewDecision")).toHaveLength(0);
  });

  it("moves a job into minor-hold by hand: decision, closure and reopen in one transaction", async () => {
    const claimedUntil = new Date(NOW.getTime() + 10 * 60_000);
    seedJob({ claimedBy: "hash-a", claimedUntil });
    const result = await moveJob("job-1", "hash-a", MINOR_HOLD_ID, { now: NOW });
    expect(result).toMatchObject({ ok: true, queueKey: MINOR_HOLD_QUEUE_KEY });

    const decisionInsert = callsOn("insert", "ReviewDecision")[0];
    expect(decisionInsert!.detail.values).toMatchObject({ jobId: "job-1", decision: "move", reviewerEmailHash: "hash-a" });
    const close = callsOn("update", "ReviewJob").find((call) => setOf(call)?.closedReason === "moved");
    expect(close).toBeTruthy();
    const reopen = callsOn("insert", "ReviewJob").find((call) => valuesOf(call)?.enqueueSource === "MOVED");
    expect(reopen?.detail.values).toMatchObject({ queueId: MINOR_HOLD_ID, subjectId: "url-1" });
  });
});

describe("queue visibility stays role-checked on the Worker path too", () => {
  it("hides minor-hold from a CASE_REVIEWER", async () => {
    const minorHold = (await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY))!;
    expect(minorHold.protected).toBe(true);
    expect(canSeeReviewQueue("CASE_REVIEWER", minorHold)).toBe(false);
    expect(canSeeReviewQueue("SUPER_ADMIN", minorHold)).toBe(true);
  });
});
