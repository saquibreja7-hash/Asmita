import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP2 (full-crawler spec) on the Kysely (Worker) path, against a recording
// fake in the style of the other crawler tests. What the Worker limits make
// the real test: 1000 hosts must import in one request through a FIXED
// handful of queries (a Worker request may make ~1000 subrequests, so
// one query per host would not fit), the bulk insert is one statement with
// ON CONFLICT DO NOTHING, and every created source is audited in one
// batched, hash-chained audit_log insert. Placeholder hosts only.

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
                // Kysely takes one row object or an array; RETURNING gives the
                // inserted rows back.
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

  // RawBuilder.execute(executorProvider) asks for getExecutor() (audit.ts's
  // LOCK TABLE fragment): recorded separately from the query builders.
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

import { addBlockedCrawlHost, listBlockedCrawlHosts, removeBlockedCrawlHost } from "@/lib/crawl-blocked-hosts";
import { importCrawlSources } from "@/lib/crawl-sources";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.rows = {};
  kysely.state.calls.length = 0;
  kysely.state.insertResult = null;
  kysely.executeQuery.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function callsOn(table: string) {
  return kysely.state.calls.filter((call) => call.table === table);
}

describe("importCrawlSources, Kysely path", () => {
  it("inserts 1000 ADMIN sources in one statement and audits them in one batched, hash-chained write", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    kysely.state.rows.audit_log = [{ sequence: 7, eventHash: "previous-hash" }];
    const hosts = Array.from({ length: 1000 }, (_, index) => `site-${index}.example.org`);

    const { results } = await importCrawlSources({ hosts, pageBudget: 400, delayMs: 800, enabled: true }, "super-1");

    expect(results).toHaveLength(1000);
    expect(results.every((result) => result.status === "created")).toBe(true);

    // A fixed handful of queries, whatever the list size: a Worker request
    // allows about 1000 subrequests, so one query per host cannot fit.
    expect(kysely.state.calls.map((call) => `${call.op} ${call.table}`)).toEqual([
      "select CrawlSource", "select CrawlBlockedHost", "insert CrawlSource", "select audit_log", "insert audit_log",
    ]);

    const selectExisting = callsOn("CrawlSource")[0];
    expect((selectExisting.detail.wheres as unknown[][])[0]).toEqual(["domain", "in", hosts]);

    const insert = callsOn("CrawlSource").find((call) => call.op === "insert")!;
    expect(insert.detail.onConflict).toBe(true);
    expect(insert.detail.returning).toEqual(["id", "domain"]);
    const rows = insert.detail.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1000);
    expect(rows[0]).toMatchObject({
      kind: "SITE", domain: "site-0.example.org", pageBudget: 400, delayMs: 800, enabled: true, approvedBy: "super-1",
      origin: "ADMIN", hops: 0, discoveredFromId: null, render: "HTTP", lastCrawledAt: null, pagesCrawled: 0,
    });

    // One batched audit write: the LOCK TABLE fragment ran once, and all
    // 1000 entries are one insert, chained onto the previous row.
    expect(kysely.executeQuery).toHaveBeenCalledTimes(1);
    const auditRows = callsOn("audit_log").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(auditRows).toHaveLength(1000);
    expect(auditRows[0]).toMatchObject({ sequence: 8, previousHash: "previous-hash", eventType: "ADMIN_ACTION", actorId: "super-1" });
    expect(auditRows[0].data).toMatchObject({ action: "crawl_source_imported", domain: "site-0.example.org", pageBudget: 400, delayMs: 800, enabled: true });
    for (let index = 0; index < auditRows.length; index += 1) {
      expect(auditRows[index].sequence).toBe(8 + index);
      if (index > 0) expect(auditRows[index].previousHash).toBe(auditRows[index - 1].eventHash);
    }
  });

  it("is three queries for 1000 hosts when the audit log is the in-memory one", async () => {
    const hosts = Array.from({ length: 1000 }, (_, index) => `site-${index}.example.org`);
    await importCrawlSources({ hosts }, "super-1");
    expect(kysely.state.calls.map((call) => `${call.op} ${call.table}`)).toEqual([
      "select CrawlSource", "select CrawlBlockedHost", "insert CrawlSource",
    ]);
  });

  it("reports a host a concurrent request created as exists, without an error", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    kysely.state.insertResult = (rows) => rows.slice(0, 1);
    const { results } = await importCrawlSources({ hosts: ["a.example.org", "b.example.org"] }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["created", "exists"]);
    // Only the row that was really inserted is audited.
    const auditInsert = callsOn("audit_log").find((call) => call.op === "insert");
    expect(auditInsert?.detail.values).toHaveLength(1);
  });

  it("blocks a host with a CrawlBlockedHost row, for the host and its subdomains, found in one query over the parents", async () => {
    kysely.state.rows.CrawlBlockedHost = [{ host: "blocked.example.org" }];
    const { results } = await importCrawlSources({
      hosts: ["blocked.example.org", "deep.forum.blocked.example.org", "fine.example.org"],
    }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["blocked", "blocked", "created"]);
    const asked = (callsOn("CrawlBlockedHost")[0].detail.wheres as unknown[][])[0][2] as string[];
    expect(asked).toContain("blocked.example.org");
    expect(asked).toContain("deep.forum.blocked.example.org");
    expect(asked).toContain("example.org");
    expect(asked).toContain("org");
    expect(asked).toContain("fine.example.org");
  });

  it("reports an existing source as exists and inserts nothing for it", async () => {
    kysely.state.rows.CrawlSource = [{ domain: "dup.example.org" }];
    const { results } = await importCrawlSources({ hosts: ["dup.example.org", "new.example.org"] }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["exists", "created"]);
    const inserted = callsOn("CrawlSource").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>;
    expect(inserted.map((row) => row.domain)).toEqual(["new.example.org"]);
  });

  it("never touches the database for a host on the built-in never-crawl list", async () => {
    const { results } = await importCrawlSources({ hosts: ["www.instagram.com"] }, "super-1");
    expect(results).toEqual([{ input: "www.instagram.com", status: "blocked", host: "instagram.com" }]);
    expect(kysely.state.calls).toHaveLength(0);
  });
});

describe("blocked host management, Kysely path", () => {
  it("inserts a blocked host with ON CONFLICT DO NOTHING and RETURNING, and audits it", async () => {
    const outcome = await addBlockedCrawlHost({ host: "WWW.Bad.example.org.", reason: "owner request" }, "super-1");
    expect(outcome).toMatchObject({ ok: true, host: { host: "bad.example.org", reason: "owner request", addedBy: "super-1" } });

    const insert = callsOn("CrawlBlockedHost").find((call) => call.op === "insert")!;
    expect(insert.detail.onConflict).toBe(true);
    expect(insert.detail.values).toMatchObject({ host: "bad.example.org", reason: "owner request", addedBy: "super-1" });
  });

  it("answers blocked_host_exists when the conflict does nothing", async () => {
    kysely.state.insertResult = () => [];
    const outcome = await addBlockedCrawlHost({ host: "bad.example.org", reason: "again" }, "super-1");
    expect(outcome).toEqual({ ok: false, error: "blocked_host_exists" });
  });

  it("removes by id with DELETE RETURNING and audits the removed host", async () => {
    kysely.state.rows.CrawlBlockedHost = [{ host: "gone.example.org" }];
    const outcome = await removeBlockedCrawlHost("bh-1", "super-1");
    expect(outcome).toEqual({ ok: true, host: "gone.example.org" });
    const removed = callsOn("CrawlBlockedHost").find((call) => call.op === "delete")!;
    expect((removed.detail.wheres as unknown[][])[0]).toEqual(["id", "=", "bh-1"]);
    expect(removed.detail.returning).toBe("host");
  });

  it("answers blocked_host_not_found when nothing matched", async () => {
    expect(await removeBlockedCrawlHost("missing", "super-1")).toEqual({ ok: false, error: "blocked_host_not_found" });
  });

  it("lists blocked hosts with the view columns, sorted by host", async () => {
    kysely.state.rows.CrawlBlockedHost = [
      { id: "bh-2", host: "z.example.org", reason: "b", addedBy: "super-1", createdAt: new Date("2026-11-16T05:30:00Z") },
      { id: "bh-1", host: "a.example.org", reason: "a", addedBy: "super-2", createdAt: new Date("2026-11-15T05:30:00Z") },
    ];
    const hosts = await listBlockedCrawlHosts();
    expect(hosts.map((host) => host.host)).toEqual(["a.example.org", "z.example.org"]);
    expect(hosts[0]).toEqual({ id: "bh-1", host: "a.example.org", reason: "a", addedBy: "super-2", createdAt: "2026-11-15T05:30:00.000Z" });
    expect(callsOn("CrawlBlockedHost")[0].detail.select).toEqual(["id", "host", "reason", "addedBy", "createdAt"]);
  });
});
