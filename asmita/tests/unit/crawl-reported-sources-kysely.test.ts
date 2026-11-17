import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP1 on the Kysely (Worker) path, against a recording fake in the style of
// the other crawler tests: a REPORTED source is inserted with ON CONFLICT DO
// NOTHING on the domain, blocked hosts are looked up with their parents, the
// sources route selects the new columns, and account erasure never names
// CrawlSource. Placeholder hosts only.

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
          if (prop === "execute") return async () => (state.rows[table] ?? []).map((row) => ({ ...row }));
          if (prop === "executeTakeFirst") return async () => (state.rows[table] ?? [])[0];
          if (prop === "executeTakeFirstOrThrow") return async () => (state.rows[table] ?? [])[0];
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
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

import { ensureCrawlSourceForReportedHost, listEnabledCrawlSources } from "@/lib/crawl-sources";
import { registerCaseWithUrls, hardDeleteDueUsers } from "@/lib/case-ops";
import { inMemoryAuditLog } from "@/lib/audit";

const PAGE = "https://forum.example.com/thread/1";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.rows = {};
  kysely.state.calls.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function callsOn(table: string) {
  return kysely.state.calls.filter((call) => call.table === table);
}

describe("ensureCrawlSourceForReportedHost, Kysely path", () => {
  it("inserts one enabled REPORTED source with ON CONFLICT DO NOTHING on the domain", async () => {
    kysely.state.rows.CrawlSource = [{ id: "src-1" }];
    const outcome = await ensureCrawlSourceForReportedHost("forum.example.com");
    expect(outcome).toEqual({ created: true, id: "src-1" });

    const inserts = callsOn("CrawlSource");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].detail.onConflict).toBe(true);
    expect(inserts[0].detail.values).toMatchObject({
      kind: "SITE", domain: "forum.example.com", enabled: true, approvedBy: null,
      origin: "REPORTED", hops: 0, discoveredFromId: null, render: "HTTP",
      pageBudget: 2000, delayMs: 1500, lastCrawledAt: null, pagesCrawled: 0,
    });
    // The blocked-host lookup asked for the host and its parents.
    const blocked = callsOn("CrawlBlockedHost");
    expect(blocked).toHaveLength(1);
    expect((blocked[0].detail.wheres as unknown[][])[0]).toEqual(["host", "in", ["forum.example.com", "example.com", "com"]]);
  });

  it("answers exists when the conflict does nothing, and writes no audit entry", async () => {
    kysely.state.rows.CrawlSource = [];
    const before = inMemoryAuditLog.length;
    expect(await ensureCrawlSourceForReportedHost("forum.example.com")).toEqual({ created: false, reason: "exists" });
    expect(callsOn("CrawlSource")).toHaveLength(1);
    expect(inMemoryAuditLog).toHaveLength(before);
  });

  it("a host blocked by a CrawlBlockedHost row is never inserted, nor its subdomains", async () => {
    kysely.state.rows.CrawlBlockedHost = [{ host: "blocked.example.org" }];
    expect(await ensureCrawlSourceForReportedHost("deep.forum.blocked.example.org")).toEqual({ created: false, reason: "never_crawl" });
    const asked = (callsOn("CrawlBlockedHost")[0].detail.wheres as unknown[][])[0][2] as string[];
    expect(asked).toContain("deep.forum.blocked.example.org");
    expect(asked).toContain("blocked.example.org");
    expect(callsOn("CrawlSource")).toHaveLength(0);
  });

  it("a never-crawl host is refused before any table is touched", async () => {
    expect(await ensureCrawlSourceForReportedHost("www.instagram.com")).toEqual({ created: false, reason: "never_crawl" });
    expect(kysely.state.calls).toHaveLength(0);
  });
});

describe("listEnabledCrawlSources, Kysely path", () => {
  it("selects the new columns and lowercases origin and render for the crawler", async () => {
    kysely.state.rows.CrawlSource = [
      { id: "s1", domain: "forum.example.com", pageBudget: 10, delayMs: 2000, origin: "REPORTED", hops: 2, render: "BROWSER", enabled: true },
      { id: "s2", domain: "admin.example.com", pageBudget: 5, delayMs: 1000, origin: "ADMIN", hops: 0, render: "HTTP", enabled: true },
    ];
    const sources = await listEnabledCrawlSources();
    expect(sources).toEqual([
      { id: "s2", kind: "site", domain: "admin.example.com", pageBudget: 5, delayMs: 1000, origin: "admin", hops: 0, render: "http" },
      { id: "s1", kind: "site", domain: "forum.example.com", pageBudget: 10, delayMs: 2000, origin: "reported", hops: 2, render: "browser" },
    ]);
    const select = callsOn("CrawlSource")[0];
    expect(select.detail.select).toEqual(["id", "domain", "pageBudget", "delayMs", "origin", "hops", "render"]);
  });
});

describe("registerCaseWithUrls, Kysely path", () => {
  it("stores the case and its links, then inserts one REPORTED source per host", async () => {
    kysely.state.rows.Case = [{ id: "case-1", referenceNumber: "ASMITA-2026-00001" }];
    kysely.state.rows.CrawlSource = [{ id: "src-1" }];
    const outcome = await registerCaseWithUrls("user-1", [PAGE, "https://other.example.org/a"]);
    expect(outcome).toMatchObject({ ok: true, accepted: 2 });
    expect(callsOn("SubmittedUrl")).toHaveLength(2);
    const inserted = callsOn("CrawlSource").map((call) => (call.detail.values as { domain: string }).domain);
    expect(inserted).toEqual(["forum.example.com", "other.example.org"]);
  });
});

describe("account erasure, Kysely path", () => {
  it("hard-deletes the survivor without ever naming CrawlSource", async () => {
    kysely.state.rows.DeletionJob = [{ jobId: "job-1", userId: "user-1" }];
    kysely.state.rows.User = [{ id: "user-1", emailHash: "hash-1" }];
    kysely.state.rows.Case = [{ id: "c1", referenceNumber: "ASMITA-2026-00042" }];
    const deleted = await hardDeleteDueUsers(new Date());
    expect(deleted).toEqual(["user-1"]);
    expect(callsOn("CrawlSource")).toHaveLength(0);
    expect(kysely.state.calls.filter((call) => call.op === "delete").map((call) => call.table).sort())
      .toEqual(["CrawlConsent", "CrawlFinding", "Feedback", "OtpToken", "SessionToken"]);
  });
});
