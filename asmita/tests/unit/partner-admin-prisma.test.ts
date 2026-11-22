import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP30 on the Prisma path (DATABASE_URL set, worker driver off): approving
// runs in one transaction, copies the application's email ciphertext
// as-is, and a unique violation answers partner_exists. Mocked client, no
// real database. Synthetic data only.

vi.mock("@/lib/db", () => ({
  db: {
    platformPartnerApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
    platformPartner: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    platformPartnerKey: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("kysely path must not run here"); } }));

import { db } from "@/lib/db";
import {
  actOnPartnerApplication,
  getPlatformPartner,
  issuePlatformPartnerKey,
  listPlatformPartners,
  recordPartnerCrawlPermission,
  revokePlatformPartnerKey,
  setPlatformPartnerStatus,
  updatePlatformPartner,
} from "@/lib/partner-admin";
import { revokePartnerKey, verifyPartnerKey } from "@/lib/partner-auth";
import { encryptField } from "@/lib/encryption";
import { inMemoryAuditLog } from "@/lib/audit";

const ACTOR = "admin-1";

const mocked = db as unknown as {
  platformPartnerApplication: { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  platformPartner: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  platformPartnerKey: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    platformName: "ExampleTube",
    websiteDomain: "example-tube.example",
    contactEmail: "CIPHERTEXT-OF-CONTACT",
    status: "NEW",
    ...overrides,
  };
}

function partnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    name: "ExampleTube",
    primaryDomain: "example-tube.example",
    extraDomains: ["cdn.example-tube.example"],
    status: "ACTIVE",
    channelEmailEncrypted: encryptField("notices@example.test"),
    createdFromApplicationId: "app-1",
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date("2026-11-19T08:00:00.000Z"),
    updatedAt: new Date("2026-11-19T08:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.mocked(mocked.$transaction).mockImplementation(async (fn: () => Promise<unknown>) => fn());
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("actOnPartnerApplication, Prisma path", () => {
  it("approving creates the partner and flips the application inside one transaction", async () => {
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(applicationRow() as never);
    // The domain-ownership check reads all partners first: none own this domain.
    mocked.platformPartner.findMany.mockResolvedValue([] as never);
    mocked.platformPartner.create.mockResolvedValue({ id: "p-1" } as never);
    mocked.platformPartnerApplication.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result.ok).toBe(true);
    expect((result as { partnerId: string }).partnerId).toEqual(expect.any(String));

    expect(mocked.$transaction).toHaveBeenCalledOnce();
    const created = vi.mocked(mocked.platformPartner.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(created).toMatchObject({
      id: (result as { partnerId: string }).partnerId,
      name: "ExampleTube",
      primaryDomain: "example-tube.example",
      extraDomains: [],
      status: "ACTIVE",
      // The application's ciphertext is copied without a decrypt/re-encrypt round trip.
      channelEmailEncrypted: "CIPHERTEXT-OF-CONTACT",
      createdFromApplicationId: "app-1",
    });
    expect(mocked.platformPartnerApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app-1", status: { in: ["NEW", "CONTACTED"] } },
      data: { status: "ONBOARDED" },
    });
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_approved");
    expect(inMemoryAuditLog[0].actorId).toBe(ACTOR);
  });

  it("a unique violation answers partner_exists and the application is not flipped", async () => {
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(applicationRow() as never);
    mocked.platformPartner.findMany.mockResolvedValue([] as never);
    mocked.platformPartner.create.mockRejectedValue({ code: "P2002" } as never);

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "partner_exists" });
    // The partner insert runs first inside the transaction.
    expect(mocked.platformPartnerApplication.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a domain another partner owns as an extra domain, before any write", async () => {
    // Rule 1: one domain, one partner. partnerRow() holds
    // cdn.example-tube.example as an extra domain, so approving an
    // application for that domain must not create a second owner.
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(
      applicationRow({ websiteDomain: "cdn.example-tube.example" }) as never,
    );
    mocked.platformPartner.findMany.mockResolvedValue([partnerRow()] as never);

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "partner_exists" });
    expect(mocked.platformPartner.create).not.toHaveBeenCalled();
    expect(mocked.platformPartnerApplication.updateMany).not.toHaveBeenCalled();
  });

  it("a lost status race answers invalid_status", async () => {
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(applicationRow() as never);
    mocked.platformPartner.findMany.mockResolvedValue([] as never);
    mocked.platformPartner.create.mockResolvedValue({ id: "p-1" } as never);
    mocked.platformPartnerApplication.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "invalid_status" });
  });

  it("marks contacted and declines with guarded writes", async () => {
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(applicationRow() as never);
    mocked.platformPartnerApplication.updateMany.mockResolvedValue({ count: 1 } as never);
    expect(await actOnPartnerApplication({ applicationId: "app-1", action: "contacted" }, ACTOR)).toEqual({
      ok: true,
      status: "CONTACTED",
    });
    expect(mocked.platformPartnerApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app-1", status: { in: ["NEW"] } },
      data: { status: "CONTACTED" },
    });

    mocked.platformPartnerApplication.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await actOnPartnerApplication({ applicationId: "app-1", action: "contacted" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_status",
    });
    mocked.platformPartnerApplication.findUnique.mockResolvedValue(null as never);
    expect(await actOnPartnerApplication({ applicationId: "missing", action: "contacted" }, ACTOR)).toEqual({
      ok: false,
      error: "application_not_found",
    });
  });
});

describe("partner reads and writes, Prisma path", () => {
  it("maps rows to the console view with the channel email decrypted", async () => {
    mocked.platformPartner.findMany.mockResolvedValue([partnerRow()] as never);
    const views = await listPlatformPartners();
    expect(views).toEqual([
      expect.objectContaining({ id: "p-1", status: "ACTIVE", channelEmail: "notices@example.test" }),
    ]);

    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow() as never);
    expect(await getPlatformPartner("p-1")).toMatchObject({ id: "p-1", channelEmail: "notices@example.test" });
    mocked.platformPartner.findUnique.mockResolvedValue(null as never);
    expect(await getPlatformPartner("missing")).toBeNull();
  });

  it("updates domains through one update, refusing a domain another partner owns", async () => {
    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow() as never);
    mocked.platformPartner.findMany.mockResolvedValue([
      partnerRow({ id: "p-2", primaryDomain: "taken.example", extraDomains: [] }),
    ] as never);

    const refused = await updatePlatformPartner({ partnerId: "p-1", primaryDomain: "taken.example" }, ACTOR);
    expect(refused).toEqual({ ok: false, error: "domain_in_use" });
    expect(mocked.platformPartner.update).not.toHaveBeenCalled();

    mocked.platformPartner.findMany.mockResolvedValue([] as never);
    mocked.platformPartner.update.mockResolvedValue(partnerRow({ primaryDomain: "new.example" }) as never);
    const saved = await updatePlatformPartner(
      { partnerId: "p-1", primaryDomain: "new.example", extraDomains: ["cdn.example.test"], channelEmail: "fresh@example.test" },
      ACTOR,
    );
    expect(saved.ok).toBe(true);
    const data = vi.mocked(mocked.platformPartner.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ primaryDomain: "new.example", extraDomains: ["cdn.example.test"] });
    expect(typeof data.channelEmailEncrypted).toBe("string");
    expect(data.channelEmailEncrypted).not.toBe("fresh@example.test");
    // Prisma maintains updatedAt itself.
    expect(data.updatedAt).toBeUndefined();
  });

  it("suspends and reactivates, refusing a no-op", async () => {
    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow() as never);
    const suspended = await setPlatformPartnerStatus({ partnerId: "p-1", status: "SUSPENDED" }, ACTOR);
    expect(suspended.ok).toBe(true);
    expect(mocked.platformPartner.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { status: "SUSPENDED" },
    });

    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow({ status: "SUSPENDED" }) as never);
    expect(await setPlatformPartnerStatus({ partnerId: "p-1", status: "SUSPENDED" }, ACTOR)).toEqual({
      ok: false,
      error: "no_change",
    });
    expect(mocked.platformPartner.update).toHaveBeenCalledTimes(1);
  });

  it("records the written crawl permission", async () => {
    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow() as never);
    mocked.platformPartner.update.mockResolvedValue(
      partnerRow({ crawlPermissionNote: "Email from their DPO, on file", crawlPermissionRecordedById: ACTOR }) as never,
    );
    const result = await recordPartnerCrawlPermission(
      { partnerId: "p-1", date: "2026-11-18", note: "Email from their DPO, on file" },
      ACTOR,
      new Date("2026-11-19T12:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    expect(mocked.platformPartner.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: expect.objectContaining({
        crawlPermissionRecordedAt: new Date("2026-11-18T00:00:00.000Z"),
        crawlPermissionRecordedById: ACTOR,
        crawlPermissionNote: "Email from their DPO, on file",
      }),
    });

    expect(
      await recordPartnerCrawlPermission({ partnerId: "p-1", date: "2999-01-01", note: "Not yet" }, ACTOR),
    ).toEqual({ ok: false, error: "future_date" });
    expect(mocked.platformPartner.update).toHaveBeenCalledTimes(1);
  });
});

describe("partner keys, Prisma path", () => {
  it("issues a key with the hash only, and revokes with a guarded write", async () => {
    mocked.platformPartner.findUnique.mockResolvedValue(partnerRow() as never);
    mocked.platformPartnerKey.create.mockResolvedValue({ id: "k-1" } as never);

    const issued = await issuePlatformPartnerKey({ partnerId: "p-1", label: "Integration key" }, ACTOR);
    expect(issued.ok).toBe(true);
    const key = (issued as { key: string }).key;
    expect(key).toMatch(/^ppk_/);
    expect(mocked.platformPartnerKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ partnerId: "p-1", keyHash: expect.any(String), label: "Integration key" }),
      select: { id: true },
    });
    const data = vi.mocked(mocked.platformPartnerKey.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.keyHash).not.toBe(key);
    expect(JSON.stringify(data)).not.toContain(key);
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_key_issued");

    // Revocation is a guarded updateMany on the id and revokedAt: null.
    mocked.platformPartnerKey.findMany.mockResolvedValue([
      { id: "k-1", label: "Integration key", createdAt: new Date(), revokedAt: null, lastUsedAt: null },
    ] as never);
    mocked.platformPartnerKey.updateMany.mockResolvedValue({ count: 1 } as never);
    expect(await revokePlatformPartnerKey({ partnerId: "p-1", keyId: "k-1" }, ACTOR)).toEqual({ ok: true });
    expect(mocked.platformPartnerKey.updateMany).toHaveBeenCalledWith({
      where: { id: "k-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    mocked.platformPartnerKey.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await revokePartnerKey("k-1")).toBe(false);

    // A key of another partner is not in this partner's list.
    mocked.platformPartnerKey.findMany.mockResolvedValue([] as never);
    expect(await revokePlatformPartnerKey({ partnerId: "p-1", keyId: "k-9" }, ACTOR)).toEqual({
      ok: false,
      error: "key_not_found",
    });
  });

  it("verifies a key by hash lookup, then the partner's status, and touches lastUsedAt", async () => {
    const key = "ppk_" + "d".repeat(48);
    const { hashPartnerKey } = await import("@/lib/partner-auth");
    mocked.platformPartnerKey.findUnique.mockResolvedValue({
      id: "k-1",
      partnerId: "p-1",
      keyHash: hashPartnerKey(key),
      revokedAt: null,
    } as never);
    mocked.platformPartner.findUnique.mockResolvedValue({ status: "ACTIVE" } as never);

    expect(await verifyPartnerKey(key)).toEqual({ ok: true, keyId: "k-1", partnerId: "p-1", scopes: ["feed", "outcomes"] });
    expect(mocked.platformPartnerKey.update).toHaveBeenCalledWith({
      where: { id: "k-1" },
      data: { lastUsedAt: expect.any(Date) },
    });

    mocked.platformPartnerKey.findUnique.mockResolvedValue({
      id: "k-1",
      partnerId: "p-1",
      keyHash: hashPartnerKey(key),
      revokedAt: new Date(),
    } as never);
    expect(await verifyPartnerKey(key)).toEqual({ ok: false, reason: "revoked" });

    mocked.platformPartnerKey.findUnique.mockResolvedValue({
      id: "k-1",
      partnerId: "p-1",
      keyHash: hashPartnerKey(key),
      revokedAt: null,
    } as never);
    mocked.platformPartner.findUnique.mockResolvedValue({ status: "SUSPENDED" } as never);
    expect(await verifyPartnerKey(key)).toEqual({ ok: false, reason: "suspended" });

    mocked.platformPartnerKey.findUnique.mockResolvedValue(null as never);
    expect(await verifyPartnerKey(key)).toEqual({ ok: false, reason: "invalid" });
  });
});
