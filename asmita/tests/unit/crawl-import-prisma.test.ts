import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP2 (full-crawler spec) on the Prisma (Node) path, against a mocked
// client: the bulk import is one createMany with skipDuplicates plus one
// read for the created rows' ids, never-crawl and existing hosts are
// filtered before it, and every created source is audited in one batched,
// hash-chained audit insert inside the LOCK-protected transaction.
// Placeholder hosts only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    crawlSource: { findMany: fn(), createMany: fn(), updateMany: fn() },
    crawlBlockedHost: { findMany: fn(), findFirst: fn(), create: fn(), deleteMany: fn() },
    auditLog: { findFirst: fn(), createMany: fn() },
    $transaction: fn(),
    $executeRawUnsafe: fn(),
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { addBlockedCrawlHost, listBlockedCrawlHosts, removeBlockedCrawlHost } from "@/lib/crawl-blocked-hosts";
import { importCrawlSources } from "@/lib/crawl-sources";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  db.$executeRawUnsafe.mockResolvedValue(undefined);
  db.crawlSource.findMany.mockResolvedValue([]);
  db.crawlSource.createMany.mockResolvedValue({ count: 0 });
  db.crawlBlockedHost.findMany.mockResolvedValue([]);
  db.crawlBlockedHost.findFirst.mockResolvedValue(null);
  db.crawlBlockedHost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "bh-new", createdAt: new Date("2026-11-16T05:30:00Z"), ...data,
  }));
  db.crawlBlockedHost.deleteMany.mockResolvedValue({ count: 1 });
  db.auditLog.findFirst.mockResolvedValue(null);
  db.auditLog.createMany.mockResolvedValue({ count: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("importCrawlSources, Prisma path", () => {
  it("filters existing and blocked hosts first, then inserts the rest in one createMany", async () => {
    db.crawlSource.findMany.mockResolvedValueOnce([{ domain: "dup.example.org" }]);
    db.crawlBlockedHost.findMany.mockResolvedValue([{ host: "blocked.example.org" }]);
    db.crawlSource.createMany.mockResolvedValue({ count: 1 });
    db.crawlSource.findMany.mockResolvedValueOnce([{ id: "src-a", domain: "a.example.org" }]);

    const { results } = await importCrawlSources({
      hosts: ["dup.example.org", "blocked.example.org", "deep.blocked.example.org", "a.example.org", "10.0.0.1"],
      pageBudget: 250,
      delayMs: 900,
    }, "super-1");

    expect(results.map((result) => result.status)).toEqual(["exists", "blocked", "blocked", "created", "invalid"]);

    // The existing-source read and the blocked-host read each cover the
    // whole list once, parents included.
    expect(db.crawlSource.findMany.mock.calls[0][0]).toMatchObject({ where: { domain: { in: ["dup.example.org", "blocked.example.org", "deep.blocked.example.org", "a.example.org"] } } });
    const blockedNames = db.crawlBlockedHost.findMany.mock.calls[0][0].where.host.in as string[];
    expect(blockedNames).toContain("deep.blocked.example.org");
    expect(blockedNames).toContain("blocked.example.org");
    expect(blockedNames).toContain("example.org");

    expect(db.crawlSource.createMany).toHaveBeenCalledTimes(1);
    expect(db.crawlSource.createMany.mock.calls[0][0]).toEqual({
      data: [{ id: expect.any(String), domain: "a.example.org", pageBudget: 250, delayMs: 900, enabled: false, approvedBy: "super-1" }],
      skipDuplicates: true,
    });
    // One read by the ids this call generated settles the created rows (review
    // fix: never by domain, which would pick up another request's row).
    expect(db.crawlSource.findMany).toHaveBeenCalledTimes(2);
    const generated = db.crawlSource.createMany.mock.calls[0][0].data[0].id;
    expect(db.crawlSource.findMany.mock.calls[1][0]).toEqual({ where: { id: { in: [generated] } }, select: { id: true, domain: true } });
  });

  it("never claims a row a concurrent import created for the same host (review fix)", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    // The database after the insert: the concurrent request's row won the
    // unique domain; this call's row was skipped.
    const table = [{ id: "src-theirs", domain: "a.example.org" }];
    db.crawlSource.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async ({ where }: { where: { id?: { in: string[] }; domain?: { in: string[] } } }) =>
      table.filter((row) => (where.id ? where.id.in.includes(row.id) : where.domain!.in.includes(row.domain))));
    const { results } = await importCrawlSources({ hosts: ["a.example.org"] }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["exists"]);
    expect(db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("reports every attempted host as exists when a concurrent request created them first, and audits nothing", async () => {
    db.crawlSource.createMany.mockResolvedValue({ count: 0 });
    db.crawlSource.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    const { results } = await importCrawlSources({ hosts: ["a.example.org"] }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["exists"]);
    expect(db.auditLog.createMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("uses the env defaults for an omitted page budget and delay", async () => {
    db.crawlSource.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "src-a", domain: "a.example.org" }]);
    await importCrawlSources({ hosts: ["a.example.org"] }, "super-1");
    expect(db.crawlSource.createMany.mock.calls[0][0].data[0]).toMatchObject({ pageBudget: 2000, delayMs: 1500 });
  });

  it("audits 1000 created sources in one batched, hash-chained insert inside the locked transaction", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    const hosts = Array.from({ length: 1000 }, (_, index) => `site-${index}.example.org`);
    db.crawlSource.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(hosts.map((domain, index) => ({ id: `src-${index}`, domain })));
    db.crawlSource.createMany.mockResolvedValue({ count: 1000 });
    db.auditLog.findFirst.mockResolvedValue({ sequence: 7, eventHash: "previous-hash" });

    await importCrawlSources({ hosts, pageBudget: 100, delayMs: 600 }, "super-1");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith('LOCK TABLE "audit_log" IN EXCLUSIVE MODE');
    expect(db.auditLog.findFirst).toHaveBeenCalledWith({ orderBy: { sequence: "desc" }, select: { sequence: true, eventHash: true } });
    expect(db.auditLog.createMany).toHaveBeenCalledTimes(1);
    const rows = db.auditLog.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1000);
    expect(rows[0]).toMatchObject({ sequence: 8, previousHash: "previous-hash", eventType: "ADMIN_ACTION", entityId: "src-0", actorId: "super-1" });
    expect(rows[0].data).toMatchObject({ action: "crawl_source_imported", domain: "site-0.example.org", pageBudget: 100, delayMs: 600 });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    for (let index = 0; index < rows.length; index += 1) {
      expect(rows[index].sequence).toBe(8 + index);
      if (index > 0) expect(rows[index].previousHash).toBe(rows[index - 1].eventHash);
    }
  });
});

describe("blocked host management, Prisma path", () => {
  it("creates a blocked host and audits it; a duplicate answers blocked_host_exists", async () => {
    const outcome = await addBlockedCrawlHost({ host: "WWW.Bad.example.org.", reason: "owner request" }, "super-1");
    expect(outcome).toMatchObject({ ok: true, host: { host: "bad.example.org", reason: "owner request", addedBy: "super-1" } });
    expect(db.crawlBlockedHost.create.mock.calls[0][0].data).toEqual({ host: "bad.example.org", reason: "owner request", addedBy: "super-1" });

    db.crawlBlockedHost.create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "P2002" }));
    expect(await addBlockedCrawlHost({ host: "bad.example.org", reason: "again" }, "super-1")).toEqual({ ok: false, error: "blocked_host_exists" });
  });

  it("switches off the host's and its subdomains' sources with a reason when blocking (review fix)", async () => {
    db.crawlSource.findMany.mockResolvedValueOnce([{ id: "src-a" }, { id: "src-b" }]);
    db.crawlSource.updateMany.mockResolvedValue({ count: 2 });
    const outcome = await addBlockedCrawlHost({ host: "bad.example.org", reason: "owner request" }, "super-1");
    expect(outcome.ok).toBe(true);
    expect(db.crawlSource.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ domain: "bad.example.org" }, { domain: { endsWith: ".bad.example.org" } }] },
          { OR: [{ enabled: true }, { pauseReason: { not: null } }] },
        ],
      },
      select: { id: true },
    });
    expect(db.crawlSource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["src-a", "src-b"] } },
      data: { enabled: false, pausedUntil: null, pauseReason: null, disabledReason: "blocked_host" },
    });
  });

  it("removes by id after reading the host, and answers blocked_host_not_found otherwise", async () => {
    db.crawlBlockedHost.findFirst.mockResolvedValue({ host: "gone.example.org" });
    expect(await removeBlockedCrawlHost("bh-1", "super-1")).toEqual({ ok: true, host: "gone.example.org" });
    expect(db.crawlBlockedHost.findFirst).toHaveBeenCalledWith({ where: { id: "bh-1" }, select: { host: true } });
    expect(db.crawlBlockedHost.deleteMany).toHaveBeenCalledWith({ where: { id: "bh-1" } });

    db.crawlBlockedHost.findFirst.mockResolvedValue(null);
    expect(await removeBlockedCrawlHost("missing", "super-1")).toEqual({ ok: false, error: "blocked_host_not_found" });
    expect(db.crawlBlockedHost.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("lists blocked hosts through Prisma, ordered by host", async () => {
    db.crawlBlockedHost.findMany.mockResolvedValue([
      { id: "bh-2", host: "z.example.org", reason: "b", addedBy: "super-1", createdAt: new Date("2026-11-16T05:30:00Z") },
      { id: "bh-1", host: "a.example.org", reason: "a", addedBy: "super-2", createdAt: new Date("2026-11-15T05:30:00Z") },
    ]);
    expect(db.crawlBlockedHost.findMany).not.toHaveBeenCalled();
    const hosts = await listBlockedCrawlHosts();
    expect(db.crawlBlockedHost.findMany).toHaveBeenCalledWith({ orderBy: { host: "asc" } });
    expect(hosts.map((host) => host.host)).toEqual(["a.example.org", "z.example.org"]);
  });
});
