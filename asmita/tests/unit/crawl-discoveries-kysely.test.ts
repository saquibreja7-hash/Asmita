import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP5 (full-crawler spec) on the Kysely (Worker) path, against a recording
// fake in the style of the other crawler tests. What the Worker limits make
// the real test: one discovery report is a FIXED handful of queries whatever
// the host count (a Worker request may make ~1000 subrequests), the daily
// auto-enable count and the insert share one transaction that holds
// CrawlSource exclusively (so two concurrent reports cannot both spend the
// last slot), the insert is one statement with ON CONFLICT DO NOTHING, and
// every created source is audited in one batched, hash-chained write. The
// pause sweep is bounded too: one candidates read, one grouped count per
// day of the window, one distinct findings read, one update each way.
// Placeholder hosts only.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    // Simulates ON CONFLICT DO NOTHING losing rows (a concurrent request won them).
    insertResult: null as null | ((rows: Array<Record<string, unknown>>) => Array<Record<string, unknown>>),
  };

  function builder(op: string, table: string, detail: Record<string, unknown>) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "execute" || prop === "executeTakeFirst" || prop === "executeTakeFirstOrThrow") {
            return async () => {
              const takeFirst = prop !== "execute";
              let rows: Array<Record<string, unknown>>;
              if (op === "insert") {
                const all = Array.isArray(detail.values) ? detail.values : [detail.values];
                const inserted = state.insertResult
                  ? state.insertResult(all as Array<Record<string, unknown>>)
                  : (all as Array<Record<string, unknown>>).map((row) => ({ ...row }));
                rows = inserted;
              } else {
                rows = (state.rows[table] ?? []).map((row) => ({ ...row }));
              }
              return takeFirst ? rows[0] : rows;
            };
          }
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
            else if (prop === "returning") detail.returning = args[0];
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
            else if (prop === "onConflict") detail.onConflict = true; // the callback never runs in the fake
            else if (prop === "groupBy") detail.groupBy = args[0];
            else if (prop === "distinct") detail.distinct = true;
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

  // RawBuilder.execute(executorProvider) asks for getExecutor() (the two
  // LOCK TABLE fragments): recorded separately from the query builders.
  const executeQuery = vi.fn(async () => ({ rows: [] }));
  const executor = {
    transformQuery: (node: unknown) => node,
    compileQuery: () => ({}),
    executeQuery,
  };

  const db = {
    selectFrom: (name: string) => record("select", name),
    insertInto: (name: string) => record("insert", name),
    updateTable: (name: string) => record("update", name),
    deleteFrom: (name: string) => record("delete", name),
    transaction: () => ({ execute: async (run: (tx: unknown) => Promise<unknown>) => run(db) }),
    getExecutor: () => executor,
  };
  return { db, state, executeQuery };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => true, getWorkerDb: () => kysely.db }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import { promoteDiscoveredSource, recordCrawlDiscoveries, sweepDiscoveredCrawlSources, DISCOVERY_PAUSE_MS } from "@/lib/crawl-discoveries";

const NOW = new Date("2026-11-17T09:30:00Z");

/** The reporting parent; the fake returns the first row for every CrawlSource select. */
function seedParent(over: Record<string, unknown> = {}) {
  kysely.state.rows.CrawlSource = [{ id: "src-1", kind: "SITE", domain: "seed.example.org", pageBudget: 50, delayMs: 500, enabled: true, origin: "ADMIN", hops: 0, ...over }];
}

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "3000");
  kysely.state.rows = {};
  kysely.state.calls.length = 0;
  kysely.state.insertResult = null;
  kysely.executeQuery.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("recordCrawlDiscoveries, Kysely path", () => {
  it("stores 200 hosts through a fixed handful of queries, one bulk insert, one audit batch", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    seedParent();
    const hosts = Array.from({ length: 200 }, (_, i) => `site-${i}.example.org`);
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-1", hosts, NOW, "key-1");
    expect(accepted).toBe(200);

    expect(kysely.state.calls.map((call) => `${call.op} ${call.table}`)).toEqual([
      "select CrawlSource", // the reporting parent
      "select CrawlSource", // existing sources among the hosts
      "select CrawlBlockedHost", // blocked rows over every host and parent
      "select CrawlSource", // today's auto-enabled count, inside the lock
      "insert CrawlSource", // one statement, ON CONFLICT DO NOTHING
      "select audit_log", // the batched audit write chains onto the last row
      "insert audit_log",
    ]);

    const insert = callsOn("CrawlSource").find((call) => call.op === "insert")!;
    expect(insert.detail.onConflict).toBe(true);
    expect(insert.detail.returning).toEqual(["id", "domain", "hops", "enabled", "disabledReason"]);
    const rows = insert.detail.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(200);
    expect(rows[0]).toMatchObject({
      kind: "SITE", domain: "site-0.example.org", pageBudget: 200, delayMs: 1500,
      enabled: true, approvedBy: null, origin: "DISCOVERED", hops: 1,
      discoveredFromId: "src-1", render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
      pausedUntil: null, pauseReason: null,
    });

    // The discovery transaction holds CrawlSource exclusively around the
    // count and the insert; the audit batch takes the audit_log lock.
    expect(kysely.executeQuery).toHaveBeenCalledTimes(2);
    const auditRows = callsOn("audit_log").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(auditRows).toHaveLength(200);
    expect(auditRows[0]).toMatchObject({ eventType: "CRAWL_SOURCE_DISCOVERED", actorId: "crawler:key-1" });
    expect(auditRows[0].data).toMatchObject({ action: "crawl_source_discovered", domain: "site-0.example.org", hops: 1, enabled: true, runId: "run-1" });
  });

  it("counts the day's auto-enables inside the lock, so the cap is exact", async () => {
    vi.stubEnv("CRAWLER_MAX_NEW_SITES_PER_DAY", "3");
    // The fake answers every CrawlSource select with the first row; a `count`
    // property on it stands in for the day's already-enabled count.
    seedParent({ count: 2 });
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-1", ["one.example.org", "two.example.org"], NOW);
    expect(accepted).toBe(2);
    const rows = callsOn("CrawlSource").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ domain: "one.example.org", enabled: true, disabledReason: null });
    expect(rows[1]).toMatchObject({ domain: "two.example.org", enabled: false, disabledReason: "daily_cap" });
  });

  it("stores deeper-than-limit hosts disabled with the reason", async () => {
    vi.stubEnv("CRAWLER_MAX_DISCOVERY_HOPS", "1");
    seedParent({ hops: 1 });
    await recordCrawlDiscoveries("src-1", "run-1", ["deep.example.org"], NOW);
    const rows = callsOn("CrawlSource").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ domain: "deep.example.org", hops: 2, enabled: false, disabledReason: "max_hops" });
  });

  it("a host another report created between the plan and the insert is skipped, not an error", async () => {
    seedParent();
    kysely.state.insertResult = (rows) => rows.slice(0, 1); // only the first row wins
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-1", ["kept.example.org", "lost.example.org"], NOW);
    expect(accepted).toBe(1);
  });

  it("writes no audit rows when nothing was created", async () => {
    seedParent();
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-1", ["seed.example.org"], NOW);
    expect(accepted).toBe(0);
    expect(callsOn("audit_log")).toHaveLength(0);
    expect(callsOn("CrawlSource").filter((call) => call.op === "insert")).toHaveLength(0);
  });
});

describe("promoteDiscoveredSource, Kysely path", () => {
  it("resets hops and raises the budget on a discovered source, once", async () => {
    kysely.state.rows.CrawlSource = [{ id: "disc-1", domain: "found.example.org", origin: "DISCOVERED", hops: 2, pageBudget: 200 }];
    await promoteDiscoveredSource("disc-1", "key-1");
    const update = callsOn("CrawlSource").find((call) => call.op === "update")!;
    expect(update.detail.set).toMatchObject({ hops: 0, pageBudget: 3000 });
    expect((update.detail.wheres as unknown[][]).flat()).toEqual(expect.arrayContaining(["id", "disc-1", "origin", "DISCOVERED"]));

    // Already promoted: no second write.
    kysely.state.rows.CrawlSource = [{ id: "disc-1", domain: "found.example.org", origin: "DISCOVERED", hops: 0, pageBudget: 3000 }];
    kysely.state.calls.length = 0;
    expect(await promoteDiscoveredSource("disc-1", "key-1")).toBe(false);
    expect(callsOn("CrawlSource").filter((call) => call.op === "update")).toHaveLength(0);
  });

  it("never touches a non-discovered source", async () => {
    kysely.state.rows.CrawlSource = [{ id: "admin-1", domain: "seed.example.org", origin: "ADMIN", hops: 0, pageBudget: 50 }];
    expect(await promoteDiscoveredSource("admin-1", "key-1")).toBe(false);
    expect(callsOn("CrawlSource").filter((call) => call.op === "update")).toHaveLength(0);
  });
});

describe("sweepDiscoveredCrawlSources, Kysely path", () => {
  it("resumes expired pauses and pauses three-times-spent sites in bounded statements", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    // The fake answers every CrawlSource select with the first row, so the
    // same row flows through both the resume scan and the candidates read.
    kysely.state.rows.CrawlSource = [{ id: "disc-1", domain: "found.example.org", origin: "DISCOVERED", enabled: true, hops: 1, pageBudget: 2 }];
    // The per-day fetch counters (review fix: not CrawlPage.lastFetchedAt,
    // which a revisit overwrites): the budget was spent on all three days.
    kysely.state.rows.CrawlSourceDay = [0, 1, 2].map((back) => ({ sourceId: "disc-1", day: new Date(Date.UTC(2026, 10, 17 - back)), pagesFetched: 2 }));
    kysely.state.rows.CrawlFinding = [];

    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 1, resumed: 1 });

    expect(kysely.state.calls.map((call) => `${call.op} ${call.table}`)).toEqual([
      "select CrawlSource", // expired pauses
      "select CrawlBlockedHost", // a blocked host is never resumed (review fix)
      "update CrawlSource", // resume (or clear) them
      "select CrawlSource", // enabled discovered candidates
      "select CrawlSourceDay", // per-day fetch counters, one read for the window
      "select CrawlFinding", // any finding in the window
      "update CrawlSource", // pause
      "select audit_log", // the batched audit write chains onto the last row
      "insert audit_log", // one batched write, both directions
      "delete CrawlSourceDay", // prune counters older than a week
    ]);

    const [resume, pause] = callsOn("CrawlSource").filter((call) => call.op === "update");
    expect(resume!.detail.set).toMatchObject({ enabled: true, pausedUntil: null, pauseReason: null });
    // Only rows still disabled and still paused are resumed (review fix).
    const resumeScan = callsOn("CrawlSource").find((call) => call.op === "select")!;
    expect(resumeScan.detail.wheres).toEqual(expect.arrayContaining([["enabled", "=", false], ["pauseReason", "is not", null]]));
    expect(resume!.detail.wheres).toEqual(expect.arrayContaining([["enabled", "=", false], ["pauseReason", "is not", null]]));
    expect(pause!.detail.set).toMatchObject({ enabled: false, pauseReason: "no_match_budget_spent" });
    expect((pause!.detail.set as Record<string, unknown>).pausedUntil).toEqual(new Date(NOW.getTime() + DISCOVERY_PAUSE_MS));

    const auditRows = callsOn("audit_log").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(auditRows.map((row) => row.eventType).sort()).toEqual(["CRAWL_SOURCE_PAUSED", "CRAWL_SOURCE_RESUMED"]);
  });
});
