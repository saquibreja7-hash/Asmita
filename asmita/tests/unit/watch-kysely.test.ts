import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Watch for my images" (WP22) on the Kysely (Worker) path, against the same
// recording fake as the other crawler tests: what a watch creation, the
// "Take it down" conversion and stop-watching delete must say to the database,
// that a watch-only consent keeps its fingerprints in the pool, and that a
// full consent covers the findings recorded under the watch it replaced.
// Placeholder data only.

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
            else if (prop === "orderBy") detail.orderBy = args[0];
            else if (prop === "forUpdate") detail.forUpdate = true;
            else if (prop === "skipLocked") detail.skipLocked = true;
            else if (prop === "onConflict") detail.onConflict = true;
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

import { inMemoryAuditLog } from "@/lib/audit";
import { buildCrawlPool, findingStillConsented } from "@/lib/crawl-pool";
import { convertWatchToCase, createWatchCase, deleteWatchFingerprints } from "@/lib/watch-ops";
import { encryptField } from "@/lib/encryption";

const PDQ = "ab".repeat(32);
const NOW = new Date("2026-11-19T09:00:00Z");

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

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);
const wheresOf = (call: { detail: Record<string, unknown> }) => call.detail.wheres as unknown[][];

describe("createWatchCase, Kysely path", () => {
  it("inserts a WATCH case with no links and audits it", async () => {
    const created = await createWatchCase("user-a");
    expect(created.id).toBeTruthy();
    const insert = callsOn("Case").find((call) => call.op === "insert");
    expect(insert).toBeDefined();
    const values = insert!.detail.values as Record<string, unknown>;
    expect(values).toMatchObject({ userId: "user-a", status: "OPEN", mode: "WATCH" });
    expect(values.hashAdvisoryPlatformIds).toEqual([]);
    expect(inMemoryAuditLog.some((entry) => entry.eventType === "CASE_CREATED" && (entry.data as { mode?: string })?.mode === "WATCH")).toBe(true);
  });
});

describe("Take it down, Kysely path", () => {
  it("claims the WATCH case, clears the pool ids and withdraws only the watch-only consents", async () => {
    kysely.state.rows.Case = [{ id: "case-1" }];
    kysely.state.rows.CrawlConsent = [{ id: "consent-watch" }, { id: "consent-watch-2" }];
    const converted = await convertWatchToCase("case-1", "user-a", NOW);
    expect(converted).toEqual({ ok: true, withdrawnConsentIds: ["consent-watch", "consent-watch-2"] });

    const caseUpdate = callsOn("Case").find((call) => call.op === "update");
    expect(caseUpdate).toBeDefined();
    expect(caseUpdate!.detail.set).toMatchObject({ mode: "CASE" });
    expect(wheresOf(caseUpdate!)).toContainEqual(["id", "=", "case-1"]);
    expect(wheresOf(caseUpdate!)).toContainEqual(["mode", "=", "WATCH"]);

    const pool = callsOn("HashSubmission").find((call) => call.op === "update");
    expect(pool!.detail.set).toEqual({ crawlPoolId: null });
    expect(wheresOf(pool!)).toContainEqual(["caseId", "=", "case-1"]);

    const consentUpdate = callsOn("CrawlConsent").find((call) => call.op === "update");
    expect(consentUpdate!.detail.set).toMatchObject({ withdrawnAt: NOW });
    expect(wheresOf(consentUpdate!)).toContainEqual(["scope", "=", "WATCH_ONLY"]);
    expect(wheresOf(consentUpdate!)).toContainEqual(["withdrawnAt", "is", null]);

    expect(inMemoryAuditLog.some((entry) => entry.eventType === "WATCH_CONVERTED" && entry.entityId === "case-1")).toBe(true);
  });

  it("refuses when the case is not a watch", async () => {
    kysely.state.rows.Case = [];
    expect(await convertWatchToCase("case-1", "user-a", NOW)).toEqual({ ok: false, error: "not_a_watch" });
    expect(inMemoryAuditLog).toHaveLength(0);
  });
});

describe("stop-watching's fingerprint deletion, Kysely path", () => {
  it("deletes the case's findings before the fingerprints they reference", async () => {
    kysely.state.rows.HashSubmission = [{ numDeletedRows: 2 }];
    const deleted = await deleteWatchFingerprints("case-1");
    expect(deleted).toBe(2);
    const ops = kysely.state.calls.filter((call) => call.op === "delete").map((call) => call.table);
    expect(ops).toEqual(["CrawlFinding", "HashSubmission"]);
    const findingDelete = callsOn("CrawlFinding")[0];
    expect(wheresOf(findingDelete)).toContainEqual(["caseId", "=", "case-1"]);
    const hashDelete = callsOn("HashSubmission")[0];
    expect(wheresOf(hashDelete)).toContainEqual(["caseId", "=", "case-1"]);
    // Fingerprints that were dispatched somewhere are kept: the delete is
    // filtered to rows with no dispatch record.
    const hashWheres = wheresOf(hashDelete);
    expect(hashWheres.some((args) => typeof args[0] === "function")).toBe(true);
  });
});

describe("the pool and coverage, Kysely path", () => {
  it("a watch-only consent keeps her fingerprints in the pool", async () => {
    kysely.state.rows.CrawlConsent = [
      { id: "consent-watch", caseId: "c1", hashSubmissionIds: ["h1"], withdrawnAt: null },
    ];
    kysely.state.rows.HashSubmission = [
      { id: "h1", caseId: "c1", crawlPoolId: "fp_1", hashEncrypted: encryptField(PDQ), quality: 90, status: "APPROVED" },
    ];
    const pool = await buildCrawlPool(new Date("2026-11-19T00:00:00Z"));
    expect(pool.fingerprints).toEqual([{ id: "fp_1", pdq: PDQ, quality: 90 }]);
  });

  it("a full consent covers the finding the watch recorded, through convertedFromId", async () => {
    kysely.state.rows.CrawlConsent = [
      { id: "consent-full", caseId: "c1", hashSubmissionIds: ["h1"], signedAt: NOW, convertedFromId: "consent-watch", withdrawnAt: null },
    ];
    const finding = { caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-watch", firstSeenAt: NOW };
    expect(await findingStillConsented(finding)).toBe(true);
    kysely.state.rows.CrawlConsent = [
      { id: "consent-full", caseId: "c1", hashSubmissionIds: ["h1"], signedAt: NOW, convertedFromId: null, withdrawnAt: null },
    ];
    expect(await findingStillConsented(finding)).toBe(false);
    const select = callsOn("CrawlConsent").find((call) => call.op === "select");
    expect(select!.detail.select).toContain("convertedFromId");
  });
});
