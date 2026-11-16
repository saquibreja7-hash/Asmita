import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Prisma (Node) path of the pool and of final approval, against a mocked
// client. Placeholder data only.

const db = vi.hoisted(() => {
  const tx = {
    crawlFinding: { updateMany: vi.fn() },
    submittedUrl: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    crawlConsent: { findMany: vi.fn() },
    hashSubmission: { findMany: vi.fn(), findUnique: vi.fn() },
    crawlFinding: { findUnique: vi.fn() },
    platform: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { buildCrawlPool, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { reviewCrawlFinding } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";

const PDQ = "ab".repeat(32);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  db.crawlConsent.findMany.mockResolvedValue([{ caseId: "c1", hashSubmissionIds: ["h1", "h2", "h3"] }]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("crawl pool, database path", () => {
  it("keeps only approved or dispatched fingerprints with a pool id under a live consent", async () => {
    db.hashSubmission.findMany.mockResolvedValue([
      { id: "h1", caseId: "c1", crawlPoolId: "fp_1", hashEncrypted: encryptField(PDQ.toUpperCase()), quality: 70, status: "APPROVED" },
      { id: "h2", caseId: "c1", crawlPoolId: "fp_2", hashEncrypted: encryptField(PDQ), quality: 70, status: "REJECTED" },
      { id: "h3", caseId: "c1", crawlPoolId: null, hashEncrypted: encryptField(PDQ), quality: 70, status: "DISPATCHED" },
    ]);
    const pool = await buildCrawlPool(new Date("2026-11-16T00:00:00Z"));
    expect(db.crawlConsent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { withdrawnAt: null } }));
    expect(pool).toMatchObject({ threshold: 31, generatedAt: "2026-11-16T00:00:00.000Z", fingerprints: [{ id: "fp_1", pdq: PDQ, quality: 70 }] });
  });

  it("resolves a pool id only while its case's live consent lists it", async () => {
    db.hashSubmission.findUnique.mockResolvedValue({ id: "h9", caseId: "c1", crawlPoolId: "fp_9", hashEncrypted: "x", quality: 70, status: "APPROVED" });
    expect(await resolvePoolFingerprint("fp_9")).toBeNull();
    db.hashSubmission.findUnique.mockResolvedValue({ id: "h1", caseId: "c1", crawlPoolId: "fp_1", hashEncrypted: "x", quality: 70, status: "APPROVED" });
    expect(await resolvePoolFingerprint("fp_1")).toEqual({ hashSubmissionId: "h1", caseId: "c1" });
  });
});

describe("final approval, database path", () => {
  it("claims the finding and creates a CRAWLER SubmittedUrl linked to it", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null,
      pageUrlEncrypted: encryptField("https://www.instagram.com/p/placeholder"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    db.platform.findFirst.mockResolvedValue({ id: "platform-ig" });
    db.tx.crawlFinding.updateMany.mockResolvedValue({ count: 1 });
    db.tx.submittedUrl.findFirst.mockResolvedValue(null);
    db.tx.submittedUrl.create.mockResolvedValue({ id: "url-new" });

    const outcome = await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toEqual({ ok: true, status: "APPROVED", submittedUrlId: "url-new", createdUrl: true });
    expect(db.tx.crawlFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "cf1", reviewStatus: "CANDIDATE", reviewedById: null },
      data: expect.objectContaining({ reviewStatus: "APPROVED", reviewedById: "admin-1" }),
    });
    const data = db.tx.submittedUrl.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ caseId: "c1", domain: "instagram.com", platformId: "platform-ig", status: "NOTICE_QUEUED", source: "CRAWLER", crawlFindingId: "cf1" });
    // Nothing is signed or sent here: dispatch refuses a link without a signed notice.
    expect(data).not.toHaveProperty("signedNoticePdf");
    expect(data.urlEncrypted).not.toContain("instagram");
  });

  it("refuses when the survivor's authorisation no longer covers the fingerprint", async () => {
    db.crawlConsent.findMany.mockResolvedValue([]);
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null,
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "consent_withdrawn" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("a concurrent review that got there first wins", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null,
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    db.tx.crawlFinding.updateMany.mockResolvedValue({ count: 0 });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "already_reviewed" });
    expect(db.tx.submittedUrl.create).not.toHaveBeenCalled();
  });
});
