import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP33 (partner programme part 2): src/lib/partner-metrics.ts — the
// per-partner numbers the admin partner page shows. Proves medianOf's three
// shapes; that "fingerprints delivered" counts the distinct fingerprints
// with an ADD event in the one shared feed — the same number for every
// partner, per WP32's recorded decision — anchored at each fingerprint's
// FIRST ADD; that outcomes reported and the median are the partner's own;
// that outcomes naming an unknown or absent fingerprint count as reported
// but carry no duration, and the median is null when nothing is measurable;
// and that the database paths read ids and times only. Synthetic data only:
// example partners and uuid-like ids.

const mocks = vi.hoisted(() => {
  // The Kysely recording fake from partner-admin-kysely.test.ts.
  const kysely = (() => {
    const state = {
      rows: {} as Record<string, Array<Record<string, unknown>>>,
      calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    };

    function builder(op: string, table: string, detail: Record<string, unknown>) {
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "execute") return async () => selectRows(table, detail).map((row) => ({ ...row }));
            if (prop === "executeTakeFirst") return async () => selectRows(table, detail)[0];
            if (prop === "then") return undefined;
            return (...args: unknown[]) => {
              if (prop === "values") detail.values = args[0];
              else if (prop === "select") detail.select = args[0];
              else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
              else if (prop === "innerJoin") detail.join = args[0];
              return proxy;
            };
          },
        },
      );
      return proxy;
    }

    function selectRows(table: string, detail: Record<string, unknown>) {
      let rows = state.rows[table] ?? [];
      for (const where of (detail.wheres as unknown[][] | undefined) ?? []) {
        const [column, operator, value] = where as [string, string, unknown];
        if (operator === "=") rows = rows.filter((row) => row[column] === value);
        else if (operator === "in" && Array.isArray(value)) rows = rows.filter((row) => value.includes(row[column]));
        // "is" (null checks) and comparisons like ">" are served unfiltered by
        // this fake; the tests below assert on the recorded query instead.
      }
      return rows;
    }

    function record(op: string, name: string) {
      const table = name.split(" ")[0];
      const detail: Record<string, unknown> = {};
      state.calls.push({ op, table, detail });
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
  })();

  // A small table fake for the Prisma paths: findMany filters on `in` and
  // equality, createMany records what the sync wrote.
  const prisma = (() => {
    const state = {
      tables: {} as Record<string, Array<Record<string, unknown>>>,
      createManyCalls: [] as Array<{ table: string; data: unknown }>,
    };
    function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
      return Object.entries(where).every(([key, condition]) => {
        if (key === "user") return true; // the adult filter is asserted via the recorded query
        if (condition && typeof condition === "object" && !Array.isArray(condition)) {
          const c = condition as { in?: unknown[]; not?: null };
          if ("not" in c) return row[key] !== c.not;
          if (c.in) return c.in.includes(row[key]);
          return true;
        }
        return row[key] === condition;
      });
    }
    const delegate = (table: string) => ({
      findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> } = {}) => {
        const rows = (state.tables[table] ?? []).filter((row) => matches(row, where));
        if (!select) return rows.map((row) => ({ ...row }));
        return rows.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
      },
      findFirst: async () => null,
      createMany: async ({ data }: { data: unknown }) => {
        state.createManyCalls.push({ table, data });
        return { count: Array.isArray(data) ? data.length : 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.tables[table] ??= [];
        state.tables[table].push({ id: `${table}-new`, ...data });
        return { id: `${table}-new` };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = (state.tables[table] ?? []).filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    });
    const client = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        if (prop === "$transaction") return async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
        return delegate(prop);
      },
    });
    return { client, state };
  })();

  const usesWorkerKysely = vi.fn(() => false);
  return { kysely, prisma, usesWorkerKysely };
});

vi.mock("@/lib/db", () => ({ db: mocks.prisma.client }));
vi.mock("@/lib/worker-kysely", () => ({
  usesWorkerKysely: mocks.usesWorkerKysely,
  getWorkerDb: () => mocks.kysely.db,
}));

import { getPartnerMetrics, medianOf } from "@/lib/partner-metrics";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = new Date("2026-11-01T00:00:00.000Z");
/** T0 plus an offset: the synthetic clock every seed below uses. */
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

type FeedRow = { seq: number; fingerprintId: string; type: "ADD" | "WITHDRAW"; createdAt: Date };
type OutcomeRow = { partnerId: string; fingerprintId: string | null; createdAt: Date };

// The shared feed every partner polls: f1 added, withdrawn and re-added —
// still one delivery, and the FIRST ADD (T0) stays the anchor; f2 added an
// hour in; f3 withdrawn only, so nothing of it was ever delivered.
const FEED: FeedRow[] = [
  { seq: 1, fingerprintId: "f1", type: "ADD", createdAt: at(0) },
  { seq: 2, fingerprintId: "f1", type: "WITHDRAW", createdAt: at(30 * MINUTE) },
  { seq: 3, fingerprintId: "f1", type: "ADD", createdAt: at(45 * MINUTE) },
  { seq: 4, fingerprintId: "f2", type: "ADD", createdAt: at(HOUR) },
  { seq: 5, fingerprintId: "f3", type: "WITHDRAW", createdAt: at(2 * HOUR) },
];

// p1's outcomes: 2h and 6h after f1's first ADD, 3h after f2's ADD — median 3h.
const P1_OUTCOMES: OutcomeRow[] = [
  { partnerId: "p1", fingerprintId: "f1", createdAt: at(2 * HOUR) },
  { partnerId: "p1", fingerprintId: "f1", createdAt: at(6 * HOUR) },
  { partnerId: "p1", fingerprintId: "f2", createdAt: at(4 * HOUR) },
];

// p2 reports on the same shared feed: one outcome about f1, 5h after its ADD.
const P2_OUTCOMES: OutcomeRow[] = [{ partnerId: "p2", fingerprintId: "f1", createdAt: at(5 * HOUR) }];

function seedMemoryFeed(rows: FeedRow[]) {
  for (const row of rows) {
    partnerMemory().feedEvents.push({
      id: `fe-${row.seq}`,
      seq: row.seq,
      fingerprintId: row.fingerprintId,
      type: row.type,
      kind: "image",
      caseId: "case-1",
      caseRef: "ASMITA-2026-00001",
      createdAt: row.createdAt,
    });
  }
}

function seedMemoryOutcomes(rows: OutcomeRow[]) {
  for (const [index, row] of rows.entries()) {
    partnerMemory().outcomes.push({
      id: `po-${index + 1}`,
      partnerId: row.partnerId,
      fingerprintId: row.fingerprintId,
      urlEncrypted: null,
      urlHash: null,
      submittedUrlId: null,
      caseId: null,
      outcome: "REMOVED",
      note: null,
      createdAt: row.createdAt,
    });
  }
}

beforeEach(() => {
  resetPartnerMemory();
  mocks.usesWorkerKysely.mockReturnValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("medianOf", () => {
  it("is null for no values", () => {
    expect(medianOf([])).toBeNull();
  });

  it("is the only value for a single one", () => {
    expect(medianOf([5])).toBe(5);
  });

  it("is the middle value for an odd count, sorted first", () => {
    expect(medianOf([1, 2, 3])).toBe(2);
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it("is the average of the two middle values for an even count", () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([4, 2, 3, 1])).toBe(2.5);
  });
});

describe("the metrics, in-memory store", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));

  it("answers zeroes and a null median when there is nothing at all", async () => {
    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 0,
      outcomesReported: 0,
      medianTimeToOutcomeMs: null,
    });
  });

  it("counts each ADDed fingerprint once, anchored at its first ADD, and never a withdrawn-only one", async () => {
    seedMemoryFeed(FEED);
    seedMemoryOutcomes(P1_OUTCOMES);

    // f1 counts once despite the re-add, f2 once, f3 not at all; the
    // durations are measured from f1's FIRST ADD (T0, not the 45-minute
    // re-add): [2h, 3h, 6h] -> median 3h.
    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 2,
      outcomesReported: 3,
      medianTimeToOutcomeMs: 3 * HOUR,
    });
  });

  it("keeps outcomes per partner, the delivered count shared", async () => {
    seedMemoryFeed(FEED);
    seedMemoryOutcomes(P1_OUTCOMES);
    seedMemoryOutcomes(P2_OUTCOMES);

    expect(await getPartnerMetrics("p2")).toEqual({
      fingerprintsDelivered: 2, // the same shared feed as p1's
      outcomesReported: 1, // his outcome alone
      medianTimeToOutcomeMs: 5 * HOUR,
    });
  });

  it("counts outcomes about an unknown or absent fingerprint as reported, but they carry no duration", async () => {
    seedMemoryFeed([{ seq: 1, fingerprintId: "f1", type: "ADD", createdAt: at(0) }]);
    seedMemoryOutcomes([
      { partnerId: "p1", fingerprintId: "f1", createdAt: at(2 * HOUR) }, // the only measurable one
      { partnerId: "p1", fingerprintId: "f-nope", createdAt: at(3 * HOUR) }, // never in the feed
      { partnerId: "p1", fingerprintId: null, createdAt: at(4 * HOUR) }, // no fingerprint named
      { partnerId: "p1", fingerprintId: "f1", createdAt: at(-30 * MINUTE) }, // before the ADD: not measurable either
    ]);

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 1,
      outcomesReported: 4,
      medianTimeToOutcomeMs: 2 * HOUR,
    });
  });

  it("answers a null median when no outcome has a measurable duration", async () => {
    seedMemoryFeed([{ seq: 1, fingerprintId: "f1", type: "ADD", createdAt: at(0) }]);
    seedMemoryOutcomes([
      { partnerId: "p1", fingerprintId: "f-nope", createdAt: at(3 * HOUR) },
      { partnerId: "p1", fingerprintId: null, createdAt: at(4 * HOUR) },
    ]);

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 1,
      outcomesReported: 2,
      medianTimeToOutcomeMs: null,
    });
  });
});

describe("the metrics, Kysely path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(true);
    mocks.kysely.state.rows = {};
    mocks.kysely.state.calls.length = 0;
  });

  it("computes the same numbers from the Worker tables, reading ids and times only", async () => {
    mocks.kysely.state.rows.PartnerFeedEvent = FEED.map((row) => ({ ...row }));
    mocks.kysely.state.rows.PartnerOutcome = [...P1_OUTCOMES, ...P2_OUTCOMES].map((row) => ({ ...row }));

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 2,
      outcomesReported: 3,
      medianTimeToOutcomeMs: 3 * HOUR,
    });
    expect(await getPartnerMetrics("p2")).toEqual({
      fingerprintsDelivered: 2,
      outcomesReported: 1,
      medianTimeToOutcomeMs: 5 * HOUR,
    });

    // The feed query filters the ADDs at the database (f3's WITHDRAW never
    // becomes a delivery) and selects ids and times only — no hash, no case
    // reference, nothing survivor-facing.
    const feedQuery = mocks.kysely.state.calls.find((call) => call.table === "PartnerFeedEvent" && call.op === "select");
    expect(feedQuery?.detail.select).toEqual(["fingerprintId", "createdAt"]);
    expect(feedQuery?.detail.wheres).toEqual([["type", "=", "ADD"]]);

    // The outcome query is scoped to one partner at the database, one per call.
    const outcomeQueries = mocks.kysely.state.calls.filter((call) => call.table === "PartnerOutcome" && call.op === "select");
    expect(outcomeQueries.map((query) => query.detail.wheres)).toEqual([
      [["partnerId", "=", "p1"]],
      [["partnerId", "=", "p2"]],
    ]);
    expect(outcomeQueries[0]?.detail.select).toEqual(["fingerprintId", "createdAt"]);
  });

  it("counts unknown or absent fingerprints as reported, without a duration", async () => {
    mocks.kysely.state.rows.PartnerFeedEvent = [{ seq: 1, fingerprintId: "f1", type: "ADD", createdAt: at(0) }];
    mocks.kysely.state.rows.PartnerOutcome = [
      { partnerId: "p1", fingerprintId: "f1", createdAt: at(2 * HOUR) },
      { partnerId: "p1", fingerprintId: "f-nope", createdAt: at(3 * HOUR) },
      { partnerId: "p1", fingerprintId: null, createdAt: at(4 * HOUR) },
    ];

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 1,
      outcomesReported: 3,
      medianTimeToOutcomeMs: 2 * HOUR,
    });
  });
});

describe("the metrics, Prisma path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(false);
    mocks.prisma.state.tables = {};
    mocks.prisma.state.createManyCalls.length = 0;
  });

  it("computes the same numbers through the Prisma client", async () => {
    mocks.prisma.state.tables.partnerFeedEvent = FEED.map((row) => ({ ...row }));
    mocks.prisma.state.tables.partnerOutcome = [...P1_OUTCOMES, ...P2_OUTCOMES].map((row) => ({ ...row }));

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 2,
      outcomesReported: 3,
      medianTimeToOutcomeMs: 3 * HOUR,
    });
    expect(await getPartnerMetrics("p2")).toEqual({
      fingerprintsDelivered: 2,
      outcomesReported: 1,
      medianTimeToOutcomeMs: 5 * HOUR,
    });
  });

  it("counts unknown or absent fingerprints as reported, without a duration", async () => {
    mocks.prisma.state.tables.partnerFeedEvent = [{ seq: 1, fingerprintId: "f1", type: "ADD", createdAt: at(0) }];
    mocks.prisma.state.tables.partnerOutcome = [
      { partnerId: "p1", fingerprintId: "f1", createdAt: at(2 * HOUR) },
      { partnerId: "p1", fingerprintId: "f-nope", createdAt: at(3 * HOUR) },
      { partnerId: "p1", fingerprintId: null, createdAt: at(4 * HOUR) },
    ];

    expect(await getPartnerMetrics("p1")).toEqual({
      fingerprintsDelivered: 1,
      outcomesReported: 3,
      medianTimeToOutcomeMs: 2 * HOUR,
    });
  });
});
