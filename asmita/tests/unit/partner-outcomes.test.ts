import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP32 (partner programme part 2): POST /api/partner/v1/outcomes and
// src/lib/partner-outcomes.ts, over the memory store. Proves the spec's
// "Done means": a partner can report an outcome for a fingerprint it received
// or a URL on its own registered domains only (never another partner's
// domain, never a bare subdomain), a "removed" outcome on a reported link
// updates that link exactly like an admin-recorded removal (status REMOVED
// plus a CONTENT_REMOVED audit entry), outcomes are audited with ids and
// counts only, and the payload rules (strict schema, body cap) hold.
// Synthetic data only: example.test domains, a random UUID, hex digests.

vi.mock("@/lib/encryption", () => ({
  encryptField: (value: string) => `enc:${value.length}`,
  decryptField: (value: string) => value,
}));

import { POST as postOutcome } from "@/app/api/partner/v1/outcomes/route";
import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { issuePartnerKey } from "@/lib/partner-auth";
import { recordPartnerShareConsent } from "@/lib/partner-share-consent";
import { listPartnerOutcomesForCase, partnerOwnsUrlDomain } from "@/lib/partner-outcomes";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { cases, type CaseRecord, type UrlRecord } from "@/lib/store";

const PARTNER_URL = "https://forum.example.test/watch/123";
const PARTNER_URL_PARSED = parseSubmittedUrl(PARTNER_URL);
const PARTNER_URL_HASH = PARTNER_URL_PARSED.ok ? PARTNER_URL_PARSED.urlHash : "";
const FINGERPRINT_ID = "11111111-1111-4111-8111-111111111111";

function seedPartner(id: string, overrides: Record<string, unknown> = {}) {
  partnerMemory().partners.set(id, {
    id,
    name: `ExampleForum-${id}`,
    primaryDomain: "forum.example.test",
    extraDomains: ["cdn.example.test"],
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

async function seedKey(partnerId: string) {
  return (await issuePartnerKey(partnerId, "outcomes test key")).key;
}

function seedCase(caseId: string, urlId?: string) {
  const record: CaseRecord = {
    id: caseId, referenceNumber: `ASMITA-2026-0000${caseId.slice(-1)}`, userId: `user-${caseId}`,
    createdAt: "", status: "OPEN", urls: [],
  };
  if (urlId) {
    const url: UrlRecord = {
      id: urlId, domain: "forum.example.test", platformName: "ExampleForum", status: "PENDING_REVIEW",
      urlHash: PARTNER_URL_HASH, platformId: null,
    };
    record.urls.push(url);
  }
  cases.set(caseId, record);
  return record;
}

/** A fingerprint that was actually shared: it has a feed event. */
async function seedSharedFingerprint(caseId: string) {
  crawlMemory().fingerprints.set(FINGERPRINT_ID, {
    id: FINGERPRINT_ID, caseId, hashEncrypted: "ab".repeat(32), quality: 100, status: "APPROVED", crawlPoolId: null,
  });
  await recordPartnerShareConsent({ caseId, hashSubmissionIds: [FINGERPRINT_ID], templateId: "t1", templateDigest: "d1" });
}

function request(key: string | undefined, body?: unknown, raw?: string) {
  return new Request("https://asmita.test/api/partner/v1/outcomes", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
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

describe("the domain gate", () => {
  const partner = { primaryDomain: "forum.example.test", extraDomains: ["cdn.example.test"] };

  it("accepts exactly the partner's registered domains", () => {
    expect(partnerOwnsUrlDomain(partner, "forum.example.test")).toBe(true);
    expect(partnerOwnsUrlDomain(partner, "cdn.example.test")).toBe(true);
    // Not the partner's: another platform, another partner, a subdomain it did
    // not register, and a lookalike suffix.
    expect(partnerOwnsUrlDomain(partner, "video.example.test")).toBe(false);
    expect(partnerOwnsUrlDomain(partner, "img.forum.example.test")).toBe(false);
    expect(partnerOwnsUrlDomain(partner, "forum.example.test.evil.test")).toBe(false);
    expect(partnerOwnsUrlDomain(partner, "other-forum.example.test")).toBe(false);
  });
});

describe("POST /api/partner/v1/outcomes", () => {
  it("refuses a keyless request and a bad payload (Rule 6)", async () => {
    const partnerId = seedPartner("partner-1");
    const key = await seedKey(partnerId);

    expect((await postOutcome(request(undefined, { outcome: "removed" }))).status).toBe(401);
    for (const body of [
      { outcome: "removed" }, // nothing reported
      { outcome: "deleted" }, // not an outcome
      { url: PARTNER_URL, outcome: "removed", extra: 1 }, // unknown field
      { fingerprintId: "not-a-uuid", outcome: "removed" },
      null,
    ]) {
      const response = await postOutcome(request(key, body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
    expect(partnerMemory().outcomes).toEqual([]);
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("caps the body it will read (Rule 6)", async () => {
    const partnerId = seedPartner("partner-2");
    const key = await seedKey(partnerId);
    const huge = { url: PARTNER_URL, outcome: "removed", note: "x".repeat(40 * 1024) };
    const response = await postOutcome(request(key, undefined, JSON.stringify(huge)));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
  });

  it("stores an outcome for a page on its own domain, audited with ids and counts only", async () => {
    const partnerId = seedPartner("partner-3");
    const key = await seedKey(partnerId);
    seedCase("case-3");

    const response = await postOutcome(request(key, { url: PARTNER_URL, outcome: "not_found", note: "nothing there" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(partnerMemory().outcomes).toHaveLength(1);
    const row = partnerMemory().outcomes[0]!;
    expect(row).toMatchObject({
      partnerId, fingerprintId: null, submittedUrlId: null, caseId: null, outcome: "NOT_FOUND", note: "nothing there",
    });
    // The URL is stored encrypted, never in the clear.
    expect(row.urlEncrypted).not.toBe(PARTNER_URL);
    expect(row.urlEncrypted).toMatch(/^enc:/);
    expect(row.urlHash).toBe(PARTNER_URL_HASH);

    expect(inMemoryAuditLog).toHaveLength(1);
    const [audit] = inMemoryAuditLog;
    expect(audit.eventType).toBe("PARTNER_OUTCOME_REPORTED");
    expect(audit.entityType).toBe("PlatformPartner");
    expect(audit.entityId).toBe(partnerId);
    expect(audit.data).toEqual({
      outcome: "not_found", fingerprintId: null, urlReported: true, urlDomain: "forum.example.test",
      matchedLinks: 0, linksRemoved: 0, caseId: null,
    });
    expect(JSON.stringify(audit.data)).not.toContain(PARTNER_URL);
  });

  it("refuses to report about another partner's domain, a stranger's domain, or its own unregistered subdomain (Rule 6)", async () => {
    seedPartner("partner-a", { primaryDomain: "video.example.test" });
    const partnerId = seedPartner("partner-b");
    const key = await seedKey(partnerId);

    // video.example.test belongs to another partner.
    const other = await postOutcome(request(key, { url: "https://video.example.test/watch/1", outcome: "removed" }));
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: "url_not_on_partner_domain" });
    // A domain nobody registered.
    expect((await postOutcome(request(key, { url: "https://stranger.example.test/watch/1", outcome: "removed" }))).status).toBe(403);
    // The partner's own subdomain it did not register.
    expect((await postOutcome(request(key, { url: "https://img.forum.example.test/watch/1", outcome: "removed" }))).status).toBe(403);
    // A blocked address is not a URL Asmita accepts at all.
    expect((await postOutcome(request(key, { url: "https://localhost/watch/1", outcome: "removed" }))).status).toBe(400);

    expect(partnerMemory().outcomes).toEqual([]);
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("a removed outcome on a reported link updates it like an admin-recorded removal, on every case that reported it", async () => {
    const partnerId = seedPartner("partner-c");
    const key = await seedKey(partnerId);
    // The same address reported on two cases.
    seedCase("case-1", "url-1");
    seedCase("case-2", "url-2");

    const response = await postOutcome(request(key, { url: PARTNER_URL, outcome: "removed" }));
    expect(response.status).toBe(200);

    expect(cases.get("case-1")!.urls[0]!.status).toBe("REMOVED");
    expect(cases.get("case-2")!.urls[0]!.status).toBe("REMOVED");
    // The row links to one of the reported links.
    expect(partnerMemory().outcomes[0]!.submittedUrlId).toBe("url-1");
    expect(partnerMemory().outcomes[0]!.caseId).toBe("case-1");

    const removals = inMemoryAuditLog.filter((event) => event.eventType === "CONTENT_REMOVED");
    expect(removals.map((event) => event.entityId)).toEqual(["url-1", "url-2"]);
    for (const event of removals) {
      expect(event.data).toMatchObject({ action: "partner_outcome_removed", partnerId });
      expect(JSON.stringify(event.data)).not.toContain(PARTNER_URL);
    }
  });

  it("an already-removed link is not rewritten, and other outcomes do not remove", async () => {
    const partnerId = seedPartner("partner-d");
    const key = await seedKey(partnerId);
    const record = seedCase("case-1", "url-1");
    record.urls[0]!.status = "REMOVED";

    // removed again: the guarded update leaves it and writes no new audit row
    await postOutcome(request(key, { url: PARTNER_URL, outcome: "removed" }));
    expect(inMemoryAuditLog.filter((event) => event.eventType === "CONTENT_REMOVED")).toHaveLength(0);

    // a blocked_reupload report never changes the link's status
    seedCase("case-2", "url-2");
    await postOutcome(request(key, { url: PARTNER_URL, outcome: "blocked_reupload" }));
    expect(cases.get("case-2")!.urls[0]!.status).toBe("PENDING_REVIEW");
    expect(inMemoryAuditLog.filter((event) => event.eventType === "CONTENT_REMOVED")).toHaveLength(0);
  });

  it("accepts a fingerprint it received through the feed, and only one that was ever shared", async () => {
    const partnerId = seedPartner("partner-e");
    const key = await seedKey(partnerId);
    seedCase("case-1");
    await seedSharedFingerprint("case-1");

    const response = await postOutcome(request(key, { fingerprintId: FINGERPRINT_ID, outcome: "blocked_reupload" }));
    expect(response.status).toBe(200);
    expect(partnerMemory().outcomes[0]).toMatchObject({ fingerprintId: FINGERPRINT_ID, caseId: "case-1", outcome: "BLOCKED_REUPLOAD" });

    const unknown = await postOutcome(request(key, { fingerprintId: "22222222-2222-4222-8222-222222222222", outcome: "removed" }));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown_fingerprint" });
    expect(partnerMemory().outcomes).toHaveLength(1);
  });

  it("a suspended partner's key is refused (Rule 6)", async () => {
    const partnerId = seedPartner("partner-f");
    const key = await seedKey(partnerId);
    seedCase("case-1");
    await seedSharedFingerprint("case-1");
    partnerMemory().partners.get(partnerId)!.status = "SUSPENDED";

    const response = await postOutcome(request(key, { fingerprintId: FINGERPRINT_ID, outcome: "removed" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "partner_suspended" });
    expect(partnerMemory().outcomes).toEqual([]);
  });

  it("lists what a case's admin page shows, without the address", async () => {
    const partnerId = seedPartner("partner-g");
    const key = await seedKey(partnerId);
    seedCase("case-1", "url-1");
    await seedSharedFingerprint("case-1");

    await postOutcome(request(key, { fingerprintId: FINGERPRINT_ID, url: PARTNER_URL, outcome: "removed", note: "handled" }));
    const listed = await listPartnerOutcomesForCase("case-1");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      partnerName: "ExampleForum-partner-g",
      partnerDomain: "forum.example.test",
      fingerprintId: FINGERPRINT_ID,
      matchedLinkId: "url-1",
      outcome: "removed",
      note: "handled",
    });
    expect(Object.keys(listed[0]!).sort()).toEqual(
      ["createdAt", "fingerprintId", "id", "matchedLinkId", "note", "outcome", "partnerDomain", "partnerName"],
    );
  });
});
