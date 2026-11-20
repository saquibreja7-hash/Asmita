import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP28 (ADR 008) on the Prisma (Node) path, against a mocked client in the
// style of the other crawler tests: the live authorisation is locked FOR
// SHARE inside the transaction before the insert, the confirmed finding is
// re-checked there, the insert loses the race politely on P2002
// (embedding_exists), the pool read selects the pool columns newest first,
// the deletions are single statements, and a fingerprint's rejection deletes
// its embeddings best-effort. Placeholder data only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    $queryRaw: fn(),
    crawlFinding: { findUnique: fn() },
    findingEmbedding: { findUnique: fn(), create: fn() },
    // On the merged tree the hash review runs inside the transaction (WP32:
    // the partner feed follows the decision there), so the transaction
    // client carries the hash submission too. No partner fixtures here:
    // the feed sync's read returns nothing and no event is ever written.
    hashSubmission: { findMany: fn(), update: fn() },
  };
  return {
    tx,
    crawlConsent: { findMany: fn() },
    case: { findMany: fn() },
    hashSubmission: { findUnique: fn(), findFirst: fn(), update: fn() },
    crawlFinding: { findMany: fn() },
    findingEmbedding: { findMany: fn(), deleteMany: fn(), create: fn() },
    $queryRaw: fn(),
    $transaction: fn(),
  };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { encryptField } from "@/lib/encryption";
import { findingDigest } from "@/lib/crawl-findings";
import { reviewHashSubmission } from "@/lib/hash-submission";
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

function body(items: unknown[]): CrawlEmbeddingsBody {
  return { runId: "run-1", embeddings: items } as CrawlEmbeddingsBody;
}

const item = (overrides: Record<string, unknown> = {}) =>
  ({ fingerprintId: "fp_1", pageUrl: PAGE, imageUrl: IMAGE, model: "sscd_disc_mixup", version: "onnx-1", vector: VECTOR, ...overrides });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_SSCD", "true");
  db.crawlConsent.findMany.mockResolvedValue([{ id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-1"], signedAt: new Date("2026-11-01T00:00:00Z") }]);
  // The pool keeps fingerprints only while the case is open or inside its
  // re-upload window (watch-and-verify WP24), so the id resolves while the
  // fixture's case is open.
  db.case.findMany.mockResolvedValue([{ id: "case-1", status: "OPEN" }]);
  db.hashSubmission.findUnique.mockResolvedValue({ id: "hs-1", caseId: "case-1", crawlPoolId: "fp_1", hashEncrypted: "x", quality: 80, status: "APPROVED", algorithm: "PDQ" });
  db.tx.$queryRaw.mockResolvedValue([{ id: "consent-1" }]);
  db.tx.crawlFinding.findUnique.mockResolvedValue({ id: "cf-1", hashSubmissionId: "hs-1", reviewStatus: "APPROVED" });
  db.tx.findingEmbedding.findUnique.mockResolvedValue(null);
  db.tx.findingEmbedding.create.mockResolvedValue({});
  db.tx.hashSubmission.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: (client: typeof db.tx) => unknown) => fn(db.tx));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("recordCrawlEmbeddings, Prisma path", () => {
  it("locks the live authorisation FOR SHARE inside the transaction, then re-checks the finding and inserts", async () => {
    const { results } = await recordCrawlEmbeddings(body([item()]), NOW);
    expect(results).toEqual([{ status: "stored" }]);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const sql = (db.tx.$queryRaw.mock.calls[0]![0] as string[]).join("?");
    expect(sql).toContain('"CrawlConsent"');
    expect(sql).toContain("FOR SHARE");
    expect(db.tx.$queryRaw.mock.calls[0]).toContain("consent-1");

    expect(db.tx.crawlFinding.findUnique).toHaveBeenCalledWith({
      where: { caseId_urlDigest: { caseId: "case-1", urlDigest: DIGEST } },
      select: { id: true, hashSubmissionId: true, reviewStatus: true },
    });
    expect(db.tx.findingEmbedding.findUnique).toHaveBeenCalledWith({ where: { findingId: "cf-1" }, select: { id: true } });
    expect(db.tx.findingEmbedding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        findingId: "cf-1", hashSubmissionId: "hs-1", caseId: "case-1",
        model: "sscd_disc_mixup", version: "onnx-1", createdAt: NOW,
      }),
    });
    const stored = db.tx.findingEmbedding.create.mock.calls[0]![0].data as { vectorEncrypted: string };
    expect(stored.vectorEncrypted).not.toContain("0.1");
    expect(stored.vectorEncrypted).not.toContain("[");
  });

  it("refuses a withdrawn authorisation, an unconfirmed finding and another fingerprint's finding, writing nothing", async () => {
    db.tx.$queryRaw.mockResolvedValue([]);
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
    expect(db.tx.findingEmbedding.create).not.toHaveBeenCalled();

    db.tx.$queryRaw.mockResolvedValue([{ id: "consent-1" }]);
    db.tx.crawlFinding.findUnique.mockResolvedValue({ id: "cf-1", hashSubmissionId: "hs-1", reviewStatus: "CANDIDATE" });
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "rejected", reason: "finding_not_confirmed" }]);
    db.tx.crawlFinding.findUnique.mockResolvedValue({ id: "cf-1", hashSubmissionId: "hs-other", reviewStatus: "APPROVED" });
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "rejected", reason: "finding_not_confirmed" }]);
    expect(db.tx.findingEmbedding.create).not.toHaveBeenCalled();
  });

  it("answers embedding_exists when the row is there, and when a concurrent insert wins with P2002", async () => {
    db.tx.findingEmbedding.findUnique.mockResolvedValue({ id: "emb-1" });
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "stored", reason: "embedding_exists" }]);
    expect(db.tx.findingEmbedding.create).not.toHaveBeenCalled();

    db.tx.findingEmbedding.findUnique.mockResolvedValue(null);
    db.tx.findingEmbedding.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect((await recordCrawlEmbeddings(body([item()]), NOW)).results).toEqual([{ status: "stored", reason: "embedding_exists" }]);
  });

  it("refuses a model or version the deployment is not configured for", async () => {
    const { results } = await recordCrawlEmbeddings(body([item({ model: "sscd_other" }), item({ version: "onnx-2" })]), NOW);
    expect(results).toEqual([
      { status: "rejected", reason: "model_mismatch" },
      { status: "rejected", reason: "model_mismatch" },
    ]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("poolEmbeddingsForPoolIds, Prisma path", () => {
  it("reads the pool columns newest first and decrypts the vectors, skipping other models", async () => {
    db.findingEmbedding.findMany.mockResolvedValue([
      { hashSubmissionId: "hs-1", model: "sscd_disc_mixup", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify([0.4, 0.5])), createdAt: new Date("2026-11-19T09:00:00Z") },
      { hashSubmissionId: "hs-1", model: "sscd_disc_mixup", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify(VECTOR)), createdAt: new Date("2026-11-19T08:00:00Z") },
      { hashSubmissionId: "hs-1", model: "sscd_old", version: "onnx-1", vectorEncrypted: encryptField(JSON.stringify([0.9])), createdAt: new Date("2026-11-19T10:00:00Z") },
    ]);
    const grouped = await poolEmbeddingsForPoolIds(["hs-1"]);
    expect(db.findingEmbedding.findMany).toHaveBeenCalledWith({
      where: { hashSubmissionId: { in: ["hs-1"] } },
      select: { hashSubmissionId: true, model: true, version: true, vectorEncrypted: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    expect(grouped.get("hs-1")).toEqual([[0.4, 0.5], VECTOR]);
  });
});

describe("the deletion helpers, Prisma path", () => {
  it("deletes by case and by fingerprint, each in one statement", async () => {
    db.findingEmbedding.deleteMany.mockResolvedValue({ count: 3 });
    expect(await deleteEmbeddingsForCase(["case-1", "case-2"])).toBe(3);
    expect(db.findingEmbedding.deleteMany).toHaveBeenCalledWith({ where: { caseId: { in: ["case-1", "case-2"] } } });

    db.findingEmbedding.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEmbeddingsForSubmission("hs-1")).toBe(1);
    expect(db.findingEmbedding.deleteMany).toHaveBeenCalledWith({ where: { hashSubmissionId: "hs-1" } });
  });
});

describe("a fingerprint's rejection deletes its embeddings, best-effort (Prisma path)", () => {
  it("deletes them after the status change, and never fails the rejection when the cleanup errors", async () => {
    const submissionRow = { id: "hs-1", caseId: "case-1", algorithm: "PDQ", hashDigest: "d", quality: 80, status: "PENDING_REVIEW", flaggedForReview: false, flagReason: null, submittedAt: new Date("2026-11-01T00:00:00Z"), videoFrameCount: null, videoDurationSec: null };
    db.hashSubmission.findUnique.mockResolvedValue(submissionRow);
    db.tx.hashSubmission.update.mockResolvedValue({ ...submissionRow, status: "REJECTED" });
    db.findingEmbedding.deleteMany.mockResolvedValue({ count: 2 });

    const submission = await reviewHashSubmission({ hashSubmissionId: "hs-1", decision: "reject", reviewerId: "admin-1" });
    expect(submission.status).toBe("REJECTED");
    expect(db.findingEmbedding.deleteMany).toHaveBeenCalledWith({ where: { hashSubmissionId: "hs-1" } });

    // The rejection is committed; a failed cleanup is logged, never thrown.
    db.findingEmbedding.deleteMany.mockRejectedValue(new Error("cleanup down"));
    const stillRejected = await reviewHashSubmission({ hashSubmissionId: "hs-1", decision: "reject", reviewerId: "admin-1" });
    expect(stillRejected.status).toBe("REJECTED");

    // An approval cleans nothing.
    db.findingEmbedding.deleteMany.mockClear();
    db.hashSubmission.findUnique.mockResolvedValue({ ...submissionRow, id: "hs-2", hashDigest: "d2" });
    db.tx.hashSubmission.update.mockResolvedValue({ ...submissionRow, id: "hs-2", status: "APPROVED" });
    await reviewHashSubmission({ hashSubmissionId: "hs-2", decision: "approve", reviewerId: "admin-1" });
    expect(db.findingEmbedding.deleteMany).not.toHaveBeenCalled();
  });
});
