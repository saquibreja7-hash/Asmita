import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP3 (full-crawler spec) on the Prisma (Node) path, against a mocked client:
// the claim selects due rows with FOR UPDATE SKIP LOCKED through $queryRaw
// inside the transaction and marks them claimed; the report applies each
// page's schedule, inserts new links with skipDuplicates (a concurrent insert
// of the same digest is not an error) and moves the source counters; the seed
// insert loses the race politely on P2002. Placeholder hosts only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    crawlSource: { findUnique: fn(), update: fn() },
    crawlPage: { count: fn(), create: fn(), findMany: fn(), update: fn(), createMany: fn(), updateMany: fn(), deleteMany: fn() },
    $queryRaw: fn(),
    $transaction: fn(),
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { encryptField } from "@/lib/encryption";
import { claimCrawlPages, reportCrawlPages } from "@/lib/crawl-pages";
import { purgeExpiredCrawlPages } from "@/lib/url-retention";

const NOW = new Date("2026-11-17T09:00:00Z");
const SOURCE = { id: "src-1", domain: "k.example", pageBudget: 50, enabled: true };
const SEED_ROW = {
  id: "page-1",
  urlEncrypted: encryptField("https://k.example/"),
  depth: 0,
  etag: null,
  lastModified: null,
};
const CURRENT_ROW = {
  id: "page-1", sourceId: SOURCE.id, depth: 0, status: "PENDING",
  nextDueAt: new Date(0), lastFetchedAt: null, failCount: 0, etag: null, lastModified: null,
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  db.crawlSource.findUnique.mockResolvedValue({ ...SOURCE });
  db.crawlPage.count.mockResolvedValue(0);
  db.crawlPage.create.mockResolvedValue({});
  db.crawlPage.findMany.mockResolvedValue([]);
  db.crawlPage.update.mockResolvedValue({});
  db.crawlPage.createMany.mockResolvedValue({ count: 0 });
  db.crawlPage.updateMany.mockResolvedValue({ count: 0 });
  db.crawlPage.deleteMany.mockResolvedValue({ count: 0 });
  db.crawlSource.update.mockResolvedValue({});
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("claimCrawlPages, Prisma path", () => {
  it("creates the seed, then claims due rows locked and marks them claimed", async () => {
    // First claim: no rows -> seed insert, then nothing due in the raw select.
    db.crawlPage.count.mockResolvedValueOnce(0); // hasPages
    db.crawlPage.count.mockResolvedValueOnce(0); // pagesFetchedToday
    db.$queryRaw.mockResolvedValueOnce([]);
    expect(await claimCrawlPages(SOURCE.id, 10, NOW)).toEqual([]);
    expect(db.crawlPage.create).toHaveBeenCalledWith({
      // depth/kind/status come from schema defaults; the seed names the rest.
      data: expect.objectContaining({ sourceId: SOURCE.id, nextDueAt: new Date(0) }),
    });

    // Second claim: one due row from the locked select.
    db.crawlPage.count.mockResolvedValueOnce(1); // hasPages: the seed exists
    db.crawlPage.count.mockResolvedValueOnce(0); // fetched today: none
    db.$queryRaw.mockResolvedValueOnce([{ ...SEED_ROW }]);
    const urls = await claimCrawlPages(SOURCE.id, 10, NOW);
    expect(urls).toEqual([{ id: "page-1", url: "https://k.example/", depth: 0, etag: null, lastModified: null }]);
    const raw = String(db.$queryRaw.mock.calls.at(-1)![0]);
    expect(raw).toContain("FOR UPDATE SKIP LOCKED");
    expect(raw).toContain('"claimedUntil" IS NULL');
    expect(raw).toContain('"status" NOT IN');
    expect(db.crawlPage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["page-1"] } },
      data: { claimedUntil: new Date(NOW.getTime() + 30 * 60 * 1000) },
    });
  });

  it("loses the seed race politely on a unique violation", async () => {
    db.crawlPage.count.mockResolvedValue(0); // hasPages: no rows yet
    db.crawlPage.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.$queryRaw.mockResolvedValue([]);
    expect(await claimCrawlPages(SOURCE.id, 10, NOW)).toEqual([]);
  });

  it("hands out nothing once the day's budget is spent", async () => {
    db.crawlPage.count.mockResolvedValueOnce(1); // hasPages
    db.crawlPage.count.mockResolvedValueOnce(50); // fetched today == pageBudget
    expect(await claimCrawlPages(SOURCE.id, 10, NOW)).toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("reportCrawlPages, Prisma path", () => {
  it("schedules the page, inserts links with skipDuplicates, updates the source", async () => {
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", etag: "v1", links: [{ url: "https://k.example/child", kind: "page" }] },
    ], NOW);
    expect(accepted).toBe(1);

    expect(db.crawlPage.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: expect.objectContaining({ status: "FETCHED", failCount: 0, claimedUntil: null, etag: "v1" }),
    });
    expect(db.crawlPage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ sourceId: SOURCE.id, depth: 1, kind: "PAGE", status: "PENDING" })]),
      skipDuplicates: true,
    });
    expect(db.crawlSource.update).toHaveBeenCalledWith({
      where: { id: SOURCE.id },
      data: { pagesCrawled: { increment: 1 }, lastCrawledAt: NOW },
    });
  });

  it("a dead row is never resurrected and is not counted", async () => {
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW, status: "DEAD", failCount: 5 }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [{ id: "page-1", status: "fetched", links: [] }], NOW);
    expect(accepted).toBe(0);
    expect(db.crawlPage.update).not.toHaveBeenCalled();
    expect(db.crawlSource.update).not.toHaveBeenCalled();
  });
});

describe("purgeExpiredCrawlPages, Prisma path", () => {
  it("deletes rows past retention unless they are still due for crawling", async () => {
    db.crawlPage.deleteMany.mockResolvedValue({ count: 7 });
    expect(await purgeExpiredCrawlPages(NOW)).toBe(7);
    const where = db.crawlPage.deleteMany.mock.calls[0]![0].where;
    expect(where.AND[1].OR).toEqual([
      { status: { in: ["DEAD", "GONE"] } },
      { nextDueAt: { gt: NOW } },
    ]);
  });
});
