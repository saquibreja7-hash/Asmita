import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SSCD embeddings of confirmed copies (ADR 008, WP28) on the memory dev
// path: the route's gating, the analyst-confirmation gate, idempotence,
// validation, and every deletion path. The pool serves the vectors only
// while every gate holds. Placeholder data only; the "vectors" are a few
// floats, never a real descriptor.

vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, eraseCrawlMemoryForCases, resetCrawlMemory, type MemoryFindingEmbedding } from "@/lib/crawl-store";
import { issueCrawlServiceKey } from "@/lib/crawler-auth";
import { recordCrawlConsent, withdrawCrawlConsent } from "@/lib/crawl-consent";
import { createCrawlSource, listEnabledCrawlSources } from "@/lib/crawl-sources";
import { listCrawlFindings, recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import {
  deleteEmbeddingsForSubmission,
  poolEmbeddingsForPoolIds,
  recordCrawlEmbeddings,
  type CrawlEmbeddingsBody,
} from "@/lib/crawl-embeddings";
import { buildCrawlPool } from "@/lib/crawl-pool";
import { sscdEnabled, sscdModelId, sscdModelVersion } from "@/lib/crawler-flags";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";
import { POST as postEmbeddings } from "@/app/api/crawler/embeddings/route";

const PDQ_A = "a".repeat(64);
const PAGE = "https://forum.example.com/thread/1";
const IMAGE = "https://cdn.example.com/img/1.jpg";
const VECTOR = [0.123456789, -0.5, 0.75, 0.9];
const MODEL = "sscd_disc_mixup";
const VERSION = "onnx-1";

let key: string;
let sourceId: string;

function crawlerRequest(path: string, init: { method?: string; body?: unknown; auth?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = init.auth === undefined ? `Bearer ${key}` : init.auth;
  if (auth) headers.authorization = auth;
  return new Request(`https://asmita.test/api/crawler/${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) } : {}),
  });
}

const poolId = (hashSubmissionId: string) => crawlMemory().fingerprints.get(hashSubmissionId)!.crawlPoolId!;

function seedFingerprint(id: string, caseId: string, status: "PENDING_REVIEW" | "APPROVED" | "DISPATCHED" | "REJECTED" = "APPROVED") {
  crawlMemory().fingerprints.set(id, { id, caseId, hashEncrypted: encryptField(PDQ_A), quality: 80, status, crawlPoolId: null });
}

async function consent(caseId: string, ids: string[]) {
  const result = await recordCrawlConsent({
    caseId, signedPdfEncrypted: encryptField("placeholder-pdf"), hashSubmissionIds: ids, templateId: "tpl-1", templateDigest: "digest-1", actorId: "user-1",
  });
  expect(result.ok).toBe(true);
}

function findingItem(overrides: Record<string, unknown> = {}) {
  return {
    fingerprintId: "missing",
    pageUrl: PAGE,
    imageUrl: IMAGE,
    distance: 8,
    quality: 90,
    observedAt: "2026-11-16T10:00:00Z",
    sourceId,
    ...overrides,
  };
}

function embeddingItem(overrides: Record<string, unknown> = {}) {
  return { fingerprintId: "fp", pageUrl: PAGE, imageUrl: IMAGE, model: MODEL, version: VERSION, vector: VECTOR, ...overrides };
}

async function reportFindings(items: unknown[], runId = "run-1") {
  const { results } = await recordCrawlFindings({ runId, findings: items } as never, "key-1");
  return results;
}

/** A case with an approved (analyst-confirmed) copy and its live pool id. */
async function approvedFindingWorld() {
  const record = await store.createCase("user-a");
  seedFingerprint("hs-1", record.id);
  await consent(record.id, ["hs-1"]);
  const fp = poolId("hs-1");
  await reportFindings([findingItem({ fingerprintId: fp })]);
  const [row] = await listCrawlFindings({ caseId: record.id });
  expect(await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
  return { record, fp, findingId: row.id };
}

async function postEmbeddingsRoute(body: unknown) {
  const response = await postEmbeddings(crawlerRequest("embeddings", { method: "POST", body }));
  return { status: response.status, body: await response.json() };
}

async function recordEmbeddings(items: unknown[], now?: Date) {
  const body: CrawlEmbeddingsBody = { runId: "run-1", embeddings: items } as CrawlEmbeddingsBody;
  return recordCrawlEmbeddings(body, now);
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_SSCD", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  ({ key } = await issueCrawlServiceKey("test crawler"));
  const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!created.ok) throw new Error("source");
  sourceId = created.source.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the SSCD flags (crawler-flags.ts)", () => {
  it("ENABLE_SSCD is on only when exactly true, like ENABLE_CRAWLER", () => {
    expect(sscdEnabled({})).toBe(false);
    expect(sscdEnabled({ ENABLE_SSCD: "false" })).toBe(false);
    expect(sscdEnabled({ ENABLE_SSCD: "TRUE" })).toBe(false);
    expect(sscdEnabled({ ENABLE_SSCD: "true" })).toBe(true);
  });

  it("the model id and version default to the pinned pair and fall back on junk", () => {
    expect(sscdModelId({})).toBe("sscd_disc_mixup");
    expect(sscdModelId({ SSCD_MODEL_ID: "" })).toBe("sscd_disc_mixup");
    expect(sscdModelId({ SSCD_MODEL_ID: "x".repeat(65) })).toBe("sscd_disc_mixup");
    expect(sscdModelId({ SSCD_MODEL_ID: "sscd_other" })).toBe("sscd_other");
    expect(sscdModelVersion({})).toBe("onnx-1");
    expect(sscdModelVersion({ SSCD_MODEL_VERSION: "" })).toBe("onnx-1");
    expect(sscdModelVersion({ SSCD_MODEL_VERSION: "y".repeat(65) })).toBe("onnx-1");
    expect(sscdModelVersion({ SSCD_MODEL_VERSION: "onnx-2" })).toBe("onnx-2");
    // A value of the allowed length survives, including at the bounds.
    expect(sscdModelId({ SSCD_MODEL_ID: "m" })).toBe("m");
    expect(sscdModelId({ SSCD_MODEL_ID: "x".repeat(64) })).toBe("x".repeat(64));
  });
});

describe("the switch: nothing changes while ENABLE_SSCD is off", () => {
  it("the embeddings route answers 503 crawler_disabled, with the crawler on or off", async () => {
    vi.stubEnv("ENABLE_SSCD", "false");
    expect(await postEmbeddingsRoute({ runId: "r", embeddings: [embeddingItem()] })).toEqual({ status: 503, body: { error: "crawler_disabled" } });
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect(await postEmbeddingsRoute({ runId: "r", embeddings: [embeddingItem()] })).toEqual({ status: 503, body: { error: "crawler_disabled" } });
  });

  it("recordCrawlEmbeddings stays callable, but the pool serves no vectors and keeps the exact pre-WP28 shape", async () => {
    vi.stubEnv("ENABLE_SSCD", "false");
    const { record, fp } = await approvedFindingWorld();
    const { results } = await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    expect(results).toEqual([{ status: "stored" }]);
    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([{ id: fp, pdq: PDQ_A, quality: 80 }]);
    expect(await poolEmbeddingsForPoolIds(["hs-1"])).toEqual(new Map([["hs-1", [VECTOR]]]));
    // The route alone refuses; the stored row still leaves with the case.
    expect(await postEmbeddingsRoute({ runId: "r", embeddings: [embeddingItem({ fingerprintId: fp })] })).toEqual({ status: 503, body: { error: "crawler_disabled" } });
    eraseCrawlMemoryForCases([record.id]);
    expect(crawlMemory().embeddings.size).toBe(0);
  });
});

describe("POST /api/crawler/embeddings: envelope", () => {
  it("refuses a malformed envelope whole, like the findings route", async () => {
    for (const body of [
      "{oops",
      { runId: "run id with spaces", embeddings: [{}] },
      { runId: "r", embeddings: [{}], extra: true },
      { runId: "r", embeddings: "x" },
      { runId: "r", embeddings: [] },
      { runId: "r", embeddings: Array.from({ length: 51 }, () => embeddingItem()) },
    ]) {
      const response = await postEmbeddings(crawlerRequest("embeddings", { method: "POST", body: body as unknown }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
    expect((await postEmbeddingsRoute({ runId: "r", embeddings: Array.from({ length: 50 }, () => embeddingItem()) })).status).toBe(200);
  });

  it("needs the service key, and the key's own bucket", async () => {
    const noKey = await postEmbeddings(crawlerRequest("embeddings", { method: "POST", body: { runId: "r", embeddings: [embeddingItem()] }, auth: null }));
    expect(noKey.status).toBe(401);
    const wrongKey = await postEmbeddings(crawlerRequest("embeddings", { method: "POST", body: { runId: "r", embeddings: [embeddingItem()] }, auth: `Bearer cwk_${"0".repeat(48)}` }));
    expect(wrongKey.status).toBe(401);
  });
});

describe("POST /api/crawler/embeddings: per-item validation", () => {
  it("rejects a malformed item without losing the rest of the batch", async () => {
    const { fp } = await approvedFindingWorld();
    const { results, mediaRejected } = await recordEmbeddings([
      { ...embeddingItem({ fingerprintId: fp }), extra: true },
      { ...embeddingItem({ fingerprintId: fp }), imageUrl: "data:image/png;base64,iVBORw0KGgo=" },
      { ...embeddingItem({ fingerprintId: fp }), pageUrl: "ftp://forum.example.com/x" },
      { ...embeddingItem({ fingerprintId: fp }), imageUrl: "https://cdn.example.com:8080/i.jpg" },
      { ...embeddingItem({ fingerprintId: fp }), vector: [] },
      { ...embeddingItem({ fingerprintId: fp }), vector: [0.5, 2] },
      { ...embeddingItem({ fingerprintId: fp }), vector: "not-an-array" },
      { ...embeddingItem({ fingerprintId: fp }), vector: [0.5, "0.6"] },
      embeddingItem({ fingerprintId: fp }),
    ]);
    expect(mediaRejected).toBe(true);
    expect(results).toEqual([
      { status: "rejected", reason: "invalid_embedding" },
      { status: "rejected", reason: "media_payload_rejected" },
      { status: "rejected", reason: "invalid_embedding" },
      { status: "rejected", reason: "invalid_url" },
      { status: "rejected", reason: "invalid_vector" },
      { status: "rejected", reason: "invalid_vector" },
      { status: "rejected", reason: "invalid_vector" },
      { status: "rejected", reason: "invalid_vector" },
      { status: "stored" },
    ]);
    expect(crawlMemory().embeddings.size).toBe(1);
  });

  it("refuses an over-long vector and a non-finite component", async () => {
    const { fp } = await approvedFindingWorld();
    const long = { ...embeddingItem({ fingerprintId: fp }), vector: Array.from({ length: 2049 }, () => 0.01) };
    expect((await recordEmbeddings([long])).results).toEqual([{ status: "rejected", reason: "invalid_vector" }]);
    // JSON has no Infinity literal, but 1e999 parses to one; the schema refuses it.
    const response = await postEmbeddings(crawlerRequest("embeddings", {
      method: "POST",
      body: `{"runId":"r","embeddings":[{"fingerprintId":"${fp}","pageUrl":"${PAGE}","imageUrl":"${IMAGE}","model":"${MODEL}","version":"${VERSION}","vector":[1e999]}]}`,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ status: "rejected", reason: "invalid_vector" }] });
    expect(crawlMemory().embeddings.size).toBe(0);
  });

  it("keeps the vector out of every log: no audit entry is written at all", async () => {
    const { fp } = await approvedFindingWorld();
    const before = inMemoryAuditLog.length;
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    expect(inMemoryAuditLog.length).toBe(before);
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain("0.123456789");
  });
});

describe("the analyst-confirmation gate", () => {
  it("stores only for an APPROVED finding: a candidate and a dismissed one are refused", async () => {
    const record = await store.createCase("user-a");
    seedFingerprint("hs-1", record.id);
    await consent(record.id, ["hs-1"]);
    const fp = poolId("hs-1");
    await reportFindings([
      findingItem({ fingerprintId: fp }),
      findingItem({ fingerprintId: fp, pageUrl: "https://forum.example.com/thread/2" }),
    ]);
    const [first, second] = await listCrawlFindings({ caseId: record.id });
    expect(await reviewCrawlFinding({ findingId: second.id, decision: "dismiss", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "DISMISSED" });

    const { results } = await recordEmbeddings([
      embeddingItem({ fingerprintId: fp, pageUrl: "https://forum.example.com/thread/2" }),
      embeddingItem({ fingerprintId: fp }), // still a candidate
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: "finding_not_confirmed" },
      { status: "rejected", reason: "finding_not_confirmed" },
    ]);
    expect(crawlMemory().embeddings.size).toBe(0);

    expect(await reviewCrawlFinding({ findingId: first.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
    expect((await recordEmbeddings([embeddingItem({ fingerprintId: fp })])).results).toEqual([{ status: "stored" }]);
  });

  it("refuses an address that is not the confirmed finding's, and another fingerprint of the same case", async () => {
    const record = await store.createCase("user-a");
    seedFingerprint("hs-1", record.id);
    seedFingerprint("hs-2", record.id);
    await consent(record.id, ["hs-1", "hs-2"]);
    const fp1 = poolId("hs-1");
    await reportFindings([findingItem({ fingerprintId: fp1 })]);
    const [row] = await listCrawlFindings({ caseId: record.id });
    await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" });

    const { results } = await recordEmbeddings([
      embeddingItem({ fingerprintId: fp1, pageUrl: "https://forum.example.com/thread/other" }),
      embeddingItem({ fingerprintId: poolId("hs-2") }),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: "finding_not_confirmed" }, // a different copy: no such finding
      { status: "rejected", reason: "finding_not_confirmed" }, // the finding belongs to hs-1, not hs-2
    ]);
    expect(crawlMemory().embeddings.size).toBe(0);
  });

  it("refuses an unknown or withdrawn pool id like the findings route does", async () => {
    const { fp } = await approvedFindingWorld();
    const { results } = await recordEmbeddings([
      embeddingItem({ fingerprintId: "fp_unknown" }),
      embeddingItem({ fingerprintId: "hs-1" }), // the HashSubmission id itself
      embeddingItem({ fingerprintId: fp }),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: "fingerprint_not_accepted" },
      { status: "rejected", reason: "fingerprint_not_accepted" },
      { status: "stored" },
    ]);
  });

  it("accepts only the configured model id and version", async () => {
    const { fp } = await approvedFindingWorld();
    vi.stubEnv("SSCD_MODEL_ID", "sscd_disc_mixup");
    vi.stubEnv("SSCD_MODEL_VERSION", "onnx-1");
    const { results } = await recordEmbeddings([
      embeddingItem({ fingerprintId: fp, model: "sscd_other" }),
      embeddingItem({ fingerprintId: fp, version: "onnx-2" }),
      embeddingItem({ fingerprintId: fp }),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: "model_mismatch" },
      { status: "rejected", reason: "model_mismatch" },
      { status: "stored" },
    ]);
  });

  it("is idempotent: a repeat answers embedding_exists and stores nothing new", async () => {
    const { fp } = await approvedFindingWorld();
    expect((await recordEmbeddings([embeddingItem({ fingerprintId: fp })])).results).toEqual([{ status: "stored" }]);
    expect((await recordEmbeddings([embeddingItem({ fingerprintId: fp })])).results).toEqual([{ status: "stored", reason: "embedding_exists" }]);
    expect(crawlMemory().embeddings.size).toBe(1);
  });
});

describe("the pool serves the embeddings (memory path)", () => {
  it("attaches sscd to the image entry of a confirmed copy, and nothing to an entry without one", async () => {
    const record = await store.createCase("user-a");
    seedFingerprint("hs-1", record.id);
    seedFingerprint("hs-b", record.id);
    await consent(record.id, ["hs-1", "hs-b"]);
    const fp = poolId("hs-1");
    await reportFindings([findingItem({ fingerprintId: fp })]);
    const [row] = await listCrawlFindings({ caseId: record.id });
    await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" });
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);

    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toHaveLength(2);
    // The entry without an embedding keeps the exact pre-WP28 shape (no sscd key).
    expect(pool.fingerprints).toContainEqual({ id: poolId("hs-b"), pdq: PDQ_A, quality: 80 });
    expect(pool.fingerprints).toContainEqual({ id: fp, pdq: PDQ_A, quality: 80, sscd: { model: MODEL, version: VERSION, vectors: [VECTOR] } });
  });

  it("a video entry never carries sscd, even if a row exists for its fingerprint", async () => {
    const record = await store.createCase("user-a");
    crawlMemory().fingerprints.set("hs-v", {
      id: "hs-v", caseId: record.id, hashEncrypted: encryptField(PDQ_A), quality: 95, status: "APPROVED", crawlPoolId: null,
      algorithm: "VPDQ", videoFramesEncrypted: encryptField(JSON.stringify([{ hash: PDQ_A, quality: 90, t: 0 }])),
    });
    await consent(record.id, ["hs-v"]);
    // The store never receives a video embedding from the crawler; if one
    // exists anyway, the pool must still not serve it on a video entry.
    crawlMemory().embeddings.set("emb-v", {
      id: "emb-v", findingId: "none", hashSubmissionId: "hs-v", caseId: record.id, model: MODEL, version: VERSION, vector: VECTOR, createdAt: new Date(),
    });
    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([{ id: poolId("hs-v"), kind: "video", frames: [PDQ_A] }]);
  });

  it("the pool version flips when an embedding is added", async () => {
    const { fp } = await approvedFindingWorld();
    const before = await buildCrawlPool();
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    const after = await buildCrawlPool();
    expect(after.version).not.toBe(before.version);
    // Deterministic: the same vectors hash the same.
    expect((await buildCrawlPool()).version).toBe(after.version);
  });

  it("serves at most 16 vectors per fingerprint, newest first, and only the configured model", async () => {
    const record = await store.createCase("user-a");
    seedFingerprint("hs-1", record.id);
    await consent(record.id, ["hs-1"]);
    const fp = poolId("hs-1");
    // Eighteen approved copies, each its own finding (one embedding per finding).
    for (let i = 0; i < 18; i += 1) {
      await reportFindings([findingItem({ fingerprintId: fp, pageUrl: `https://forum.example.com/thread/${i}` })], `run-${i}`);
    }
    for (const candidate of await listCrawlFindings({ caseId: record.id, status: "CANDIDATE" })) {
      expect(await reviewCrawlFinding({ findingId: candidate.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
    }
    // Recorded one at a time with increasing clocks, so "newest" is deterministic.
    const base = new Date("2026-11-19T10:00:00Z");
    for (let i = 0; i < 18; i += 1) {
      const { results } = await recordEmbeddings(
        [embeddingItem({ fingerprintId: fp, pageUrl: `https://forum.example.com/thread/${i}`, vector: [i / 100] })],
        new Date(base.getTime() + i * 60_000),
      );
      expect(results).toEqual([{ status: "stored" }]);
    }
    const grouped = await poolEmbeddingsForPoolIds(["hs-1"]);
    const vectors = grouped.get("hs-1")!;
    expect(vectors).toHaveLength(16);
    // Newest first: thread 17 leads, and the two oldest (threads 0 and 1) are the ones dropped.
    expect(vectors[0]).toEqual([17 / 100]);
    expect(vectors).not.toContainEqual([0]);
    expect(vectors).not.toContainEqual([1 / 100]);

    // A row of another model is never served, and never counts against the 16.
    crawlMemory().embeddings.set("emb-old", {
      id: "emb-old", findingId: "none", hashSubmissionId: "hs-1", caseId: record.id, model: "sscd_old", version: VERSION, vector: [0.9], createdAt: new Date(base.getTime() + 30 * 60_000),
    });
    expect((await poolEmbeddingsForPoolIds(["hs-1"])).get("hs-1")).toHaveLength(16);
  });
});

describe("deletion: withdrawal, rejection and erasure stop the pool at once", () => {
  it("withdrawing the authorisation deletes the embeddings and the pool stops serving them", async () => {
    const { record, fp } = await approvedFindingWorld();
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    expect((await buildCrawlPool()).fingerprints[0]).toHaveProperty("sscd");
    expect(await withdrawCrawlConsent(record.id, "user-a")).toMatchObject({ ok: true });
    expect(crawlMemory().embeddings.size).toBe(0);
    expect((await buildCrawlPool()).fingerprints).toEqual([]);
  });

  it("rejecting the fingerprint deletes its embeddings", async () => {
    const { fp } = await approvedFindingWorld();
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    expect(await deleteEmbeddingsForSubmission("hs-1")).toBe(1);
    expect(crawlMemory().embeddings.size).toBe(0);
    const pool = await buildCrawlPool();
    expect(pool.fingerprints[0]).not.toHaveProperty("sscd");
  });

  it("account erasure deletes the case's embeddings and leaves another case's alone", async () => {
    const keep = await store.createCase("user-keep");
    seedFingerprint("hs-keep", keep.id);
    await consent(keep.id, ["hs-keep"]);
    await reportFindings([findingItem({ fingerprintId: poolId("hs-keep"), pageUrl: "https://forum.example.com/thread/keep" })]);
    const [keepRow] = await listCrawlFindings({ caseId: keep.id });
    await reviewCrawlFinding({ findingId: keepRow.id, decision: "approve", reviewerId: "admin-1" });
    await recordEmbeddings([embeddingItem({ fingerprintId: poolId("hs-keep"), pageUrl: "https://forum.example.com/thread/keep" })]);

    const { record, fp } = await approvedFindingWorld();
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);
    eraseCrawlMemoryForCases([record.id]);
    const remaining = [...crawlMemory().embeddings.values()] as MemoryFindingEmbedding[];
    expect(remaining.map((e) => e.caseId)).toEqual([keep.id]);
  });
});

describe("the sources contract carries the SSCD scope flag (ADR 008)", () => {
  it("matched: true only on a source with an accepted finding, and only while SSCD is on", async () => {
    const other = await createCrawlSource({ domain: "other.example.org", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-1");
    if (!other.ok) throw new Error("source");
    const { fp } = await approvedFindingWorld();
    await recordEmbeddings([embeddingItem({ fingerprintId: fp })]);

    const on = await listEnabledCrawlSources();
    expect(on.find((s) => s.id === sourceId)).toMatchObject({ domain: "forum.example.com", matched: true });
    expect(on.find((s) => s.id === other.source.id)).toMatchObject({ domain: "other.example.org", matched: false });

    vi.stubEnv("ENABLE_SSCD", "false");
    const off = await listEnabledCrawlSources();
    expect(off.find((s) => s.id === sourceId)).toEqual({
      id: sourceId, kind: "site", domain: "forum.example.com", pageBudget: 100, delayMs: 1000, origin: "admin", hops: 0, render: "http",
    });
    expect(Object.keys(off[0]).sort()).toEqual(["delayMs", "domain", "hops", "id", "kind", "origin", "pageBudget", "render"]);
  });
});
