import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP8 (full-crawler spec) on the Prisma (Node) path, against a mocked
// client: the aggregates come from groupBy / count / aggregate / one
// findFirst of a run id — never a findMany of pages, findings or sources —
// and the filters match the memory and Kysely paths (DEAD/GONE excluded
// from the live queue, the UTC day start, the 30-minute claim window).
// Placeholder hosts only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    crawlSource: { groupBy: fn(), count: fn(), aggregate: fn() },
    crawlPage: { groupBy: fn(), count: fn(), aggregate: fn() },
    crawlFinding: { groupBy: fn(), count: fn(), aggregate: fn(), findFirst: fn() },
  };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { getCrawlerStats } from "@/lib/crawl-stats";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const DAY_START = new Date("2026-11-17T00:00:00.000Z");
const LAST_SOURCE_CRAWL = new Date("2026-11-17T08:35:00.000Z");
const LAST_PAGE_FETCH = new Date("2026-11-17T08:20:00.000Z");
const RUN_FIRST_SEEN = new Date("2026-11-17T07:30:00.000Z");
const RUN_LAST_SEEN = new Date("2026-11-17T08:40:00.000Z");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  db.crawlSource.groupBy.mockResolvedValue([
    { origin: "ADMIN", enabled: true, _count: { _all: 3 } },
    { origin: "ADMIN", enabled: false, _count: { _all: 2 } },
    { origin: "REPORTED", enabled: true, _count: { _all: 1 } },
    { origin: "DISCOVERED", enabled: false, _count: { _all: 4 } },
  ]);
  db.crawlSource.count.mockResolvedValue(2); // discovered today
  db.crawlSource.aggregate.mockResolvedValue({ _max: { lastCrawledAt: LAST_SOURCE_CRAWL } });
  db.crawlPage.groupBy.mockResolvedValue([
    { status: "PENDING", _count: { _all: 3 } },
    { status: "FETCHED", _count: { _all: 2 } },
    { status: "NOT_MODIFIED", _count: { _all: 1 } },
    { status: "GONE", _count: { _all: 1 } },
    { status: "BLOCKED", _count: { _all: 1 } },
    { status: "ERROR", _count: { _all: 1 } },
    { status: "DEAD", _count: { _all: 1 } },
  ]);
  db.crawlPage.count.mockReset();
  db.crawlPage.count.mockResolvedValueOnce(4) // fetched today
    .mockResolvedValueOnce(1) // due
    .mockResolvedValueOnce(2); // claimed
  db.crawlPage.aggregate.mockResolvedValue({ _max: { lastFetchedAt: LAST_PAGE_FETCH } });
  db.crawlFinding.groupBy.mockResolvedValue([
    { reviewStatus: "CANDIDATE", _count: { _all: 2 } },
    { reviewStatus: "APPROVED", _count: { _all: 1 } },
    { reviewStatus: "DISMISSED", _count: { _all: 1 } },
  ]);
  db.crawlFinding.findFirst.mockResolvedValue({ runId: "run-x" });
  db.crawlFinding.aggregate.mockResolvedValue({ _count: { _all: 3 }, _min: { firstSeenAt: RUN_FIRST_SEEN }, _max: { lastSeenAt: RUN_LAST_SEEN } });
  db.crawlFinding.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getCrawlerStats, Prisma path", () => {
  it("assembles the aggregates from the database-computed groups", async () => {
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

  it("aggregates in the database: groupBy, counts and one findFirst of a run id, never findMany", async () => {
    await getCrawlerStats(NOW);
    expect(db.crawlSource.groupBy).toHaveBeenCalledWith({ by: ["origin", "enabled"], _count: { _all: true } });
    expect(db.crawlPage.groupBy).toHaveBeenCalledWith({ by: ["status"], _count: { _all: true } });
    expect(db.crawlFinding.groupBy).toHaveBeenCalledWith({ by: ["reviewStatus"], _count: { _all: true } });
    expect(db.crawlFinding.findFirst).toHaveBeenCalledWith({ orderBy: { lastSeenAt: "desc" }, select: { runId: true } });
    expect(db.crawlFinding.aggregate).toHaveBeenCalledWith({
      where: { runId: "run-x" },
      _count: { _all: true },
      _min: { firstSeenAt: true },
      _max: { lastSeenAt: true },
    });
    // The only full-table reads are the aggregates; no row of pages,
    // findings or sources is ever loaded into the app.
    const client = db as unknown as Record<string, Record<string, { mock?: { calls: unknown[] } }>>;
    for (const model of ["crawlSource", "crawlPage", "crawlFinding"]) {
      for (const method of ["findMany", "findFirstOrThrow", "findUnique"]) {
        expect(client[model][method]?.mock?.calls ?? []).toHaveLength(0);
      }
    }
  });

  it("applies the queue, day and discovery filters the other paths use", async () => {
    await getCrawlerStats(NOW);
    expect(db.crawlSource.count).toHaveBeenCalledWith({ where: { origin: "DISCOVERED", createdAt: { gte: DAY_START } } });
    expect(db.crawlPage.count).toHaveBeenNthCalledWith(1, { where: { lastFetchedAt: { gte: DAY_START } } });
    expect(db.crawlPage.count).toHaveBeenNthCalledWith(2, {
      where: { status: { notIn: ["DEAD", "GONE"] }, nextDueAt: { lte: NOW }, OR: [{ claimedUntil: null }, { claimedUntil: { lt: NOW } }] },
    });
    expect(db.crawlPage.count).toHaveBeenNthCalledWith(3, { where: { status: { notIn: ["DEAD", "GONE"] }, claimedUntil: { gt: NOW } } });
  });

  it("skips the run aggregation when no finding has ever been reported", async () => {
    db.crawlFinding.findFirst.mockResolvedValue(null);
    const stats = await getCrawlerStats(NOW);
    expect(db.crawlFinding.aggregate).not.toHaveBeenCalled();
    expect(stats.lastRun).toEqual({ activityAt: LAST_SOURCE_CRAWL.toISOString(), findingRun: null });
  });
});
