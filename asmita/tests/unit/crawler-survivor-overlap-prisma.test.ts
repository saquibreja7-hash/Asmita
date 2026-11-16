import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// R1 and R2 on the Prisma path, against a mocked client. Placeholder data only.

const db = vi.hoisted(() => {
  const self = {
    user: { update: vi.fn() },
    case: { findMany: vi.fn() },
    deletionJob: { createMany: vi.fn() },
    crawlConsent: { updateMany: vi.fn() },
    hashSubmission: { updateMany: vi.fn() },
    crawlFinding: { deleteMany: vi.fn() },
    platform: { findFirst: vi.fn() },
    submittedUrl: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  self.$transaction.mockImplementation(async (fn: (tx: typeof self) => unknown) => fn(self));
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { addUrlsToCase, deactivateUser } from "@/lib/case-ops";
import { inMemoryAuditLog } from "@/lib/audit";

const PAGE = "https://www.instagram.com/p/overlap-prisma-placeholder";

function crawlerRow(over: Record<string, unknown> = {}) {
  return {
    id: "url-c", caseId: "c1", urlEncrypted: "enc", urlHash: "h", domain: "instagram.com", platformId: null, status: "NOTICE_QUEUED",
    submittedAt: new Date(), flaggedForReview: false, flagReason: null, signedNoticePdf: null, source: "CRAWLER",
    crawlFindingId: "cf-1", crawlConsentWithdrawnAt: new Date(), platformFiledAt: null, ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  db.platform.findFirst.mockResolvedValue({ id: "platform-ig" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("R1, database path", () => {
  it("a deletion request withdraws the crawl authorisation on each of her cases", async () => {
    db.case.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    db.crawlConsent.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.hashSubmission.updateMany.mockResolvedValue({ count: 1 });
    db.submittedUrl.updateMany.mockResolvedValue({ count: 2 });
    db.crawlFinding.deleteMany.mockResolvedValue({ count: 3 });

    await deactivateUser("user-1");

    expect(db.crawlConsent.updateMany).toHaveBeenCalledWith({ where: { caseId: "c1", withdrawnAt: null }, data: { withdrawnAt: expect.any(Date) } });
    expect(db.crawlConsent.updateMany).toHaveBeenCalledWith({ where: { caseId: "c2", withdrawnAt: null }, data: { withdrawnAt: expect.any(Date) } });
    expect(db.hashSubmission.updateMany).toHaveBeenCalledWith({ where: { caseId: "c1", crawlPoolId: { not: null } }, data: { crawlPoolId: null } });
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ caseId: "c1", source: "CRAWLER", notices: { none: {} } }) }));
    expect(db.crawlFinding.deleteMany).toHaveBeenCalledWith({ where: { caseId: "c1", reviewStatus: "CANDIDATE" } });
    const audit = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN");
    expect(audit).toEqual([expect.objectContaining({ entityId: "c1", data: expect.objectContaining({ reason: "account_deletion", candidatesDeleted: 3 }) })]);
  });
});

describe("R2, database path", () => {
  it("converts an unsent crawler link to her own, conditionally on nothing sent or claimed", async () => {
    db.submittedUrl.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(crawlerRow());
    db.submittedUrl.updateMany.mockResolvedValue({ count: 1 });
    db.submittedUrl.findUnique.mockResolvedValue(crawlerRow({ source: "SURVIVOR", crawlFindingId: null, crawlConsentWithdrawnAt: null, platformId: "platform-ig" }));
    const [result] = await addUrlsToCase("c1", [PAGE]);
    expect(result).toMatchObject({ ok: true, duplicate: false, url: { id: "url-c", source: "SURVIVOR", status: "NOTICE_QUEUED" } });
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith({
      where: { id: "url-c", source: "CRAWLER", representativeNoticePdf: null, notices: { none: {} } },
      data: expect.objectContaining({ source: "SURVIVOR", crawlFindingId: null, crawlConsentWithdrawnAt: null, status: "NOTICE_QUEUED", platformId: "platform-ig" }),
    });
    expect(db.submittedUrl.create).not.toHaveBeenCalled();
  });

  it("keeps a crawler link whose representative notice was sent or claimed, and answers duplicate", async () => {
    db.submittedUrl.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(crawlerRow({ status: "NOTICE_SENT", crawlConsentWithdrawnAt: null }));
    db.submittedUrl.updateMany.mockResolvedValue({ count: 0 });
    db.submittedUrl.findUnique.mockResolvedValue(crawlerRow({ status: "NOTICE_SENT", crawlConsentWithdrawnAt: null }));
    const [result] = await addUrlsToCase("c1", [PAGE]);
    expect(result).toMatchObject({ ok: true, duplicate: true, url: { source: "CRAWLER", status: "NOTICE_SENT" } });
    expect(db.submittedUrl.create).not.toHaveBeenCalled();
  });
});
