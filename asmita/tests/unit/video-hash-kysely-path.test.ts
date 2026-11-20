import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP17 on the Kysely (Worker) path, against a recording fake in the style of
// crawl-reported-sources-kysely.test.ts: a VPDQ fingerprint enters the
// crawler pool as its video entry and resolves by pool id (video-fingerprints
// spec WP20, which replaces the pre-WP20 exclusion), and account erasure
// clears the frame list in the same statement that removes the pool id.
// Placeholder hashes only.

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
          if (prop === "execute") return async () => ((state.rows[table] ?? []).map((row) => ({ ...row })));
          if (prop === "executeTakeFirst") return async () => (state.rows[table] ?? [])[0];
          if (prop === "executeTakeFirstOrThrow") return async () => (state.rows[table] ?? [])[0];
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
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

import { buildCrawlPool, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { hardDeleteDueUsers } from "@/lib/case-ops";
import { inMemoryAuditLog } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";

const PDQ_A = "ab".repeat(32);
const PDQ_B = "cd".repeat(32);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.rows = {};
  kysely.state.calls.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});
afterEach(() => vi.unstubAllEnvs());

function callsOn(table: string) {
  return kysely.state.calls.filter((call) => call.table === table);
}

describe("crawler pool, Kysely path", () => {
  it("lists a VPDQ fingerprint as its video entry and selects the frame column", async () => {
    kysely.state.rows.HashSubmission = [
      {
        id: "hs-vid", caseId: "case-1", crawlPoolId: "fp_2", hashEncrypted: encryptField(PDQ_B), quality: 90, status: "APPROVED", algorithm: "VPDQ",
        videoFramesEncrypted: encryptField(JSON.stringify([{ hash: PDQ_A, quality: 90, t: 0 }, { hash: PDQ_B, quality: 80, t: 1 }])),
      },
      { id: "hs-img", caseId: "case-1", crawlPoolId: "fp_1", hashEncrypted: encryptField(PDQ_A), quality: 70, status: "APPROVED", algorithm: "PDQ" },
    ];
    kysely.state.rows.CrawlConsent = [
      { id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-img", "hs-vid"] },
    ];

    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([
      { id: "fp_1", pdq: PDQ_A, quality: 70 },
      { id: "fp_2", kind: "video", frames: [PDQ_A, PDQ_B] },
    ]);
    // The candidate read asks for the algorithm and the frame list, so the
    // video entry cannot be skipped or served empty by a stale select.
    const selects = callsOn("HashSubmission").filter((call) => call.op === "select");
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      expect(select.detail.select).toContain("algorithm");
      expect(select.detail.select).toContain("videoFramesEncrypted");
    }
  });

  it("resolves a pool id that belongs to a VPDQ fingerprint", async () => {
    kysely.state.rows.HashSubmission = [
      { id: "hs-vid", caseId: "case-1", crawlPoolId: "fp_2", hashEncrypted: encryptField(PDQ_B), quality: 90, status: "APPROVED", algorithm: "VPDQ", videoFramesEncrypted: null },
    ];
    kysely.state.rows.CrawlConsent = [
      { id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-vid"] },
    ];
    expect(await resolvePoolFingerprint("fp_2")).toMatchObject({ hashSubmissionId: "hs-vid", caseId: "case-1" });
  });
});

describe("account erasure, Kysely path", () => {
  it("clears the video frame list in the same statement that removes the pool id", async () => {
    kysely.state.rows["DeletionJob"] = [{ jobId: "job-1", userId: "user-1" }];
    kysely.state.rows.User = [{ id: "user-1", emailHash: "email-hash" }];
    kysely.state.rows.Case = [{ id: "case-1", referenceNumber: "R-1" }];

    const deleted = await hardDeleteDueUsers(new Date("2026-11-19T00:00:00Z"));
    expect(deleted).toEqual(["user-1"]);

    const updates = callsOn("HashSubmission").filter((call) => call.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].detail.set).toEqual({ crawlPoolId: null, videoFramesEncrypted: null });
    // The row itself is kept: no delete touches HashSubmission.
    expect(callsOn("HashSubmission").some((call) => call.op === "delete")).toBe(false);
  });
});
