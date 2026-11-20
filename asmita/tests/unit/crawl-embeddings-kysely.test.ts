import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP28 (ADR 008) on the Kysely (Worker) path, against a recording fake in the
// style of the other crawler tests. What the Worker limits make the real
// test: the live authorisation is locked FOR SHARE in the same transaction as
// the insert, the insert is one statement with ON CONFLICT (findingId) DO
// NOTHING, the finding it names is checked inside that transaction, and the
// pool read and the deletions are single statements. Placeholder data only.

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
              if (op === "delete") {
                // Kysely's DeleteResult: the count of rows the table holds.
                const count = BigInt((state.rows[table] ?? []).length);
                return takeFirst ? { numDeletedRows: count } : [{ numDeletedRows: count }];
              }
              if (op === "insert") {
                const all = Array.isArray(detail.values) ? detail.values : [detail.values];
                // ON CONFLICT (findingId) DO NOTHING, as the fake plays it: a
                // row whose findingId is already there inserts nothing.
                const existing = new Set((state.rows[table] ?? []).map((row) => row.findingId));
                rows = (all as Array<Record<string, unknown>>)
                  .filter((row) => !existing.has(row.findingId))
                  .map((row) => ({ ...row }));
              } else {
                rows = (state.rows[table] ?? []).map((row) => ({ ...row }));
                // The live-consent filter every CrawlConsent read applies.
                const wantsLive = ((detail.wheres as unknown[] | undefined) ?? []).some(
                  (w) => Array.isArray(w) && w[0] === "withdrawnAt" && w[2] === null,
                );
                if (wantsLive) rows = rows.filter((row) => row.withdrawnAt == null);
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
            else if (prop === "forShare") detail.forShare = true;
            else if (prop === "distinct") detail.distinct = true;
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
import { findingDigest } from "@/lib/crawl-findings";
import {
  deleteEmbeddingsForCase,
  deleteEmbeddingsForSubmission,
  poolEmbeddingsForPoolIds,
  recordCrawlEmbeddings,
  type CrawlEmbeddingsBody,
} from "@/lib/crawl-embeddings";

const NOW = new Date("2026-11-19T10:00:00Z");
const PAGE = "https://forum.example.com/thread/1";
const IMAGE = "https://cdn.example.com/img/1.jpg";
const VECTOR = [0.1, 0.2, 0.3];
const DIGEST = findingDigest("case-1", "consent-1", PAGE, IMAGE);

function world(overrides: Record<string, Array<Record<string, unknown>>> = {}) {
  kysely.state.rows = {
    HashSubmission: [{ id: "hs-1", caseId: "case-1", crawlPoolId: "fp_1", hashEncrypted: "x", quality: 80, status: "APPROVED", algorithm: "PDQ", videoFramesEncrypted: null }],
    CrawlConsent: [{ id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-1"], withdrawnAt: null }],
    // The pool keeps fingerprints only while the case is open or inside its
    // re-upload window (watch-and-verify WP24), so the id resolves while the
    // fixture's case is open.
    Case: [{ id: "case-1", status: "OPEN" }],
    CrawlFinding: [{ id: "cf-1", caseId: "case-1", hashSubmissionId: "hs-1", reviewStatus: "APPROVED", urlDigest: DIGEST, distance: 8, method: "PDQ", sscdSimilarity: null }],
    FindingEmbedding: [],
    ...overrides,
  };
  kysely.state.calls.length = 0;
}

function body(items: unknown[]): CrawlEmbeddingsBody {
  return { runId: "run-1", embeddings: items } as CrawlEmbeddingsBody;
}

const item = (overrides: Record<string, unknown> = {}) =>
  ({ fingerprintId: "fp_1", pageUrl: PAGE, imageUrl: IMAGE, model: "sscd_disc_mixup", version: "onnx-1", vector: VECTOR, ...overrides });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_SSCD", "true");
  world();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);

describe("recordCrawlEmbeddings, Kysely path", () => {
  it("locks the live authorisation FOR SHARE before the insert, in one transaction", async () => {
    const { results } = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(results).toEqual([{ status: "stored" }]);

    const lock = callsOn("CrawlConsent").find((call) => call.op === "select" && call.detail.forShare === true);
    expect(lock).toBeDefined();
    expect(lock!.detail.wheres).toEqual(expect.arrayContaining([["id", "=", "consent-1"], ["withdrawnAt", "is", null]]));

    const inserts = callsOn("FindingEmbedding").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    const lockAt = kysely.state.calls.indexOf(lock!);
    const insertAt = kysely.state.calls.indexOf(inserts[0]!);
    expect(lockAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(lockAt);
  });

  it("the insert is one statement with ON CONFLICT (findingId) DO NOTHING, the vector encrypted", async () => {
    const { results } = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(results).toEqual([{ status: "stored" }]);
    const insert = callsOn("FindingEmbedding").find((call) => call.op === "insert")!;
    expect(insert.detail.onConflict).toBe(true);
    const row = insert.detail.values as Record<string, unknown>;
    expect(row).toMatchObject({ findingId: "cf-1", hashSubmissionId: "hs-1", caseId: "case-1", model: "sscd_disc_mixup", version: "onnx-1", createdAt: NOW });
    expect(String(row.vectorEncrypted)).not.toContain("0.1");
    expect(String(row.vectorEncrypted)).not.toContain("[");
    expect(String(row.id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("checks the finding inside the transaction and refuses what is not confirmed", async () => {
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "stored" }]);
    const finding = callsOn("CrawlFinding").filter((call) => call.op === "select");
    expect((finding[0]!.detail.select as string[]).sort()).toEqual(["hashSubmissionId", "id", "reviewStatus"].sort());
    expect(finding[0]!.detail.wheres).toEqual(expect.arrayContaining([["caseId", "=", "case-1"], ["urlDigest", "=", DIGEST]]));

    // A finding that belongs to another fingerprint of the same case.
    world({
      CrawlFinding: [{ id: "cf-1", caseId: "case-1", hashSubmissionId: "hs-other", reviewStatus: "APPROVED", urlDigest: DIGEST, distance: 8, method: "PDQ", sscdSimilarity: null }],
    });
    const wrong = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(wrong.results).toEqual([{ status: "rejected", reason: "finding_not_confirmed" }]);
    expect(callsOn("FindingEmbedding").filter((call) => call.op === "insert")).toHaveLength(0);

    // A withdrawn authorisation: the pool id no longer resolves (and the
    // FOR SHARE lock in the transaction would find nothing either).
    world({
      CrawlConsent: [{ id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-1"], withdrawnAt: NOW }],
    });
    const gone = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(gone.results).toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
    expect(callsOn("FindingEmbedding").filter((call) => call.op === "insert")).toHaveLength(0);
  });

  it("answers embedding_exists when the confirmed copy is already embedded", async () => {
    kysely.state.rows.FindingEmbedding = [{ id: "emb-1", findingId: "cf-1", hashSubmissionId: "hs-1", caseId: "case-1", model: "sscd_disc_mixup", version: "onnx-1", vectorEncrypted: "enc", createdAt: NOW }];
    const { results } = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(results).toEqual([{ status: "stored", reason: "embedding_exists" }]);
    const inserts = callsOn("FindingEmbedding").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.detail.onConflict).toBe(true);
  });
});

describe("poolEmbeddingsForPoolIds, Kysely path", () => {
  it("reads the pool columns in one statement, newest first, and decrypts the vectors", async () => {
    kysely.state.rows.FindingEmbedding = [
      { id: "emb-2", hashSubmissionId: "hs-1", caseId: "case-1", model: "sscd_disc_mixup", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify([0.4, 0.5])), createdAt: new Date("2026-11-19T09:00:00Z") },
      { id: "emb-1", hashSubmissionId: "hs-1", caseId: "case-1", model: "sscd_disc_mixup", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify(VECTOR)), createdAt: new Date("2026-11-19T08:00:00Z") },
      { id: "emb-3", hashSubmissionId: "hs-1", caseId: "case-1", model: "sscd_old", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify([0.9])), createdAt: new Date("2026-11-19T10:00:00Z") },
    ];
    const grouped = await poolEmbeddingsForPoolIds(["hs-1"]);
    const read = callsOn("FindingEmbedding").find((call) => call.op === "select")!;
    expect((read.detail.select as string[]).sort()).toEqual(["createdAt", "hashSubmissionId", "model", "vectorEncrypted", "version"].sort());
    expect(read.detail.wheres).toEqual(expect.arrayContaining([["hashSubmissionId", "in", ["hs-1"]]]));
    expect(read.detail.orderBy).toBe("createdAt");
    // The other model's row is skipped even though it is the newest.
    expect(grouped.get("hs-1")).toEqual([[0.4, 0.5], VECTOR]);
  });
});

describe("the deletion helpers, Kysely path", () => {
  it("deletes by case and by fingerprint, each in one statement", async () => {
    expect(await deleteEmbeddingsForCase(["case-1", "case-2"])).toBe(0);
    const deletes = callsOn("FindingEmbedding").filter((call) => call.op === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.detail.wheres).toEqual(expect.arrayContaining([["caseId", "in", ["case-1", "case-2"]]]));

    expect(await deleteEmbeddingsForSubmission("hs-1")).toBe(0);
    const bySubmission = callsOn("FindingEmbedding").filter((call) => call.op === "delete");
    expect(bySubmission).toHaveLength(2);
    expect(bySubmission[1]!.detail.wheres).toEqual(expect.arrayContaining([["hashSubmissionId", "=", "hs-1"]]));
  });
});
