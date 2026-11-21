import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Review labels (review labels WP37) on the Kysely (Worker) path, against a
// recording fake in the style of the other crawler tests. What the Worker
// makes the real test: one read and ONE conditional update per label action
// (the write carries the flag and, for the possible-minor switch, the review
// status it was planned from, so a racing review is a conflict, never a
// half-applied label), the audit entry is one batched hash-chained insert,
// and no address column is ever selected.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    // When null the update reports one row updated; set to [] it simulates
    // a racing write winning first (label_conflict).
    updateResult: null as null | Array<Record<string, unknown>>,
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
              } else if (op === "update") {
                rows = state.updateResult === null ? [{ id: "cf1" }] : state.updateResult;
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
            else if (prop === "groupBy") detail.groupBy = args[0];
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

import { applyFindingLabel } from "@/lib/crawl-findings";

const NOW = new Date("2026-11-19T09:30:00.000Z");

function findingRow(over: Record<string, unknown> = {}) {
  return {
    id: "cf1", caseId: "c1", reviewStatus: "CANDIDATE",
    labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
    labelSexual: false, labelSexualById: null, labelSexualAt: null,
    labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
  kysely.state.rows = { CrawlFinding: [findingRow()], audit_log: [{ sequence: 7, eventHash: "previous-hash" }] };
  kysely.state.calls.length = 0;
  kysely.state.updateResult = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function callsOn(table: string) {
  return kysely.state.calls.filter((call) => call.table === table);
}

describe("applyFindingLabel, Kysely path", () => {
  it("sets an informational label in one read and one conditional update, then one audited insert", async () => {
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "aiMade", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });

    const finding = callsOn("CrawlFinding");
    expect(finding).toHaveLength(2);
    expect(finding[0].op).toBe("select"); // the read: selectAll().where id
    const update = finding[1];
    expect(update.op).toBe("update");
    expect(update.detail.set).toMatchObject({ labelAiMade: true, labelAiMadeById: "admin-1", labelAiMadeAt: NOW });
    expect(update.detail.set).not.toHaveProperty("reviewStatus");
    expect(update.detail.wheres).toEqual([["id", "=", "cf1"], ["labelAiMade", "=", false]]);

    // One audit insert, hash-chained after the last row (the batched write
    // reads the previous hash first, then inserts once — same convention as
    // the other Kysely crawler tests).
    const inserted = callsOn("audit_log").filter((call) => call.op === "insert");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].detail.values).toEqual([
      expect.objectContaining({ eventType: "CRAWL_FINDING_LABEL_SET", entityId: "cf1", actorId: "admin-1", data: { caseId: "c1", label: "aiMade" }, previousHash: "previous-hash" }),
    ]);
  });

  it("moves a candidate finding to MINOR_PROTOCOL in one conditional update that carries the status it planned from", async () => {
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });
    const update = callsOn("CrawlFinding").find((call) => call.op === "update")!;
    expect(update.detail.set).toMatchObject({
      labelPossibleMinor: true, labelPossibleMinorById: "admin-1", labelPossibleMinorAt: NOW,
      labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
      minorProtocolBefore: "CANDIDATE", reviewStatus: "MINOR_PROTOCOL",
    });
    expect(update.detail.wheres).toEqual([["id", "=", "cf1"], ["labelPossibleMinor", "=", false], ["reviewStatus", "=", "CANDIDATE"]]);
    expect(callsOn("audit_log").find((call) => call.op === "insert")!.detail.values).toEqual([
      expect.objectContaining({ eventType: "CRAWL_FINDING_LABEL_SET", data: { caseId: "c1", label: "possibleMinor", minorProtocol: true } }),
    ]);
  });

  it("keeps a dismissed finding dismissed and records the label only", async () => {
    kysely.state.rows.CrawlFinding = [findingRow({ reviewStatus: "DISMISSED" })];
    await applyFindingLabel({ findingId: "cf1", action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    const update = callsOn("CrawlFinding").find((call) => call.op === "update")!;
    expect(update.detail.set).toMatchObject({ minorProtocolBefore: null });
    expect(update.detail.set).not.toHaveProperty("reviewStatus");
    expect(update.detail.wheres).toEqual([["id", "=", "cf1"], ["labelPossibleMinor", "=", false], ["reviewStatus", "=", "DISMISSED"]]);
  });

  it("clears the possible-minor label with the second admin's reason and restores the earlier status", async () => {
    kysely.state.rows.CrawlFinding = [findingRow({
      reviewStatus: "MINOR_PROTOCOL", labelPossibleMinor: true, labelPossibleMinorById: "admin-1", labelPossibleMinorAt: NOW,
      minorProtocolBefore: "APPROVED",
    })];
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "clear", label: "possibleMinor", adminId: "admin-2", reason: "checked the case file", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });
    const update = callsOn("CrawlFinding").find((call) => call.op === "update")!;
    expect(update.detail.set).toMatchObject({
      labelPossibleMinor: false,
      labelPossibleMinorClearedById: "admin-2", labelPossibleMinorClearedAt: NOW, labelPossibleMinorClearReason: "checked the case file",
      reviewStatus: "APPROVED",
    });
    expect(update.detail.set).not.toHaveProperty("labelPossibleMinorById"); // the setter stays as the record
    expect(update.detail.wheres).toEqual([["id", "=", "cf1"], ["labelPossibleMinor", "=", true], ["reviewStatus", "=", "MINOR_PROTOCOL"]]);
    expect(callsOn("audit_log").find((call) => call.op === "insert")!.detail.values).toEqual([
      expect.objectContaining({
        eventType: "CRAWL_FINDING_LABEL_CLEARED", actorId: "admin-2",
        data: { caseId: "c1", label: "possibleMinor", reason: "checked the case file", restoredTo: "APPROVED" },
      }),
    ]);
  });

  it("reports a conflict and writes nothing when another action won the row first", async () => {
    kysely.state.updateResult = [];
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "sexual", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: false, error: "label_conflict" });
    expect(callsOn("audit_log")).toHaveLength(0);
  });

  it("is a no-op without any write when the label is already set", async () => {
    kysely.state.rows.CrawlFinding = [findingRow({ labelSexual: true })];
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "sexual", adminId: "admin-2", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: false });
    expect(callsOn("CrawlFinding")).toHaveLength(1); // the read only
    expect(callsOn("audit_log")).toHaveLength(0);
  });

  it("refuses the setter's own clear before anything is written", async () => {
    kysely.state.rows.CrawlFinding = [findingRow({ labelPossibleMinor: true, labelPossibleMinorById: "admin-1" })];
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "clear", label: "possibleMinor", adminId: "admin-1", reason: "x", now: NOW });
    expect(outcome).toEqual({ ok: false, error: "second_admin_required" });
    expect(callsOn("CrawlFinding")).toHaveLength(1);
    expect(callsOn("audit_log")).toHaveLength(0);
  });

  it("carries no address column in anything it writes", async () => {
    kysely.state.rows.CrawlFinding = [findingRow()];
    await applyFindingLabel({ findingId: "cf1", action: "set", label: "aiMade", adminId: "admin-1", now: NOW });
    const update = callsOn("CrawlFinding").find((call) => call.op === "update")!;
    expect(Object.keys(update.detail.set as Record<string, unknown>)).toEqual(
      expect.arrayContaining(["labelAiMade", "labelAiMadeById", "labelAiMadeAt"]),
    );
    expect(Object.keys(update.detail.set as Record<string, unknown>)).not.toContain("pageUrlEncrypted");
    expect(Object.keys(update.detail.set as Record<string, unknown>)).not.toContain("imageUrlEncrypted");
    // The audit entry carries the label and the case id only.
    const row = (callsOn("audit_log").find((call) => call.op === "insert")!.detail.values as Array<Record<string, unknown>>)[0];
    expect(Object.keys(row)).not.toContain("pageUrlEncrypted");
    expect(row.data).toEqual({ caseId: "c1", label: "aiMade" });
  });
});
