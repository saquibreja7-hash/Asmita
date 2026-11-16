import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false }));
vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (tx: unknown) => unknown) => fn({
    submittedUrl: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    urlPortalToken: { deleteMany: mocks.deleteMany },
  }) },
}));

import { isUrlExpired, purgeExpiredUrls, URL_RETENTION_MS } from "@/lib/url-retention";

describe("reported URL retention", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expires at 30 days from submission", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(isUrlExpired(new Date(now.getTime() - URL_RETENTION_MS), now)).toBe(true);
    expect(isUrlExpired(new Date(now.getTime() - URL_RETENTION_MS + 1), now)).toBe(false);
  });

  it("removes expired URL material and portal tokens without deleting case records", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    mocks.findMany.mockResolvedValue([{ id: "expired" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    expect(await purgeExpiredUrls(now)).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { submittedAt: { lte: new Date(now.getTime() - URL_RETENTION_MS + 60 * 60 * 1000) }, urlEncrypted: { not: "" } },
    }));
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { urlId: { in: ["expired"] } } });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        urlEncrypted: "", urlHash: "", signedNoticePdf: null, signedHashSubmissionIds: [],
        signedTemplateId: null, signedTemplateDigest: null,
      },
    }));
  });

  it("does nothing when no URLs are due", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await purgeExpiredUrls()).toBe(0);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
