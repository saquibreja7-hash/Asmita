import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP8 (full-crawler spec) on the Kysely (Worker) path, against a recording
// fake in the style of the other crawler tests. What the Worker makes the
// real test: the aggregates are computed in the database (a fixed, bounded
// handful of statements), no address column (urlEncrypted, urlDigest,
// domain, pageUrlEncrypted, imageUrlEncrypted) is ever selected, and the
// filters match the memory path (DEAD/GONE excluded from the live queue,
// the UTC day start, the 30-minute claim window).

const kysely = vi.hoisted(() => {
  const state = {
    // Canned results per table, popped in call order by execute-family calls.
    results: {} as Record<string, Array<unknown>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
  };

  function builder(op: string, table: string, detail: Record<string, unknown>) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "execute" || prop === "executeTakeFirst" || prop === "executeTakeFirstOrThrow") {
            return async () => {
              const queue = state.results[table] ?? [];
              const value = queue.shift();
              return prop === "execute" ? value : Array.isArray(value) ? value[0] : value;
            };
          }
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "select") detail.selects = [...((detail.selects as unknown[]) ?? []), ...args];
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
            else if (prop === "groupBy") detail.groupBy = args[0];
            else if (prop === "orderBy") detail.orderBy = args;
            else if (prop === "limit") detail.limit = args[0];
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
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => true, getWorkerDb: () => kysely.db }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import { getCrawlerStats } from "@/lib/crawl-stats";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const DAY_START = new Date("2026-11-17T00:00:00.000Z");
const LAST_SOURCE_CRAWL = new Date("2026-11-17T08:35:00.000Z");
const LAST_PAGE_FETCH = new Date("2026-11-17T08:20:00.000Z");
const RUN_FIRST_SEEN = new Date("2026-11-17T07:30:00.000Z");
const RUN_LAST_SEEN = new Date("2026-11-17T08:40:00.000Z");

/** Every result, in the exact order the module issues its statements. */
function canned(withRun: boolean) {
  kysely.state.results = {
    CrawlSource: [
      [ // by origin and enabled
        { origin: "ADMIN", enabled: true, count: "3" },
        { origin: "ADMIN", enabled: false, count: "2" },
        { origin: "REPORTED", enabled: true, count: "1" },
        { origin: "DISCOVERED", enabled: false, count: "4" },
      ],
      { count: "2" }, // discovered today
      { last: LAST_SOURCE_CRAWL },
    ],
    CrawlPage: [
      [ // by status
        { status: "PENDING", count: "3" },
        { status: "FETCHED", count: "2" },
        { status: "NOT_MODIFIED", count: "1" },
        { status: "GONE", count: "1" },
        { status: "BLOCKED", count: "1" },
        { status: "ERROR", count: "1" },
        { status: "DEAD", count: "1" },
      ],
      { count: "4" }, // fetched today
      { count: "1" }, // due
      { count: "2" }, // claimed
      { last: LAST_PAGE_FETCH },
    ],
    CrawlFinding: [
      [ // by review status
        { reviewStatus: "CANDIDATE", count: "2" },
        { reviewStatus: "APPROVED", count: "1" },
        { reviewStatus: "DISMISSED", count: "1" },
      ],
      ...(withRun ? [{ runId: "run-x", lastSeenAt: RUN_LAST_SEEN }, { count: "3", first: RUN_FIRST_SEEN, last: RUN_LAST_SEEN }] : [undefined]),
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);

describe("getCrawlerStats, Kysely path", () => {
  it("assembles the aggregates from database-computed groups", async () => {
    canned(true);
    const stats = await getCrawlerStats(NOW);
    expect(stats.sites).toEqual({
      total: 10,
      enabled: 4,
      disabled: 6,
      byOrigin: {
        admin: { total: 5, enabled: 3, disabled: 2 },
        reported: { total: 1, enabled: 1, disabled: 0 },
        discovered: { total: 4, enabled: 0, disabled: 4 },
      },
    });
    expect(stats.discoveredSitesToday).toBe(2);
    expect(stats.pagesCrawledToday).toBe(4);
    expect(stats.queue).toEqual({ live: 8, pending: 3, due: 1, claimed: 2, scheduled: 5, dead: 2 });
    expect(stats.pagesByStatus).toEqual({ pending: 3, fetched: 2, notModified: 1, gone: 1, blocked: 1, error: 1, dead: 1 });
    expect(stats.findings).toEqual({ awaitingReview: 2, approved: 1, dismissed: 1 });
    expect(stats.lastRun).toEqual({
      activityAt: RUN_LAST_SEEN.toISOString(),
      findingRun: { runId: "run-x", firstSeenAt: RUN_FIRST_SEEN.toISOString(), lastSeenAt: RUN_LAST_SEEN.toISOString(), findings: 3 },
    });
  });

  it("is a fixed, bounded handful of statements and never selects an address column", async () => {
    canned(true);
    await getCrawlerStats(NOW);
    const calls = kysely.state.calls;
    expect(calls).toHaveLength(11);
    expect(callsOn("CrawlSource")).toHaveLength(3);
    expect(callsOn("CrawlPage")).toHaveLength(5);
    expect(callsOn("CrawlFinding")).toHaveLength(3);
    expect(calls.every((call) => call.op === "select")).toBe(true); // reads only
    for (const call of calls) {
      for (const select of (call.detail.selects as unknown[]) ?? []) {
        const source = typeof select === "string" ? select : String(select);
        expect(source, `${call.table}: ${source}`).not.toMatch(/urlEncrypted|urlDigest|domain|pageUrlEncrypted|imageUrlEncrypted|urlDigest/i);
      }
    }
  });

  it("groups in the database and applies the queue, day and run filters", async () => {
    canned(true);
    await getCrawlerStats(NOW);
    const groups = kysely.state.calls.map((call) => call.detail.groupBy);
    expect(groups).toContainEqual(["origin", "enabled"]);
    expect(groups).toContainEqual("status");
    expect(groups).toContainEqual("reviewStatus");

    const wheresOf = (table: string, at: number) => callsOn(table)[at]!.detail.wheres as unknown[][];
    // CrawlSource[1]: discovered today, from the UTC day start.
    expect(wheresOf("CrawlSource", 1)).toContainEqual(["origin", "=", "DISCOVERED"]);
    expect(wheresOf("CrawlSource", 1)).toContainEqual(["createdAt", ">=", DAY_START]);
    // CrawlPage[1]: fetched today. CrawlPage[2]: due. CrawlPage[3]: claimed.
    expect(wheresOf("CrawlPage", 1)).toContainEqual(["lastFetchedAt", ">=", DAY_START]);
    const dueWheres = wheresOf("CrawlPage", 2);
    expect(dueWheres).toContainEqual(["status", "not in", ["DEAD", "GONE"]]);
    expect(dueWheres).toContainEqual(["nextDueAt", "<=", NOW]);
    expect(String(dueWheres.find((w) => typeof w[0] === "function")![0])).toContain("claimedUntil");
    const claimedWheres = wheresOf("CrawlPage", 3);
    expect(claimedWheres).toContainEqual(["status", "not in", ["DEAD", "GONE"]]);
    expect(claimedWheres).toContainEqual(["claimedUntil", ">", NOW]);
    // CrawlFinding[1]: the newest run; CrawlFinding[2]: its window.
    const newest = callsOn("CrawlFinding")[1]!.detail;
    expect(newest.orderBy).toEqual(["lastSeenAt", "desc"]);
    expect(newest.limit).toBe(1);
    expect(wheresOf("CrawlFinding", 2)).toContainEqual(["runId", "=", "run-x"]);
  });

  it("asks one statement less when no finding has ever been reported", async () => {
    canned(false);
    const stats = await getCrawlerStats(NOW);
    expect(kysely.state.calls).toHaveLength(10);
    expect(stats.lastRun).toEqual({
      activityAt: LAST_SOURCE_CRAWL.toISOString(), // the source visit is the newest activity left
      findingRun: null,
    });
  });
});
