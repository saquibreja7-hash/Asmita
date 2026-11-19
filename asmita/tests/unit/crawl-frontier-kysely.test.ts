import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP3 (full-crawler spec) on the Kysely (Worker) path, against a recording
// fake in the style of the other crawler tests. What the Worker limits make
// the real test: a claim locks its rows FOR UPDATE SKIP LOCKED so two
// crawler instances never get the same URL, a report of a whole batch is a
// bounded number of statements (one read, one update per page, chunked link
// inserts, one source update), and every link insert is one statement with
// ON CONFLICT DO NOTHING on the per-source digest. Placeholder hosts only.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
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
                rows = (all as Array<Record<string, unknown>>).map((row) => ({ ...row }));
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
            else if (prop === "limit") detail.limit = args[0];
            else if (prop === "orderBy") {
              // Every orderBy call, in order (WP11 claims sort by two keys);
              // the last one also lands in `orderBy` as before.
              detail.orderBys = [...((detail.orderBys as unknown[]) ?? []), args[0]];
              detail.orderBy = args[0];
            }
            else if (prop === "forUpdate") detail.forUpdate = true;
            else if (prop === "skipLocked") detail.skipLocked = true;
            else if (prop === "onConflict") detail.onConflict = true; // the callback never runs in the fake
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

import { encryptField } from "@/lib/encryption";
import { claimCrawlPages, crawlPageDigest, reportCrawlPages } from "@/lib/crawl-pages";

const NOW = new Date("2026-11-17T09:00:00Z");
const SOURCE = { id: "src-1", kind: "SITE", domain: "k.example", pageBudget: 50, delayMs: 0, enabled: true };

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-1", sourceId: SOURCE.id, urlEncrypted: encryptField("https://k.example/"), urlDigest: "digest-1",
    depth: 0, kind: "PAGE", etag: null, lastModified: null, status: "PENDING",
    claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.rows = { CrawlSource: [{ ...SOURCE }] };
  kysely.state.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);

describe("claimCrawlPages, Kysely path", () => {
  it("seeds a source's first page and claims due rows FOR UPDATE SKIP LOCKED", async () => {
    kysely.state.rows.CrawlPage = [];
    const urls = await claimCrawlPages(SOURCE.id, 10, NOW);
    expect(urls).toEqual([]); // the fake does not persist the seed insert
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.detail.onConflict).toBe(true);
    const values = inserts[0]!.detail.values;
    const row = (Array.isArray(values) ? values[0] : values) as Record<string, unknown>;
    expect(row).toMatchObject({ sourceId: SOURCE.id, depth: 0, kind: "PAGE", status: "PENDING" });
    expect(String(row.urlEncrypted)).not.toContain("k.example"); // encrypted at rest
  });

  it("locks and marks the due rows it hands out", async () => {
    kysely.state.rows.CrawlPage = [pageRow()];
    const urls = await claimCrawlPages(SOURCE.id, 10, NOW);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatchObject({ url: "https://k.example/", depth: 0, etag: null, lastModified: null });
    const select = callsOn("CrawlPage").find((call) => call.op === "select" && call.detail.forUpdate === true);
    expect(select).toBeDefined();
    expect(select!.detail.skipLocked).toBe(true);
    expect(select!.detail.limit).toBe(10); // min(claim limit, remaining budget)
    expect(select!.detail.orderBy).toBe("nextDueAt");
    const update = callsOn("CrawlPage").find((call) => call.op === "update");
    expect(update).toBeDefined();
    const set = update!.detail.set as Record<string, unknown>;
    expect(set.claimedUntil).toEqual(new Date(NOW.getTime() + 30 * 60 * 1000));
  });
});

describe("claim budget under concurrency, Kysely path (review fix)", () => {
  it("locks the source row FOR UPDATE before counting, and subtracts rows still claimed", async () => {
    // The fake answers both count selects with the first CrawlPage row:
    // 20 fetched today and 20 out with another crawler, budget 50.
    kysely.state.rows.CrawlPage = [pageRow({ count: 20 })];
    await claimCrawlPages(SOURCE.id, 15, NOW);
    const ordered = kysely.state.calls.map((call) => `${call.op} ${call.table}${call.detail.forUpdate ? " for update" : ""}`);
    const lockAt = ordered.indexOf("select CrawlSource for update");
    expect(lockAt).toBeGreaterThan(-1);
    const counts = kysely.state.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.table === "CrawlPage" && call.op === "select" && !call.detail.forUpdate && call.detail.limit === undefined);
    // hasPages has a limit; the two budget counts come after the lock.
    expect(counts).toHaveLength(2);
    for (const { index } of counts) expect(index).toBeGreaterThan(lockAt);
    expect(counts[1]!.call.detail.wheres).toEqual(expect.arrayContaining([["claimedUntil", ">", NOW]]));
    const claim = kysely.state.calls.find((call) => call.table === "CrawlPage" && call.detail.forUpdate === true)!;
    expect(claim.detail.limit).toBe(10); // 50 - 20 - 20
  });
});

describe("per-source frontier cap, Kysely path (review fix)", () => {
  it("locks the source row and trims the link insert to the room the cap leaves", async () => {
    vi.stubEnv("CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE", "1000");
    // The fake answers the count select with the first CrawlPage row.
    kysely.state.rows.CrawlPage = [pageRow({ count: 997 })];
    const links = ["a", "b", "c", "d", "e"].map((path) => ({ url: `https://k.example/${path}`, kind: "page" as const }));
    await reportCrawlPages(SOURCE.id, "run-1", [{ id: "page-1", status: "fetched", links }], NOW);
    expect(callsOn("CrawlSource").some((call) => call.op === "select" && call.detail.forUpdate === true)).toBe(true);
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.detail.values as unknown[]).length).toBe(3);
  });
});

describe("reportCrawlPages, Kysely path", () => {
  it("schedules the page, inserts new links once with ON CONFLICT and moves the source counters", async () => {
    kysely.state.rows.CrawlPage = [pageRow()];
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", etag: "v1", links: [{ url: "https://k.example/child", kind: "page" }] },
    ], NOW);
    expect(accepted).toBe(1);

    const updates = callsOn("CrawlPage").filter((call) => call.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.detail.set).toMatchObject({ status: "FETCHED", failCount: 0, claimedUntil: null, etag: "v1" });
    expect((updates[0]!.detail.set as Record<string, unknown>).nextDueAt).toEqual(new Date(NOW.getTime() + 24 * 60 * 60 * 1000));

    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.detail.onConflict).toBe(true);
    const link = (inserts[0]!.detail.values as Array<Record<string, unknown>>)[0]!;
    expect(link).toMatchObject({ sourceId: SOURCE.id, depth: 1, kind: "PAGE", status: "PENDING" });
    expect(String(link.urlEncrypted)).not.toContain("k.example");

    const sourceUpdate = callsOn("CrawlSource").find((call) => call.op === "update");
    expect(sourceUpdate).toBeDefined();
    const sourceSet = sourceUpdate!.detail.set as Record<string, unknown>;
    expect(sourceSet.lastCrawledAt).toEqual(NOW);
    expect(typeof sourceSet.pagesCrawled).toBe("function"); // pagesCrawled + visited, in SQL

    // The per-day fetch counter (review fix), one upsert for the UTC day.
    const dayInserts = callsOn("CrawlSourceDay").filter((call) => call.op === "insert");
    expect(dayInserts).toHaveLength(1);
    expect(dayInserts[0]!.detail.values).toEqual({ sourceId: SOURCE.id, day: new Date("2026-11-17T00:00:00Z"), pagesFetched: 1 });
    expect(dayInserts[0]!.detail.onConflict).toBe(true);
  });

  it("a 200-page report is a bounded number of statements", async () => {
    kysely.state.rows.CrawlPage = Array.from({ length: 200 }, (_, i) => pageRow({ id: `page-${i}`, urlDigest: `d-${i}` }));
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", Array.from({ length: 200 }, (_, i) => ({
      id: `page-${i}`, status: "fetched", links: [],
    })), NOW);
    expect(accepted).toBe(200);
    // Source read, page read, one update per page, one source update: 203
    // statements, all inside one transaction. No per-link statements (no
    // links reported).
    const statements = kysely.state.calls.filter((call) => call.table === "CrawlPage" || call.table === "CrawlSource");
    expect(statements.length).toBe(203);
    expect(callsOn("CrawlSource").filter((call) => call.op === "update")).toHaveLength(1);
  });

  it("chunks 700 new links (across two pages) into inserts of at most 500 rows", async () => {
    kysely.state.rows.CrawlPage = [
      pageRow({ id: "page-1", urlDigest: "d-1" }),
      pageRow({ id: "page-2", urlDigest: "d-2", urlEncrypted: encryptField("https://k.example/two") }),
    ];
    // The per-page link cap (500) is enforced at validation, so a hostile
    // page's 700 links are refused whole; 350 + 350 across two pages are not.
    const over = Array.from({ length: 700 }, (_, i) => ({ url: `https://k.example/p${i}`, kind: "page" as const }));
    const refused = await reportCrawlPages(SOURCE.id, "run-1", [{ id: "page-1", status: "fetched", links: over }], NOW);
    expect(refused.accepted).toBe(0);
    expect(callsOn("CrawlPage").filter((call) => call.op === "insert")).toHaveLength(0);

    const links = Array.from({ length: 350 }, (_, i) => ({ url: `https://k.example/p${i}`, kind: "page" as const }));
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", links },
      { id: "page-2", status: "fetched", links: links.map((l) => ({ ...l, url: l.url.replace("/p", "/q") })) },
    ], NOW);
    expect(accepted).toBe(2);
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(2);
    expect((inserts[0]!.detail.values as unknown[]).length).toBe(500);
    expect((inserts[1]!.detail.values as unknown[]).length).toBe(200);
    for (const insert of inserts) expect(insert.detail.onConflict).toBe(true);
  });
});

describe("crawl order (WP11), Kysely path", () => {
  it("orders the locked claim by priority, then nextDueAt", async () => {
    kysely.state.rows.CrawlPage = [pageRow()];
    await claimCrawlPages(SOURCE.id, 10, NOW);
    const select = callsOn("CrawlPage").find((call) => call.op === "select" && call.detail.forUpdate === true);
    expect(select).toBeDefined();
    expect(select!.detail.orderBys).toEqual(["priority", "nextDueAt"]);
  });

  it("stores each link with the priority its kind implies", async () => {
    kysely.state.rows.CrawlPage = [pageRow()];
    await reportCrawlPages(SOURCE.id, "run-1", [
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
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    const rows = inserts[0]!.detail.values as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.kind === "SITEMAP")).toMatchObject({ priority: 10, depth: 1, status: "PENDING" });
    expect(rows.find((r) => r.kind === "FEED")).toMatchObject({ priority: 20, depth: 1 });
    expect(rows.find((r) => r.kind === "PAGE" && r.priority === 30)).toMatchObject({ depth: 1 }); // the pagination link
    expect(rows.find((r) => r.kind === "PAGE" && r.priority === 60)).toMatchObject({ depth: 1 }); // the plain page
  });

  it("bumps a row whose reported lastmod is newer than its last fetch", async () => {
    const childUrl = "https://k.example/child";
    const childDigest = crawlPageDigest(SOURCE.id, childUrl);
    kysely.state.rows.CrawlPage = [
      pageRow({ id: "page-1", urlDigest: "d-1" }),
      pageRow({ id: "page-child", urlDigest: childDigest, status: "FETCHED", lastFetchedAt: new Date("2026-11-17T08:00:00Z"), urlEncrypted: encryptField(childUrl) }),
    ];
    const { accepted } = await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", links: [{ url: childUrl, kind: "page", lastmod: "2026-11-17T10:00:00Z" }] },
    ], NOW);
    expect(accepted).toBe(1);
    // The digest read (WP11): by urlDigest, for the reported lastmods.
    const read = callsOn("CrawlPage").find((call) => call.op === "select" && call.detail.forUpdate === undefined && (call.detail.select as unknown[])?.includes("urlDigest") && (call.detail.wheres as unknown[])?.some((w) => Array.isArray(w) && String(w[0]) === "urlDigest"));
    expect(read).toBeDefined();
    // The bump: priority 5, due now, live rows only.
    const bump = callsOn("CrawlPage").find((call) => call.op === "update" && (call.detail.set as Record<string, unknown>).priority === 5);
    expect(bump).toBeDefined();
    expect(bump!.detail.wheres).toEqual(expect.arrayContaining([
      ["id", "in", ["page-child"]],
      ["sourceId", "=", SOURCE.id],
      ["status", "not in", ["DEAD", "GONE"]],
    ]));
    expect((bump!.detail.set as Record<string, unknown>).nextDueAt).toEqual(NOW);
  });

  it("no bump when the lastmod is older, the row was never fetched, or it is dead", async () => {
    const childUrl = "https://k.example/child";
    const childDigest = crawlPageDigest(SOURCE.id, childUrl);
    for (const overrides of [
      { status: "FETCHED", lastFetchedAt: new Date("2026-11-17T10:30:00Z") }, // lastmod older than the fetch
      { status: "PENDING", lastFetchedAt: null }, // never fetched
      { status: "GONE", lastFetchedAt: new Date("2026-11-17T08:00:00Z") }, // dead
    ] as const) {
      kysely.state.calls.length = 0;
      kysely.state.rows.CrawlPage = [pageRow({ id: "page-1", urlDigest: "d-1" }), pageRow({ id: "page-child", urlDigest: childDigest, ...overrides })];
      await reportCrawlPages(SOURCE.id, "run-1", [
        { id: "page-1", status: "fetched", links: [{ url: childUrl, kind: "page", lastmod: "2026-11-17T10:00:00Z" }] },
      ], NOW);
      expect(callsOn("CrawlPage").filter((call) => call.op === "update" && (call.detail.set as Record<string, unknown>).priority !== undefined)).toHaveLength(0);
    }
  });
});

describe("canonical aliases, Kysely path (WP10, review fix)", () => {
  it("retires only never-fetched, non-seed rows for the alias digests and inserts no placeholder", async () => {
    kysely.state.rows.CrawlPage = [
      pageRow({ id: "page-1", urlDigest: "d-1" }),
      pageRow({ id: "page-2", urlDigest: "d-2", urlEncrypted: encryptField("https://k.example/other-page") }),
    ];
    // /dupe names /twin (in its trailing-slash form, so the same digest) as
    // its canonical; /twin is also linked in the same report and is not
    // stored as a new row.
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
    // The retirement: one update, DEAD, by digest, and only for rows that
    // were never fetched and are not a depth-0 seed.
    const kill = callsOn("CrawlPage").find((call) => call.op === "update" && (call.detail.set as Record<string, unknown>).status === "DEAD");
    expect(kill).toBeDefined();
    expect(kill!.detail.wheres).toEqual(expect.arrayContaining([
      ["urlDigest", "in", [twinDigest]],
      ["status", "not in", ["DEAD", "GONE"]],
      ["lastFetchedAt", "is", null],
      ["depth", ">", 0],
    ]));
    expect((kill!.detail.set as Record<string, unknown>).claimedUntil).toBeNull();
    // The insert carries only the live /other link: no placeholder row for
    // the alias, and the alias's own link never made it in.
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    const rows = inserts[0]!.detail.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ urlDigest: crawlPageDigest(SOURCE.id, "https://k.example/other"), status: "PENDING", depth: 1, viaPagination: false });
  });

  it("ignores the aliases of a page reached via pagination, and stores pagination links as such", async () => {
    kysely.state.rows.CrawlPage = [pageRow({ id: "page-1", urlDigest: "d-1", depth: 1, viaPagination: true })];
    await reportCrawlPages(SOURCE.id, "run-1", [
      {
        id: "page-1", status: "fetched", aliases: ["https://k.example/list"],
        links: [{ url: "https://k.example/list?page=3", kind: "page", pagination: true }],
      },
    ], NOW);
    expect(callsOn("CrawlPage").filter((call) => call.op === "update" && (call.detail.set as Record<string, unknown>).status === "DEAD")).toHaveLength(0);
    const inserts = callsOn("CrawlPage").filter((call) => call.op === "insert");
    expect((inserts[0]!.detail.values as Array<Record<string, unknown>>)[0]).toMatchObject({ viaPagination: true, priority: 30 });
  });

  it("reads the claimed rows' digests (the self-alias check needs them)", async () => {
    const selfDigest = crawlPageDigest(SOURCE.id, "https://k.example/");
    kysely.state.rows.CrawlPage = [pageRow({ id: "page-1", urlDigest: selfDigest })];
    await reportCrawlPages(SOURCE.id, "run-1", [
      { id: "page-1", status: "fetched", aliases: ["https://k.example/"], links: [] }, // self-alias: no-op
    ], NOW);
    const read = callsOn("CrawlPage").find((call) => call.op === "select" && call.detail.forUpdate === undefined && (call.detail.select as unknown[])?.includes("urlDigest"));
    expect(read).toBeDefined();
    expect(callsOn("CrawlPage").filter((call) => call.op === "update" && (call.detail.set as Record<string, unknown>).status === "DEAD")).toHaveLength(0);
    expect(callsOn("CrawlPage").filter((call) => call.op === "insert")).toHaveLength(0);
  });
});
