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
    crawlSourceDay: { upsert: fn() },
    crawlBlockedHost: { findFirst: fn() },
    $queryRaw: fn(),
    $executeRaw: fn(),
    $transaction: fn(),
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { encryptField } from "@/lib/encryption";
import { claimCrawlPages, crawlPageDigest, crawlPageLegacyDigests, reportCrawlPages } from "@/lib/crawl-pages";
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
  db.crawlSourceDay.upsert.mockResolvedValue({});
  db.crawlBlockedHost.findFirst.mockResolvedValue(null);
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

describe("claim budget under concurrency, Prisma path (review fix)", () => {
  it("locks the source row first, then subtracts fetched and still-claimed rows inside the transaction", async () => {
    db.crawlPage.count.mockResolvedValueOnce(1); // hasPages
    db.crawlPage.count.mockResolvedValueOnce(30); // fetched today
    db.crawlPage.count.mockResolvedValueOnce(15); // claimed, not yet reported
    db.$queryRaw.mockResolvedValueOnce([]);
    await claimCrawlPages(SOURCE.id, 10, NOW);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const lock = db.$executeRaw.mock.calls[0]!;
    expect((lock[0] as string[]).join("?")).toContain('FROM "CrawlSource" WHERE "id" = ? FOR UPDATE');
    expect(lock[1]).toBe(SOURCE.id);
    // The lock comes before the budget counts, which run on the transaction.
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.crawlPage.count.mock.invocationCallOrder[1]!);
    expect(db.crawlPage.count.mock.calls[2]![0]).toEqual({
      where: {
        sourceId: SOURCE.id, claimedUntil: { gt: NOW },
        OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: new Date("2026-11-17T00:00:00Z") } }],
      },
    });
    // Budget 50 - 30 fetched - 15 out = 5, below the claim limit of 10.
    const raw = db.$queryRaw.mock.calls[0]!;
    expect(raw.slice(1)).toContain(5);
    expect(raw.slice(1)).not.toContain(10);
  });

  it("claims nothing when the outstanding claims use up the rest of the budget", async () => {
    db.crawlPage.count.mockResolvedValueOnce(1);
    db.crawlPage.count.mockResolvedValueOnce(40);
    db.crawlPage.count.mockResolvedValueOnce(10);
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
    // The per-day fetch counter for the UTC day (review fix).
    const day = new Date("2026-11-17T00:00:00Z");
    expect(db.crawlSourceDay.upsert).toHaveBeenCalledWith({
      where: { sourceId_day: { sourceId: SOURCE.id, day } },
      create: { sourceId: SOURCE.id, day, pagesFetched: 1 },
      update: { pagesFetched: { increment: 1 } },
    });
  });

  it("a dead row is never resurrected and is not counted", async () => {
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW, status: "DEAD", failCount: 5 }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [{ id: "page-1", status: "fetched", links: [] }], NOW);
    expect(accepted).toBe(0);
    expect(db.crawlPage.update).not.toHaveBeenCalled();
    expect(db.crawlSource.update).not.toHaveBeenCalled();
    expect(db.crawlSourceDay.upsert).not.toHaveBeenCalled();
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
      // Review fix: rows of a switched-off (disabled or paused) source go too.
      { source: { enabled: false } },
    ]);
  });
});

describe("per-source frontier cap, Prisma path (review fix)", () => {
  it("locks the source and stores only as many new links as the cap leaves room for", async () => {
    vi.stubEnv("CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE", "1000");
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW }]);
    db.crawlPage.count.mockResolvedValueOnce(998); // rows the source already holds
    const links = ["a", "b", "c", "d"].map((path) => ({ url: `https://k.example/${path}`, kind: "page" as const }));
    await reportCrawlPages(SOURCE.id, "run-1", [{ id: "page-1", status: "fetched", links }], NOW);
    expect((db.$executeRaw.mock.calls[0]![0] as string[]).join("?")).toContain('FROM "CrawlSource" WHERE "id" = ? FOR UPDATE');
    expect(db.crawlPage.count).toHaveBeenCalledWith({ where: { sourceId: SOURCE.id } });
    expect(db.crawlPage.createMany).toHaveBeenCalledTimes(1);
    expect(db.crawlPage.createMany.mock.calls[0]![0].data).toHaveLength(2);
  });

  it("stores no link once the source is full, but still schedules the page", async () => {
    vi.stubEnv("CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE", "1000");
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW }]);
    db.crawlPage.count.mockResolvedValueOnce(1000);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", links: [{ url: "https://k.example/x", kind: "page" }] },
    ], NOW);
    expect(accepted).toBe(1);
    expect(db.crawlPage.createMany).not.toHaveBeenCalled();
    expect(db.crawlPage.update).toHaveBeenCalledTimes(1);
  });
});

describe("crawl order (WP11), Prisma path", () => {
  it("orders the locked claim by priority, then nextDueAt", async () => {
    db.crawlPage.count.mockResolvedValueOnce(1); // hasPages: rows exist
    db.crawlPage.count.mockResolvedValueOnce(0); // fetched today: none
    db.crawlPage.count.mockResolvedValueOnce(0); // out with a crawler: none
    db.$queryRaw.mockResolvedValueOnce([{ ...SEED_ROW }]);
    const urls = await claimCrawlPages(SOURCE.id, 10, NOW);
    expect(urls).toHaveLength(1);
    const raw = String(db.$queryRaw.mock.calls.at(-1)![0]);
    expect(raw).toContain("FOR UPDATE SKIP LOCKED");
    expect(raw).toContain('ORDER BY "priority" ASC, "nextDueAt" ASC');
  });

  it("stores each link with the priority its kind implies", async () => {
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      {
        id: "page-1", status: "fetched",
        links: [
          { url: "https://k.example/s.xml", kind: "sitemap" },
          { url: "https://k.example/f.rss", kind: "feed" },
          { url: "https://k.example/list?page=2", kind: "page", pagination: true },
          { url: "https://k.example/deep", kind: "page" },
        ],
      },
    ], NOW);
    expect(accepted).toBe(1);
    expect(db.crawlPage.createMany).toHaveBeenCalledTimes(1);
    const data = db.crawlPage.createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(data.find((r) => r.kind === "SITEMAP")).toMatchObject({ priority: 10, depth: 1, status: "PENDING" });
    expect(data.find((r) => r.kind === "FEED")).toMatchObject({ priority: 20, depth: 1 });
    expect(data.find((r) => r.kind === "PAGE" && r.priority === 30)).toMatchObject({ depth: 1 }); // the pagination link
    expect(data.find((r) => r.kind === "PAGE" && r.priority === 60)).toMatchObject({ depth: 1 }); // the plain page
  });

  it("bumps a row whose reported lastmod is newer than its last fetch", async () => {
    const childUrl = "https://k.example/child";
    const childDigest = crawlPageDigest(SOURCE.id, childUrl);
    db.crawlPage.findMany
      .mockResolvedValueOnce([{ ...CURRENT_ROW }]) // the claimed page rows
      // The WP11 digest read: the linked page's row, fetched an hour ago.
      .mockResolvedValueOnce([{ ...CURRENT_ROW, id: "page-child", urlDigest: childDigest, status: "FETCHED", lastFetchedAt: new Date("2026-11-17T08:00:00Z") }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", links: [{ url: childUrl, kind: "page", lastmod: "2026-11-17T10:00:00Z" }] },
    ], NOW);
    expect(accepted).toBe(1);
    expect(db.crawlPage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["page-child"] }, sourceId: SOURCE.id, status: { notIn: ["DEAD", "GONE"] } },
      data: { priority: 5, nextDueAt: NOW },
    });
  });

  it("no bump when the lastmod is older, the row was never fetched, or it is dead", async () => {
    const childUrl = "https://k.example/child";
    const childDigest = crawlPageDigest(SOURCE.id, childUrl);
    for (const row of [
      { ...CURRENT_ROW, id: "page-child", urlDigest: childDigest, status: "FETCHED", lastFetchedAt: new Date("2026-11-17T10:30:00Z") }, // lastmod older than the fetch
      { ...CURRENT_ROW, id: "page-child", urlDigest: childDigest, status: "PENDING", lastFetchedAt: null }, // never fetched
      { ...CURRENT_ROW, id: "page-child", urlDigest: childDigest, status: "GONE", lastFetchedAt: new Date("2026-11-17T08:00:00Z") }, // dead
    ]) {
      vi.clearAllMocks();
      db.crawlPage.findMany.mockReset();
      db.crawlPage.updateMany.mockClear();
      db.crawlPage.findMany
        .mockResolvedValueOnce([{ ...CURRENT_ROW }])
        .mockResolvedValueOnce([row]);
      await reportCrawlPages(SOURCE.id, "run-1", [
        { id: "page-1", status: "fetched", links: [{ url: childUrl, kind: "page", lastmod: "2026-11-17T10:00:00Z" }] },
      ], NOW);
      expect(db.crawlPage.updateMany).not.toHaveBeenCalled(); // no bump, no aliases to kill
    }
  });
});

describe("canonical aliases, Prisma path (WP10, review fix)", () => {
  it("retires only never-fetched, non-seed rows for the alias digests and inserts no placeholder", async () => {
    db.crawlPage.findMany.mockResolvedValue([
      { ...CURRENT_ROW, id: "page-1", urlDigest: "d-1" },
      { ...CURRENT_ROW, id: "page-2", urlDigest: "d-2", depth: 0 },
    ]);
    // /dupe names /twin (trailing-slash form: the same digest after the
    // WP10 normalisation) as its canonical; /twin is also linked in the same
    // report and is not stored as a new row.
    const twinDigest = crawlPageDigest(SOURCE.id, "https://k.example/twin");
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      {
        id: "page-1", status: "fetched",
        aliases: ["https://k.example/twin/"],
        links: [
          { url: "https://k.example/twin", kind: "page" },
          { url: "https://k.example/other", kind: "page" },
        ],
      },
      { id: "page-2", status: "fetched", links: [] },
    ], NOW);
    expect(accepted).toBe(2);
    expect(db.crawlPage.updateMany).toHaveBeenCalledWith({
      where: {
        sourceId: SOURCE.id, urlDigest: { in: [twinDigest] }, status: { notIn: ["DEAD", "GONE"] },
        lastFetchedAt: null, depth: { gt: 0 },
      },
      data: { status: "DEAD", nextDueAt: NOW, claimedUntil: null },
    });
    expect(db.crawlPage.createMany).toHaveBeenCalledTimes(1);
    const data = db.crawlPage.createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1); // the /other link only: no placeholder, no alias link
    expect(data[0]).toMatchObject({ urlDigest: crawlPageDigest(SOURCE.id, "https://k.example/other"), status: "PENDING", depth: 1, viaPagination: false });
    expect(db.crawlPage.createMany).toHaveBeenCalledWith({ data: expect.any(Array), skipDuplicates: true });
  });

  it("ignores the aliases of a page reached via pagination", async () => {
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW, id: "page-1", urlDigest: "d-1", depth: 1, viaPagination: true }]);
    await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", aliases: ["https://k.example/list"], links: [] },
    ], NOW);
    expect(db.crawlPage.updateMany).not.toHaveBeenCalled();
    expect(db.crawlPage.createMany).not.toHaveBeenCalled();
  });

  it("a self-alias kills and stores nothing", async () => {
    const selfDigest = crawlPageDigest(SOURCE.id, "https://k.example/");
    db.crawlPage.findMany.mockResolvedValue([{ ...CURRENT_ROW, id: "page-1", urlDigest: selfDigest }]);
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", aliases: ["https://k.example/index.php"], links: [] },
    ], NOW);
    expect(accepted).toBe(1);
    expect(db.crawlPage.updateMany).not.toHaveBeenCalled(); // no kill statement at all
    expect(db.crawlPage.createMany).not.toHaveBeenCalled();
  });
});

describe("legacy digests (review fix for WP10), Prisma path", () => {
  it("reads the legacy digests of a link's spellings and inserts no duplicate of a pre-WP10 row", async () => {
    const legacy = crawlPageLegacyDigests(SOURCE.id, "https://k.example/old");
    const oldDigest = legacy[0]!; // e.g. the http:// spelling a pre-WP10 row was stored under
    db.crawlPage.findMany
      .mockResolvedValueOnce([{ ...CURRENT_ROW }]) // the claimed page rows
      .mockResolvedValueOnce([{ ...CURRENT_ROW, id: "page-old", urlDigest: oldDigest, status: "FETCHED", lastFetchedAt: NOW }]);
    await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", links: [{ url: "https://k.example/old", kind: "page" }, { url: "https://k.example/new", kind: "page" }] },
    ], NOW);
    // One digest read covering the legacy spellings.
    const read = db.crawlPage.findMany.mock.calls[1]![0] as { where: { urlDigest: { in: string[] } } };
    for (const d of legacy) expect(read.where.urlDigest.in).toContain(d);
    const data = db.crawlPage.createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(data.map((r) => r.urlDigest)).toEqual([crawlPageDigest(SOURCE.id, "https://k.example/new")]);
  });
});
