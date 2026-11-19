import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Prisma (Node) path of the pool and of final approval, against a mocked
// client. Placeholder data only.

const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    crawlFinding: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    submittedUrl: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    crawlConsent: { findMany: vi.fn() },
    hashSubmission: { findMany: vi.fn(), findUnique: vi.fn() },
    crawlFinding: { findUnique: vi.fn() },
    crawlSource: { findUnique: vi.fn() },
    platform: { findFirst: vi.fn() },
    // WP33: the partner lookup behind the findings gate and the channel
    // alert; no partners in these fixtures, so nothing is gated or sent.
    platformPartner: { findMany: vi.fn() },
    case: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { buildCrawlPool, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";

const PDQ = "ab".repeat(32);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  const live = { id: "consent-1", caseId: "c1", hashSubmissionIds: ["h1", "h2", "h3"], signedAt: new Date("2026-11-01T00:00:00Z") };
  db.crawlConsent.findMany.mockResolvedValue([live]);
  // No platform partners exist in these fixtures: the WP33 findings gate
  // passes and no channel alert is ever sent.
  db.platformPartner.findMany.mockResolvedValue([]);
  db.case.findUnique.mockResolvedValue({ referenceNumber: "ASMITA-2026-00001" });
  // The case-row lock (case-link-lock.ts) finds the case; consent locks find `live`.
  db.tx.$queryRaw.mockImplementation(async (q: string[]) => (q.join("?").includes('FROM "Case"') ? [{ id: "c1" }] : [live]));
});

const sqlOf = (call: unknown[]) => (call[0] as string[]).join("?");
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
    expect(await resolvePoolFingerprint("fp_1")).toEqual({ hashSubmissionId: "h1", caseId: "c1", consentId: "consent-1" });
  });
});

describe("final approval, database path", () => {
  it("claims the finding and creates a CRAWLER SubmittedUrl linked to it", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
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
    // A crawler link stopped by an earlier withdrawal is never reused.
    expect(db.tx.submittedUrl.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ caseId: "c1", crawlConsentWithdrawnAt: null }),
    }));
  });

  it("re-checks the authorisation under a lock inside the approval transaction", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    // A withdrawal committed between the first check and the transaction.
    db.tx.$queryRaw.mockImplementation(async (q: string[]) => (q.join("?").includes('FROM "Case"') ? [{ id: "c1" }] : []));
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "consent_withdrawn" });
    expect(sqlOf(db.tx.$queryRaw.mock.calls[1])).toMatch(/"CrawlConsent".*FOR SHARE/);
    expect(db.tx.crawlFinding.updateMany).not.toHaveBeenCalled();
    expect(db.tx.submittedUrl.create).not.toHaveBeenCalled();
  });

  it("locks the case row first, before the consent lock, the existence check and the insert (F6)", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    const order: string[] = [];
    const base = db.tx.$queryRaw.getMockImplementation()!;
    db.tx.$queryRaw.mockImplementation(async (q: string[], ...v: unknown[]) => (order.push(q.join("?").includes('FROM "Case"') ? "case-lock" : "consent-lock"), base(q, ...v)));
    db.tx.crawlFinding.updateMany.mockImplementation(async () => (order.push("claim"), { count: 1 }));
    db.tx.submittedUrl.findFirst.mockImplementation(async () => (order.push("exists?"), null));
    db.tx.submittedUrl.create.mockImplementation(async () => (order.push("insert"), { id: "url-new" }));
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, createdUrl: true });
    expect(order).toEqual(["case-lock", "consent-lock", "claim", "exists?", "insert"]);
    expect(sqlOf(db.tx.$queryRaw.mock.calls[0])).toBe('SELECT "id" FROM "Case" WHERE "id" = ? FOR NO KEY UPDATE');
    expect(db.tx.$queryRaw.mock.calls[0][1]).toBe("c1");
  });

  it("a case that no longer exists is refused before anything is written", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    db.tx.$queryRaw.mockResolvedValue([]);
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "case_not_found" });
    expect(db.tx.crawlFinding.updateMany).not.toHaveBeenCalled();
    expect(db.tx.submittedUrl.create).not.toHaveBeenCalled();
  });

  it("a legacy finding (no crawlConsentId) first seen before the live authorisation was signed is not covered by it", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: null, distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date("2026-10-01T00:00:00Z"),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "consent_withdrawn" });
  });

  it("refuses a finding recorded under an earlier authorisation, even if the new one lists the fingerprint", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-old", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "consent_withdrawn" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when the survivor's authorisation no longer covers the fingerprint", async () => {
    db.crawlConsent.findMany.mockResolvedValue([]);
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "consent_withdrawn" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("a concurrent review that got there first wins", async () => {
    db.crawlFinding.findUnique.mockResolvedValue({
      id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date(),
      pageUrlEncrypted: encryptField("https://forum.example.com/t"), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
    });
    db.tx.crawlFinding.updateMany.mockResolvedValue({ count: 0 });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "already_reviewed" });
    expect(db.tx.submittedUrl.create).not.toHaveBeenCalled();
  });
});

describe("findings ingest, database path", () => {
  const body = (pageUrl = "https://forum.example.com/t/1") => ({
    runId: "run-1",
    findings: [{ fingerprintId: "fp_1", pageUrl, imageUrl: "https://cdn.example.net/i.jpg", distance: 4, quality: 80, observedAt: "2026-11-16T00:00:00Z", sourceId: "src-1" }],
  });

  beforeEach(() => {
    db.crawlSource.findUnique.mockResolvedValue({ domain: "forum.example.com", enabled: true });
    db.hashSubmission.findUnique.mockResolvedValue({ id: "h1", caseId: "c1", crawlPoolId: "fp_1", hashEncrypted: "x", quality: 70, status: "APPROVED" });
  });

  it("locks the live authorisation in the same transaction as the write and records the consent on the finding", async () => {
    db.tx.$queryRaw.mockResolvedValue([{ id: "consent-1" }]);
    db.tx.crawlFinding.findUnique.mockResolvedValue(null);
    db.tx.crawlFinding.create.mockResolvedValue({ id: "cf-new" });
    expect((await recordCrawlFindings(body(), "key-1")).results).toEqual([{ status: "accepted" }]);
    const sqlText = (db.tx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sqlText).toMatch(/FOR SHARE/);
    expect(db.tx.$queryRaw.mock.calls[0]).toContain("consent-1");
    expect(db.tx.crawlFinding.create.mock.calls[0][0].data).toMatchObject({ caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-1" });
  });

  it("a withdrawal that commits first means the report is refused and nothing is written", async () => {
    db.tx.$queryRaw.mockResolvedValue([]);
    expect((await recordCrawlFindings(body(), "key-1")).results).toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
    expect(db.tx.crawlFinding.create).not.toHaveBeenCalled();
    expect(db.tx.crawlFinding.update).not.toHaveBeenCalled();
  });

  it("a page off the source host is refused before anything is looked up", async () => {
    expect((await recordCrawlFindings(body("https://other.example.org/t/1"), "key-1")).results).toEqual([{ status: "rejected", reason: "page_not_in_source" }]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
