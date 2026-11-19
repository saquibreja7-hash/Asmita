import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP30, memory path (no DATABASE_URL): the admin side of the partner
// programme. Every admin action must write an audit entry (Rule 5), the
// channel email is encrypted at rest and never enters the audit log, and
// key material is never stored. Synthetic data only.

import {
  actOnPartnerApplication,
  getPlatformPartner,
  issuePlatformPartnerKey,
  listPlatformPartners,
  listPlatformPartnerKeys,
  recordPartnerCrawlPermission,
  revokePlatformPartnerKey,
  setPlatformPartnerStatus,
  updatePlatformPartner,
} from "@/lib/partner-admin";
import { verifyPartnerKey } from "@/lib/partner-auth";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { partnerApplications, recordPartnerApplication } from "@/lib/platform-partners";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashPartnerKey } from "@/lib/partner-auth";
import { inMemoryAuditLog } from "@/lib/audit";
import type { PartnerInterest } from "@/lib/platform-partners-shared";

const ACTOR = "admin-1";

type IssueResult = Awaited<ReturnType<typeof issuePlatformPartnerKey>>;
type OkIssue = Extract<IssueResult, { ok: true }>;

/** Asserts the issue succeeded and narrows the result for TypeScript. */
function issuedKey(result: IssueResult): OkIssue {
  if (!result.ok) throw new Error(`key issue failed: ${result.error}`);
  return result;
}

async function seedApplication(overrides: Record<string, unknown> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const input = {
    organisationName: "Example Media Pvt Ltd",
    platformName: `ExampleTube-${suffix}`,
    websiteDomain: `${suffix}.example`,
    platformType: "VIDEO" as const,
    userBase: "LAKH_10L" as const,
    contactName: "Test Officer",
    contactRole: "Grievance Officer",
    contactEmail: `grievance-${suffix}@example.invalid`,
    interests: ["TAKEDOWN_CHANNEL"] as PartnerInterest[],
  };
  await recordPartnerApplication(input);
  const application = partnerApplications[partnerApplications.length - 1]!;
  Object.assign(application, overrides);
  return application;
}

function seedPartner(overrides: Record<string, unknown> = {}) {
  const id = `partner-${Math.random().toString(36).slice(2, 10)}`;
  partnerMemory().partners.set(id, {
    id,
    name: "ExampleForum",
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

function auditEntries(action: string) {
  return inMemoryAuditLog.filter((entry) => (entry.data as Record<string, unknown>)?.action === action);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPartnerMemory();
  partnerApplications.splice(0, partnerApplications.length);
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("application actions", () => {
  it("marks a new request contacted, and only a new one", async () => {
    const application = await seedApplication();
    const result = await actOnPartnerApplication({ applicationId: application.id, action: "contacted" }, ACTOR);
    expect(result).toEqual({ ok: true, status: "CONTACTED" });
    expect(application.status).toBe("CONTACTED");
    // Twice is not a change.
    expect(await actOnPartnerApplication({ applicationId: application.id, action: "contacted" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_status",
    });
    expect(auditEntries("partner_application_contacted")).toHaveLength(1);
    expect(auditEntries("partner_application_contacted")[0].actorId).toBe(ACTOR);
    expect(await actOnPartnerApplication({ applicationId: "missing", action: "contacted" }, ACTOR)).toEqual({
      ok: false,
      error: "application_not_found",
    });
  });

  it("approving creates an ACTIVE partner from the application and marks it ONBOARDED", async () => {
    const application = await seedApplication();
    const result = await actOnPartnerApplication({ applicationId: application.id, action: "approve" }, ACTOR);
    expect(result.ok).toBe(true);
    expect(application.status).toBe("ONBOARDED");

    const partner = partnerMemory().partners.get((result as { partnerId: string }).partnerId)!;
    expect(partner.name).toBe(application.platformName);
    expect(partner.primaryDomain).toBe(application.websiteDomain);
    expect(partner.status).toBe("ACTIVE");
    expect(partner.createdFromApplicationId).toBe(application.id);
    // The channel email is the application's contact email, encrypted.
    expect(partner.channelEmailEncrypted).not.toBe(application.contactEmail);
    expect(decryptField(partner.channelEmailEncrypted!)).toBe(application.contactEmail);

    const view = await getPlatformPartner(partner.id);
    expect(view!.channelEmail).toBe(application.contactEmail);
    expect(view!.status).toBe("ACTIVE");
  });

  it("a terminal request cannot be approved or declined again", async () => {
    const declined = await seedApplication();
    expect((await actOnPartnerApplication({ applicationId: declined.id, action: "decline" }, ACTOR)).ok).toBe(true);
    expect(declined.status).toBe("DECLINED");
    for (const action of ["approve", "decline", "contacted"] as const) {
      expect(await actOnPartnerApplication({ applicationId: declined.id, action }, ACTOR)).toEqual({
        ok: false,
        error: "invalid_status",
      });
    }

    const approved = await seedApplication();
    await actOnPartnerApplication({ applicationId: approved.id, action: "approve" }, ACTOR);
    expect(await actOnPartnerApplication({ applicationId: approved.id, action: "approve" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_status",
    });
  });

  it("a domain can be onboarded only once: a second application with the same domain is refused", async () => {
    const first = await seedApplication();
    const second = await seedApplication({ websiteDomain: first.websiteDomain });
    expect((await actOnPartnerApplication({ applicationId: first.id, action: "approve" }, ACTOR)).ok).toBe(true);
    expect(await actOnPartnerApplication({ applicationId: second.id, action: "approve" }, ACTOR)).toEqual({
      ok: false,
      error: "partner_exists",
    });
    expect(second.status).toBe("NEW");
    expect(await listPlatformPartners()).toHaveLength(1);
  });

  it("an application for a domain another partner owns as an extra is refused (Rule 1)", async () => {
    seedPartner({ primaryDomain: "owner.example", extraDomains: ["shared.example"] });
    const application = await seedApplication({ websiteDomain: "shared.example" });
    expect(await actOnPartnerApplication({ applicationId: application.id, action: "approve" }, ACTOR)).toEqual({
      ok: false,
      error: "partner_exists",
    });
    expect(application.status).toBe("NEW");
    // Only the seeded partner exists; nothing was written and nothing audited.
    expect(await listPlatformPartners()).toHaveLength(1);
    expect(auditEntries("partner_approved")).toHaveLength(0);
  });

  it("every action writes exactly one audit entry, and no audit data carries the contact email", async () => {
    const application = await seedApplication();
    await actOnPartnerApplication({ applicationId: application.id, action: "approve" }, ACTOR);
    expect(auditEntries("partner_approved")).toHaveLength(1);
    const entry = auditEntries("partner_approved")[0];
    expect(entry.actorId).toBe(ACTOR);
    expect(entry.entityType).toBe("PlatformPartner");
    expect((entry.data as Record<string, unknown>).applicationId).toBe(application.id);
    // The email lives encrypted in the partner row and nowhere else.
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain(application.contactEmail);

    await actOnPartnerApplication({ applicationId: "missing", action: "decline" }, ACTOR);
    expect(auditEntries("partner_application_declined")).toHaveLength(0);
  });
});

describe("partner details", () => {
  it("normalises and dedupes domains, drops the primary from extras, and stores the channel email encrypted", async () => {
    const partnerId = seedPartner();
    const result = await updatePlatformPartner(
      {
        partnerId,
        primaryDomain: "https://WWW.Forum-Example.test/dashboard",
        extraDomains: ["cdn.example.test", "cdn.example.test", "www.forum-example.test", "files.example.test"],
        channelEmail: "notices@example.test",
      },
      ACTOR,
    );
    expect(result.ok).toBe(true);
    const partner = partnerMemory().partners.get(partnerId)!;
    expect(partner.primaryDomain).toBe("forum-example.test");
    expect(partner.extraDomains).toEqual(["cdn.example.test", "files.example.test"]);
    expect(decryptField(partner.channelEmailEncrypted!)).toBe("notices@example.test");
    expect(auditEntries("partner_updated")).toHaveLength(1);
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain("notices@example.test");

    // Clearing: an empty string removes the address.
    const cleared = await updatePlatformPartner({ partnerId, channelEmail: "" }, ACTOR);
    expect(cleared.ok).toBe(true);
    expect(partnerMemory().partners.get(partnerId)!.channelEmailEncrypted).toBeNull();
  });

  it("refuses a domain another partner owns, as primary or extra, and an invalid domain", async () => {
    const mine = seedPartner();
    seedPartner({ primaryDomain: "taken.example" });
    seedPartner({ primaryDomain: "owner.example", extraDomains: ["extra.owner.example"] });

    expect(await updatePlatformPartner({ partnerId: mine, primaryDomain: "taken.example" }, ACTOR)).toEqual({
      ok: false,
      error: "domain_in_use",
    });
    expect(await updatePlatformPartner({ partnerId: mine, extraDomains: ["extra.owner.example"] }, ACTOR)).toEqual({
      ok: false,
      error: "domain_in_use",
    });
    expect(await updatePlatformPartner({ partnerId: mine, primaryDomain: "not a domain" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_domain",
    });
    expect(await updatePlatformPartner({ partnerId: "missing", primaryDomain: "x.example" }, ACTOR)).toEqual({
      ok: false,
      error: "partner_not_found",
    });
  });

  it("a partner keeps its own domains across edits", async () => {
    const partnerId = seedPartner({ extraDomains: ["old.example"] });
    const result = await updatePlatformPartner({ partnerId, channelEmail: "kept@example.test" }, ACTOR);
    expect(result.ok).toBe(true);
    expect(partnerMemory().partners.get(partnerId)!.extraDomains).toEqual(["old.example"]);
  });
});

describe("partner status", () => {
  it("suspends and reactivates with audit entries, and refuses a no-op", async () => {
    const partnerId = seedPartner();
    const suspended = await setPlatformPartnerStatus({ partnerId, status: "SUSPENDED" }, ACTOR);
    expect(suspended.ok).toBe(true);
    expect(partnerMemory().partners.get(partnerId)!.status).toBe("SUSPENDED");
    expect(auditEntries("partner_suspended")).toHaveLength(1);

    expect(await setPlatformPartnerStatus({ partnerId, status: "SUSPENDED" }, ACTOR)).toEqual({
      ok: false,
      error: "no_change",
    });

    const reactivated = await setPlatformPartnerStatus({ partnerId, status: "ACTIVE" }, ACTOR);
    expect(reactivated.ok).toBe(true);
    expect(auditEntries("partner_reactivated")).toHaveLength(1);
    expect(await setPlatformPartnerStatus({ partnerId: "missing", status: "SUSPENDED" }, ACTOR)).toEqual({
      ok: false,
      error: "partner_not_found",
    });
  });

  it("a suspended partner cannot authenticate; reactivation restores its key (Rules 5 and 6)", async () => {
    const partnerId = seedPartner();
    const issued = issuedKey(await issuePlatformPartnerKey({ partnerId, label: "k1" }, ACTOR));
    await setPlatformPartnerStatus({ partnerId, status: "SUSPENDED" }, ACTOR);
    expect(await verifyPartnerKey(issued.key)).toEqual({ ok: false, reason: "suspended" });

    await setPlatformPartnerStatus({ partnerId, status: "ACTIVE" }, ACTOR);
    expect(await verifyPartnerKey(issued.key)).toEqual({ ok: true, keyId: issued.keyId, partnerId });
  });
});

describe("partner keys", () => {
  it("issues a key once, storing only its hash, and audits the issue without key material", async () => {
    const partnerId = seedPartner();
    const issued = issuedKey(await issuePlatformPartnerKey({ partnerId, label: "Integration key" }, ACTOR));
    expect(issued.key).toMatch(/^ppk_/);
    const row = partnerMemory().keys.get(issued.keyId)!;
    expect(row.keyHash).toBe(hashPartnerKey(issued.key));
    expect(JSON.stringify(partnerMemory())).not.toContain(issued.key);

    const entry = auditEntries("partner_key_issued")[0];
    expect(entry.entityId).toBe(partnerId);
    expect(entry.actorId).toBe(ACTOR);
    expect((entry.data as Record<string, unknown>).keyId).toBe(issued.keyId);
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain(issued.key);

    expect(await issuePlatformPartnerKey({ partnerId: "missing", label: "x" }, ACTOR)).toEqual({
      ok: false,
      error: "partner_not_found",
    });
  });

  it("revokes a key, refuses a repeat and a key of another partner", async () => {
    const partnerId = seedPartner();
    const other = seedPartner();
    const mine = issuedKey(await issuePlatformPartnerKey({ partnerId, label: "k1" }, ACTOR));
    const theirs = issuedKey(await issuePlatformPartnerKey({ partnerId: other, label: "k2" }, ACTOR));

    // The key id alone never reaches another partner's keys.
    expect(await revokePlatformPartnerKey({ partnerId, keyId: theirs.keyId }, ACTOR)).toEqual({
      ok: false,
      error: "key_not_found",
    });
    expect((await listPlatformPartnerKeys(other)).map((key) => key.id)).toContain(theirs.keyId);

    expect(await revokePlatformPartnerKey({ partnerId, keyId: mine.keyId }, ACTOR)).toEqual({ ok: true });
    expect(await verifyPartnerKey(mine.key)).toEqual({ ok: false, reason: "revoked" });
    expect(auditEntries("partner_key_revoked")).toHaveLength(1);

    expect(await revokePlatformPartnerKey({ partnerId, keyId: mine.keyId }, ACTOR)).toEqual({
      ok: false,
      error: "key_revoked",
    });
    expect(await revokePlatformPartnerKey({ partnerId: "missing", keyId: mine.keyId }, ACTOR)).toEqual({
      ok: false,
      error: "partner_not_found",
    });
    expect(await revokePlatformPartnerKey({ partnerId, keyId: "missing" }, ACTOR)).toEqual({
      ok: false,
      error: "key_not_found",
    });
  });

  it("the key list never exposes a hash or a key", async () => {
    const partnerId = seedPartner();
    const issued = issuedKey(await issuePlatformPartnerKey({ partnerId, label: "k1" }, ACTOR));
    const keys = await listPlatformPartnerKeys(partnerId);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toEqual({
      id: issued.keyId,
      label: "k1",
      createdAt: expect.any(String),
      revokedAt: null,
      lastUsedAt: null,
    });
    expect(JSON.stringify(keys)).not.toContain(issued.key);
    expect(JSON.stringify(keys)).not.toContain(partnerMemory().keys.get(issued.keyId)!.keyHash);
  });
});

describe("written permission to crawl", () => {
  const NOW = new Date("2026-11-19T12:00:00.000Z");

  it("records the date, the admin and the note, and audits them", async () => {
    const partnerId = seedPartner();
    const result = await recordPartnerCrawlPermission(
      { partnerId, date: "2026-11-18", note: "Email from their DPO, on file with legal" },
      ACTOR,
      NOW,
    );
    expect(result.ok).toBe(true);
    const partner = partnerMemory().partners.get(partnerId)!;
    expect(partner.crawlPermissionRecordedAt).toEqual(new Date("2026-11-18T00:00:00.000Z"));
    expect(partner.crawlPermissionRecordedById).toBe(ACTOR);
    expect(partner.crawlPermissionNote).toBe("Email from their DPO, on file with legal");
    const entry = auditEntries("partner_crawl_permission_recorded")[0];
    expect((entry.data as Record<string, unknown>).date).toBe("2026-11-18");

    // Re-recording overwrites.
    await recordPartnerCrawlPermission({ partnerId, date: "2026-11-19", note: "Signed agreement, filed" }, ACTOR, NOW);
    expect(partnerMemory().partners.get(partnerId)!.crawlPermissionNote).toBe("Signed agreement, filed");
  });

  it("refuses a future date, an impossible date and an unknown partner", async () => {
    const partnerId = seedPartner();
    expect(
      await recordPartnerCrawlPermission({ partnerId, date: "2026-11-20", note: "Tomorrow's postmark" }, ACTOR, NOW),
    ).toEqual({ ok: false, error: "future_date" });
    expect(await recordPartnerCrawlPermission({ partnerId, date: "2026-13-40", note: "Impossible" }, ACTOR, NOW)).toEqual({
      ok: false,
      error: "invalid_date",
    });
    expect(await recordPartnerCrawlPermission({ partnerId: "missing", date: "2026-11-01", note: "x" }, ACTOR, NOW)).toEqual({
      ok: false,
      error: "partner_not_found",
    });
  });
});

describe("the console view", () => {
  it("lists partners with the channel email decrypted and a placeholder for unreadable rows", async () => {
    seedPartner({ name: "Alpha", channelEmailEncrypted: encryptField("alpha@example.test") });
    seedPartner({ name: "Beta", channelEmailEncrypted: "not-a-valid-payload" });
    const views = await listPlatformPartners();
    expect(views.map((view) => view.name)).toEqual(["Alpha", "Beta"]);
    expect(views[0].channelEmail).toBe("alpha@example.test");
    expect(views[1].channelEmail).toBe("[could not decrypt]");
    const missing = await getPlatformPartner("missing");
    expect(missing).toBeNull();
  });
});
