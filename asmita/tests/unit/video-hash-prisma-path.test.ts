import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP17 on the Prisma (Node) path, against a mocked client in the style of
// crawler-prisma-path.test.ts: a VPDQ fingerprint enters the pool as its
// video entry and resolves by pool id (video-fingerprints spec WP20, which
// replaces the pre-WP20 exclusion), and account erasure clears the frame
// list in the same update that removes the pool id. Placeholder hashes only.

const m = vi.hoisted(() => ({
  hashFindMany: vi.fn(),
  hashFindUnique: vi.fn(),
  consentFindMany: vi.fn(),
  caseFindMany: vi.fn(),
  deletionJobFindMany: vi.fn(),
  hashUpdateMany: vi.fn(),
  hashDeleteMany: vi.fn(),
  tx: {} as Record<string, unknown>,
}));

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: {
      findMany: m.hashFindMany,
      findUnique: m.hashFindUnique,
      updateMany: vi.fn(),
    },
    crawlConsent: { findMany: m.consentFindMany },
    case: { findMany: m.caseFindMany },
    deletionJob: { findMany: m.deletionJobFindMany, updateMany: vi.fn() },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(m.tx),
  },
}));

import { buildCrawlPool, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { hardDeleteDueUsers } from "@/lib/case-ops";
import { encryptField } from "@/lib/encryption";

const PDQ_A = "ab".repeat(32);
const PDQ_B = "cd".repeat(32);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  m.hashFindMany.mockReset().mockResolvedValue([]);
  m.hashFindUnique.mockReset().mockResolvedValue(null);
  m.consentFindMany.mockReset().mockResolvedValue([{ id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hs-img", "hs-vid"] }]);
  // The pool keeps fingerprints only while the case is open or inside its
  // re-upload window (watch-and-verify WP24), so the case read sees it open.
  m.caseFindMany.mockReset().mockResolvedValue([{ id: "case-1", status: "OPEN" }]);
  m.deletionJobFindMany.mockReset().mockResolvedValue([]);

  // A Prisma transaction client: counts resolve to zero unless a test says otherwise.
  const empty = () => vi.fn().mockResolvedValue({ count: 0 });
  m.hashUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  m.hashDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  m.tx = {
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ emailHash: "email-hash" }), update: empty() },
    case: { findMany: vi.fn().mockResolvedValue([{ id: "case-1", referenceNumber: "R-1" }]), updateMany: empty() },
    submittedUrl: { findMany: vi.fn().mockResolvedValue([]), deleteMany: empty() },
    notice: { findMany: vi.fn().mockResolvedValue([]), deleteMany: empty() },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    emailDeliveryProof: { deleteMany: empty() },
    hashDispatch: { updateMany: empty() },
    escalation: { deleteMany: empty() },
    urlPortalToken: { deleteMany: empty() },
    crawlFinding: { findMany: vi.fn().mockResolvedValue([]), deleteMany: empty() },
    // WP28 (ADR 008): the erasure deletes the case's SSCD embeddings too.
    findingEmbedding: { deleteMany: empty() },
    crawlConsent: { deleteMany: empty() },
    linkVerification: { deleteMany: empty() },
    hashSubmission: { updateMany: m.hashUpdateMany, deleteMany: m.hashDeleteMany, findMany: vi.fn().mockResolvedValue([]) },
    feedback: { deleteMany: empty() },
    adminAccessLog: { updateMany: empty() },
    deletionJob: { updateMany: empty() },
    sessionToken: { deleteMany: empty() },
    otpToken: { deleteMany: empty() },
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("crawler pool, Prisma path", () => {
  it("lists a VPDQ fingerprint as its video entry and asks for the frame columns", async () => {
    m.hashFindMany.mockResolvedValue([
      { id: "hs-img", caseId: "case-1", crawlPoolId: "fp_1", hashEncrypted: encryptField(PDQ_A), quality: 70, status: "APPROVED", algorithm: "PDQ", videoFramesEncrypted: null },
      {
        id: "hs-vid", caseId: "case-1", crawlPoolId: "fp_2", hashEncrypted: encryptField(PDQ_B), quality: 90, status: "APPROVED", algorithm: "VPDQ",
        videoFramesEncrypted: encryptField(JSON.stringify([{ hash: PDQ_A, quality: 90, t: 0 }, { hash: PDQ_B, quality: 80, t: 1 }])),
      },
    ]);

    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([
      { id: "fp_1", pdq: PDQ_A, quality: 70 },
      { id: "fp_2", kind: "video", frames: [PDQ_A, PDQ_B] },
    ]);
    expect(m.hashFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ algorithm: true, videoFramesEncrypted: true }),
    }));
  });

  it("resolves a pool id that belongs to a VPDQ fingerprint", async () => {
    m.hashFindUnique.mockResolvedValue({
      id: "hs-vid", caseId: "case-1", crawlPoolId: "fp_2", hashEncrypted: encryptField(PDQ_B), quality: 90, status: "APPROVED", algorithm: "VPDQ",
      videoFramesEncrypted: null,
    });
    expect(await resolvePoolFingerprint("fp_2")).toMatchObject({ hashSubmissionId: "hs-vid", caseId: "case-1" });
  });
});

describe("account erasure, Prisma path", () => {
  it("clears the video frame list in the same update that removes the pool id", async () => {
    m.deletionJobFindMany.mockResolvedValue([{ id: "job-1", case: { userId: "user-1" } }]);

    const deleted = await hardDeleteDueUsers(new Date("2026-11-19T00:00:00Z"));
    expect(deleted).toEqual(["user-1"]);
    expect(m.hashUpdateMany).toHaveBeenCalledWith({
      where: { caseId: { in: ["case-1"] } },
      data: { crawlPoolId: null, videoFramesEncrypted: null },
    });
    // The row itself is kept.
    expect(m.hashDeleteMany).not.toHaveBeenCalled();
  });
});
