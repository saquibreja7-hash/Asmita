import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP32 (partner programme part 2): GET /api/partner/v1/fingerprints over the
// memory store — WP30's partner-key authentication end to end (a missing,
// wrong, revoked key is refused; a suspended partner's key answers 403), the
// strict cursor and limit parameters, cursor pagination, and that every
// ACTIVE partner reads the same feed. Synthetic data only.

vi.mock("@/lib/encryption", () => ({
  encryptField: (value: string) => `enc:${value.length}`,
  decryptField: (value: string) => value,
}));

import { GET as getFeed } from "@/app/api/partner/v1/fingerprints/route";
import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { hashPartnerKey, issuePartnerKey } from "@/lib/partner-auth";
import { PARTNER_FEED_SETTLE_SECONDS, syncPartnerFeedFingerprints } from "@/lib/partner-feed";
import { recordPartnerShareConsent, withdrawPartnerShareConsent } from "@/lib/partner-share-consent";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { cases, type CaseRecord } from "@/lib/store";

const HEX_A = "ab".repeat(32);

/**
 * The feed holds back events younger than PARTNER_FEED_SETTLE_SECONDS; these
 * tests poll right after writing, so they age every memory event past the
 * window first (all by the same amount, order unchanged).
 */
function settleFeed() {
  for (const event of partnerMemory().feedEvents) {
    event.createdAt = new Date(new Date(event.createdAt).getTime() - (PARTNER_FEED_SETTLE_SECONDS + 1) * 1000);
  }
}

function seedPartner(id: string, overrides: Record<string, unknown> = {}) {
  partnerMemory().partners.set(id, {
    id,
    name: `ExamplePartner-${id}`,
    primaryDomain: `${id}.example`,
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: null,
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
  return id;
}

async function seedKey(partnerId: string, label = "test key") {
  const issued = await issuePartnerKey(partnerId, label);
  return issued.key;
}

function request(key?: string, query = "") {
  return new Request(`https://asmita.test/api/partner/v1/fingerprints${query}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
}

async function seedSharedFingerprint(caseId = "case-1") {
  const record: CaseRecord = { id: caseId, referenceNumber: `ASMITA-2026-${caseId.slice(-5)}`, userId: "user-1", createdAt: "", status: "OPEN", urls: [] };
  cases.set(caseId, record);
  crawlMemory().fingerprints.set("hash-1", {
    id: "hash-1", caseId, hashEncrypted: HEX_A, quality: 100, status: "APPROVED", crawlPoolId: null,
  });
  await recordPartnerShareConsent({
    caseId, hashSubmissionIds: ["hash-1"], templateId: "template-1", templateDigest: "digest-1",
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetPartnerMemory();
  resetCrawlMemory();
  cases.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/partner/v1/fingerprints", () => {
  it("refuses every keyless or unknown request the same way (Rule 6)", async () => {
    const partnerId = seedPartner("partner-1");
    const key = await seedKey(partnerId);

    expect((await getFeed(request())).status).toBe(401);
    expect((await getFeed(request("ppk_wrongwrongwrongwrongwrong"))).status).toBe(401);
    const revoked = await issuePartnerKey(partnerId, "to revoke");
    const revokedId = [...partnerMemory().keys.entries()].find(([, row]) => row.keyHash === hashPartnerKey(revoked.key))![0];
    partnerMemory().keys.get(revokedId)!.revokedAt = new Date();
    expect((await getFeed(request(revoked.key))).status).toBe(401);

    const ok = await getFeed(request(key));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 403 partner_suspended for a valid key of a suspended partner", async () => {
    const partnerId = seedPartner("partner-2");
    const key = await seedKey(partnerId);
    seedSharedFingerprint();

    partnerMemory().partners.get(partnerId)!.status = "SUSPENDED";
    const response = await getFeed(request(key));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "partner_suspended" });
  });

  it("serves the feed to any ACTIVE partner: the same page for every key (Rule 1's shape)", async () => {
    await seedSharedFingerprint();
    const keyA = await seedKey(seedPartner("partner-a"));
    const keyB = await seedKey(seedPartner("partner-b"));
    settleFeed();

    const pageA = await getFeed(request(keyA));
    const pageB = await getFeed(request(keyB));
    expect(pageA.status).toBe(200);
    const bodyA = (await pageA.json()) as unknown;
    expect(bodyA).toEqual(await pageB.json());
    expect(bodyA).toEqual({
      events: [
        { seq: expect.any(Number), type: "add", fingerprintId: "hash-1", kind: "image", hash: HEX_A, caseRef: "ASMITA-2026-ase-1" },
      ],
      nextCursor: null,
    });
  });

  it("validates the cursor and the limit strictly, and pages with nextCursor", async () => {
    const partnerId = seedPartner("partner-3");
    const key = await seedKey(partnerId);
    const record: CaseRecord = { id: "case-1", referenceNumber: "ASMITA-2026-00001", userId: "user-1", createdAt: "", status: "OPEN", urls: [] };
    cases.set("case-1", record);
    for (let i = 0; i < 7; i += 1) {
      crawlMemory().fingerprints.set(`hash-${i}`, {
        id: `hash-${i}`, caseId: "case-1", hashEncrypted: HEX_A, quality: 100, status: "APPROVED", crawlPoolId: null,
      });
    }
    await recordPartnerShareConsent({ caseId: "case-1", hashSubmissionIds: [], templateId: "t", templateDigest: "d" });

    for (const bad of ["?cursor=abc", "?cursor=-1", "?cursor=1.5", "?cursor=99999999999999999999"]) {
      expect((await getFeed(request(key, bad))).status).toBe(400);
    }
    for (const bad of ["?limit=0", "?limit=501", "?limit=abc", "?limit=1000"]) {
      expect((await getFeed(request(key, bad))).status).toBe(400);
    }

    settleFeed();
    const first = await getFeed(request(key, "?limit=3"));
    const firstBody = (await first.json()) as { events: unknown[]; nextCursor: number };
    expect(firstBody.events).toHaveLength(3);
    const second = await getFeed(request(key, `?cursor=${firstBody.nextCursor}&limit=3`));
    const secondBody = (await second.json()) as { events: unknown[]; nextCursor: number };
    expect(secondBody.events).toHaveLength(3);
    const third = await getFeed(request(key, `?cursor=${secondBody.nextCursor}&limit=3`));
    const thirdBody = (await third.json()) as { events: unknown[]; nextCursor: number | null };
    expect(thirdBody.events).toHaveLength(1);
    expect(thirdBody.nextCursor).toBeNull();
  });

  it("keeps serving a withdrawal to every partner that already has the fingerprint", async () => {
    const partnerId = seedPartner("partner-4");
    const key = await seedKey(partnerId);
    await seedSharedFingerprint();
    await withdrawPartnerShareConsent("case-1");
    settleFeed();

    const page = await getFeed(request(key));
    expect(await page.json()).toEqual({
      events: [
        { seq: expect.any(Number), type: "withdraw", fingerprintId: "hash-1", kind: "image", caseRef: "ASMITA-2026-ase-1" },
      ],
      nextCursor: null,
    });
  });

  it("syncs nothing for fingerprints that were never shared (Rule 2 belt)", async () => {
    const partnerId = seedPartner("partner-6");
    const key = await seedKey(partnerId);
    cases.set("case-1", { id: "case-1", referenceNumber: "ASMITA-2026-00001", userId: "user-1", createdAt: "", status: "OPEN", urls: [] });
    crawlMemory().fingerprints.set("hash-alone", {
      id: "hash-alone", caseId: "case-1", hashEncrypted: HEX_A, quality: 100, status: "APPROVED", crawlPoolId: null,
    });
    // No agreement was ever ticked: a sync writes nothing, the feed is empty.
    await syncPartnerFeedFingerprints(["hash-alone"]);
    const page = await getFeed(request(key));
    expect(await page.json()).toEqual({ events: [], nextCursor: null });
  });

  // Last on purpose: the shared per-IP bucket this test fills stays filled.
  it("rate limits a key that polls too hard (Rule 6)", async () => {
    const partnerId = seedPartner("partner-5");
    const key = await seedKey(partnerId);
    let limited = 0;
    for (let i = 0; i < 320; i += 1) {
      const response = await getFeed(request(key));
      if (response.status === 429) {
        limited = i + 1;
        expect(await response.json()).toEqual({ error: "rate_limited" });
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limited).toBeGreaterThan(0);
  }, 30000);
});
