import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP5 (full-crawler spec) on the Prisma (Node) path, against a mocked
// client: one discovery report is the parent read, one existing-source read,
// one blocked-host read, then a LOCK-protected transaction (today's
// auto-enabled count plus one createMany with skipDuplicates plus one read
// for the created rows), and one batched audit insert. Promotion is one
// conditional update; the pause sweep is a bounded set of groupBy counts and
// one updateMany each way. Placeholder hosts only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    crawlSource: { findUnique: fn(), findMany: fn(), count: fn(), createMany: fn(), update: fn(), updateMany: fn() },
    crawlBlockedHost: { findMany: fn(), findFirst: fn() },
    crawlPage: { groupBy: fn(), count: fn() },
    crawlFinding: { findMany: fn() },
    auditLog: { findFirst: fn(), createMany: fn() },
    $transaction: fn(),
    $executeRawUnsafe: fn(),
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { promoteDiscoveredSource, recordCrawlDiscoveries, sweepDiscoveredCrawlSources, DISCOVERY_PAUSE_MS } from "@/lib/crawl-discoveries";

const NOW = new Date("2026-11-17T09:30:00Z");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "3000");
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  db.$executeRawUnsafe.mockResolvedValue(undefined);
  db.crawlSource.findUnique.mockResolvedValue({ id: "src-1", hops: 0, enabled: true });
  db.crawlSource.findMany.mockResolvedValue([]);
  db.crawlSource.count.mockResolvedValue(0);
  db.crawlSource.createMany.mockResolvedValue({ count: 0 });
  db.crawlSource.update.mockResolvedValue({});
  db.crawlSource.updateMany.mockResolvedValue({ count: 0 });
  db.crawlBlockedHost.findMany.mockResolvedValue([]);
  db.crawlBlockedHost.findFirst.mockResolvedValue(null);
  db.crawlPage.groupBy.mockResolvedValue([]);
  db.crawlFinding.findMany.mockResolvedValue([]);
  db.auditLog.findFirst.mockResolvedValue(null);
  db.auditLog.createMany.mockResolvedValue({ count: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("recordCrawlDiscoveries, Prisma path", () => {
  it("creates the planned hosts in one locked transaction: count, createMany, settle read, audit", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    db.crawlSource.findMany
      .mockResolvedValueOnce([]) // existing sources among the hosts
      .mockResolvedValueOnce([{ id: "disc-1", domain: "one.example.org", hops: 1, enabled: true, disabledReason: null }]);
    db.crawlSource.createMany.mockResolvedValue({ count: 1 });
    db.auditLog.findFirst.mockResolvedValue({ sequence: 7, eventHash: "previous-hash" });

    const { accepted } = await recordCrawlDiscoveries("src-1", "run-9", ["one.example.org"], NOW, "key-3");
    expect(accepted).toBe(1);

    // The parent must exist and be enabled.
    expect(db.crawlSource.findUnique).toHaveBeenCalledWith({ where: { id: "src-1" }, select: { id: true, hops: true, enabled: true } });
    // One read for existing sources, one for the blocked rows.
    expect(db.crawlSource.findMany.mock.calls[0][0]).toMatchObject({ where: { domain: { in: ["one.example.org"] } }, select: { domain: true } });
    expect(db.crawlBlockedHost.findMany).toHaveBeenCalledTimes(1);

    // The count and the insert share the LOCK-protected transaction.
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith('LOCK TABLE "CrawlSource" IN EXCLUSIVE MODE');
    expect(db.crawlSource.count).toHaveBeenCalledWith({ where: { origin: "DISCOVERED", enabled: true, createdAt: { gte: expect.any(Date) } } });
    expect(db.crawlSource.createMany).toHaveBeenCalledTimes(1);
    expect(db.crawlSource.createMany.mock.calls[0][0].data[0]).toMatchObject({
      domain: "one.example.org", pageBudget: 200, delayMs: 1500, enabled: true, approvedBy: null,
      origin: "DISCOVERED", hops: 1, discoveredFromId: "src-1", render: "HTTP",
      lastCrawledAt: null, pagesCrawled: 0, pausedUntil: null, pauseReason: null, disabledReason: null,
    });
    expect(db.crawlSource.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(db.crawlSource.findMany.mock.calls[1][0]).toMatchObject({ where: { domain: { in: ["one.example.org"] } } });

    // One batched, hash-chained audit write, the service key as the actor.
    expect(db.auditLog.createMany).toHaveBeenCalledTimes(1);
    const rows = db.auditLog.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sequence: 8, previousHash: "previous-hash", eventType: "CRAWL_SOURCE_DISCOVERED", entityId: "disc-1", actorId: "crawler:key-3" });
    expect(rows[0].data).toMatchObject({ action: "crawl_source_discovered", domain: "one.example.org", hops: 1, enabled: true, runId: "run-9" });
  });

  it("respects the daily auto-enable cap from the count inside the lock", async () => {
    vi.stubEnv("CRAWLER_MAX_NEW_SITES_PER_DAY", "1");
    db.crawlSource.count.mockResolvedValue(0);
    db.crawlSource.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "disc-1", domain: "one.example.org", hops: 1, enabled: true, disabledReason: null },
        { id: "disc-2", domain: "two.example.org", hops: 1, enabled: false, disabledReason: "daily_cap" },
      ]);
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-9", ["one.example.org", "two.example.org"], NOW);
    expect(accepted).toBe(2);
    const data = db.crawlSource.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data[0]).toMatchObject({ domain: "one.example.org", enabled: true, disabledReason: null });
    expect(data[1]).toMatchObject({ domain: "two.example.org", enabled: false, disabledReason: "daily_cap" });
  });

  it("a host a concurrent report created first is skipped by the settle read, not an error", async () => {
    db.crawlSource.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "disc-1", domain: "one.example.org", hops: 1, enabled: true, disabledReason: null }]);
    const { accepted } = await recordCrawlDiscoveries("src-1", "run-9", ["one.example.org", "two.example.org"], NOW);
    expect(accepted).toBe(1);
  });

  it("answers zero without any transaction when the parent is disabled or nothing is planned", async () => {
    db.crawlSource.findUnique.mockResolvedValue({ id: "src-1", hops: 0, enabled: false });
    expect((await recordCrawlDiscoveries("src-1", "run-9", ["x.example.org"], NOW)).accepted).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
    db.crawlSource.findUnique.mockResolvedValue({ id: "src-1", hops: 0, enabled: true });
    expect((await recordCrawlDiscoveries("src-1", "run-9", ["instagram.com"], NOW)).accepted).toBe(0);
    expect(db.crawlBlockedHost.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("promoteDiscoveredSource, Prisma path", () => {
  it("resets hops and raises the budget on a discovered source, once", async () => {
    db.crawlSource.findUnique.mockResolvedValue({ id: "disc-1", domain: "found.example.org", origin: "DISCOVERED", hops: 2, pageBudget: 200 });
    expect(await promoteDiscoveredSource("disc-1", "key-1")).toBe(true);
    expect(db.crawlSource.update).toHaveBeenCalledWith({ where: { id: "disc-1" }, data: { hops: 0, pageBudget: 3000 } });

    db.crawlSource.findUnique.mockResolvedValue({ id: "disc-1", domain: "found.example.org", origin: "DISCOVERED", hops: 0, pageBudget: 3000 });
    expect(await promoteDiscoveredSource("disc-1", "key-1")).toBe(false);
    expect(db.crawlSource.update).toHaveBeenCalledTimes(1);
  });
});

describe("sweepDiscoveredCrawlSources, Prisma path", () => {
  it("resumes an expired pause with one updateMany, then pauses spent sites with one updateMany", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    // No expired pause, one enabled candidate.
    db.crawlSource.findMany
      .mockResolvedValueOnce([]) // expired pauses
      .mockResolvedValueOnce([{ id: "disc-1", domain: "found.example.org", pageBudget: 2 }]); // candidates
    // The fake answers each of the three day-count groupBys alike.
    db.crawlPage.groupBy.mockResolvedValue([{ sourceId: "disc-1", _count: { _all: 2 } }]);
    db.crawlFinding.findMany.mockResolvedValue([]);

    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 1, resumed: 0 });

    expect(db.crawlPage.groupBy).toHaveBeenCalledTimes(3);
    expect(db.crawlPage.groupBy.mock.calls[0][0]).toMatchObject({ by: ["sourceId"], where: { sourceId: { in: ["disc-1"] }, lastFetchedAt: { gte: expect.any(Date), lt: expect.any(Date) } } });
    expect(db.crawlFinding.findMany).toHaveBeenCalledWith({ where: { sourceId: { in: ["disc-1"] }, lastSeenAt: { gte: expect.any(Date) } }, select: { sourceId: true }, distinct: ["sourceId"] });

    expect(db.crawlSource.updateMany).toHaveBeenCalledTimes(1);
    expect(db.crawlSource.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["disc-1"] } },
      data: { enabled: false, pausedUntil: new Date(NOW.getTime() + DISCOVERY_PAUSE_MS), pauseReason: "no_match_budget_spent" },
    });

    // Both audit directions ride one batched write.
    const rows = db.auditLog.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.eventType)).toEqual(["CRAWL_SOURCE_PAUSED"]);
  });

  it("does not pause a source with a finding in the window", async () => {
    db.crawlSource.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "disc-1", domain: "found.example.org", pageBudget: 2 }]);
    db.crawlPage.groupBy.mockResolvedValue([{ sourceId: "disc-1", _count: { _all: 5 } }]);
    db.crawlFinding.findMany.mockResolvedValue([{ sourceId: "disc-1" }]);
    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 0, resumed: 0 });
    expect(db.crawlSource.updateMany).not.toHaveBeenCalled();
  });

  it("resumes an expired pause", async () => {
    db.crawlSource.findMany
      .mockResolvedValueOnce([{ id: "disc-1", domain: "found.example.org", pageBudget: 2 }]) // expired pauses
      .mockResolvedValueOnce([]); // no further pause candidates
    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 0, resumed: 1 });
    // Only rows still disabled and still paused are resumed (review fix: an
    // admin's "off" clears the pause and must never be undone by the sweep).
    expect(db.crawlSource.findMany.mock.calls[0][0].where).toEqual({
      origin: "DISCOVERED", enabled: false, pauseReason: { not: null }, pausedUntil: { lte: NOW },
    });
    expect(db.crawlSource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["disc-1"] }, enabled: false, pauseReason: { not: null } },
      data: { enabled: true, pausedUntil: null, pauseReason: null },
    });
  });
});
