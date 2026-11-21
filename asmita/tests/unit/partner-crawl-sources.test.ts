import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP33 (partner programme part 2): the moment an admin records a platform
// partner's written permission to crawl, its registered domains may appear as
// crawl sources — origin PARTNER, the reported-source budget and delay,
// created disabled like an admin-added site, one audit entry per created
// source. The reported-source rules hold: a domain that already has a source
// (whatever its origin), a never-crawl or blocked host (including parent
// domains) and a private or invalid host (every *.test domain) is skipped,
// never an error. Before the permission is recorded nothing creates a source,
// and the usual admin enable (updateCrawlSource) still switches a PARTNER
// row on. Memory path (no DATABASE_URL). Synthetic hosts only.

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { createCrawlSource, listEnabledCrawlSources, updateCrawlSource } from "@/lib/crawl-sources";
import { defaultSourceDelayMs, reportedSourcePageBudget } from "@/lib/crawler-flags";
import { ensurePartnerCrawlSources } from "@/lib/partner-crawl";
import { recordPartnerCrawlPermission, updatePlatformPartner } from "@/lib/partner-admin";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";

const ACTOR = "admin-1";
/** A permission date that is always in the past, whatever day the test runs. */
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);

function seedPartner(id: string, overrides: Record<string, unknown> = {}) {
  partnerMemory().partners.set(id, {
    id,
    name: `ExampleForum-${id}`,
    primaryDomain: "forum.example.com",
    extraDomains: ["cdn.example.com"],
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

/** A CrawlBlockedHost row (the admin-managed half of the never-crawl list). */
function blockHost(host: string) {
  crawlMemory().blockedHosts.set(host, { id: `bh-${host}`, host, reason: "owner request", addedBy: ACTOR, createdAt: new Date() });
}

function sourceByDomain(domain: string) {
  return [...crawlMemory().sources.values()].find((s) => s.domain === domain);
}

function actionEntries(action: string) {
  return inMemoryAuditLog.filter((event) => (event.data as { action?: string } | undefined)?.action === action);
}

async function recordPermission(partnerId: string, date = YESTERDAY, note = "signed agreement on file") {
  return recordPartnerCrawlPermission({ partnerId, date, note }, ACTOR);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetPartnerMemory();
  resetCrawlMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("recording the written permission creates disabled PARTNER sources", () => {
  it("creates one per crawlable domain, skips the .test and blocked ones, and reports the same", async () => {
    const partnerId = seedPartner("partner-1", { extraDomains: ["cdn.example.com", "forum.example.test", "blocked.example.com"] });
    blockHost("blocked.example.com");

    const result = await recordPermission(partnerId);
    if (!result.ok) throw new Error("expected the permission to record");
    expect(result.crawlSources).toEqual({
      created: ["forum.example.com", "cdn.example.com"],
      skipped: ["forum.example.test", "blocked.example.com"],
    });
    expect(result.partner.crawlPermissionRecordedAt).toBe(`${YESTERDAY}T00:00:00.000Z`);

    // Exactly two sources, disabled, origin PARTNER, approved by the admin who
    // recorded the permission, with the reported-source budget and delay.
    expect(crawlMemory().sources.size).toBe(2);
    for (const domain of ["forum.example.com", "cdn.example.com"]) {
      expect(sourceByDomain(domain)).toMatchObject({
        kind: "SITE",
        domain,
        origin: "PARTNER",
        enabled: false,
        approvedBy: ACTOR,
        pageBudget: reportedSourcePageBudget(),
        delayMs: defaultSourceDelayMs(),
        hops: 0,
        render: "HTTP",
      });
    }
    expect(sourceByDomain("forum.example.test")).toBeUndefined();
    expect(sourceByDomain("blocked.example.com")).toBeUndefined();
    // Disabled means the crawler pool does not see them yet.
    expect(await listEnabledCrawlSources()).toEqual([]);

    // The permission is audited first, then one ADMIN_ACTION entry per created
    // source, with the partner id and the host and nothing else.
    const permissionEntries = actionEntries("partner_crawl_permission_recorded");
    expect(permissionEntries).toHaveLength(1);
    expect(permissionEntries[0]).toMatchObject({ entityType: "PlatformPartner", entityId: partnerId, actorId: ACTOR });
    const created = actionEntries("partner_crawl_source_created");
    expect(created.map((entry) => (entry.data as { domain: string }).domain)).toEqual(["forum.example.com", "cdn.example.com"]);
    for (const entry of created) {
      const row = sourceByDomain((entry.data as { domain: string }).domain)!;
      expect(entry).toMatchObject({ eventType: "ADMIN_ACTION", entityType: "CrawlSource", entityId: row.id, actorId: ACTOR });
      expect(entry.data).toEqual({
        action: "partner_crawl_source_created",
        partnerId,
        domain: row.domain,
        pageBudget: reportedSourcePageBudget(),
        delayMs: defaultSourceDelayMs(),
        enabled: false,
      });
      expect(permissionEntries[0]!.sequence).toBeLessThan(entry.sequence);
    }
  });

  it("skips a domain covered by a parent-domain CrawlBlockedHost row", async () => {
    const partnerId = seedPartner("partner-blocked-parent", {
      primaryDomain: "chat.example.org",
      extraDomains: ["deep.chat.example.org"],
    });
    blockHost("example.org");

    const result = await recordPermission(partnerId);
    if (!result.ok) throw new Error("expected the permission to record");
    expect(result.crawlSources).toEqual({ created: [], skipped: ["chat.example.org", "deep.chat.example.org"] });
    expect(crawlMemory().sources.size).toBe(0);
    expect(actionEntries("partner_crawl_source_created")).toHaveLength(0);
  });

  it("skips a host on the built-in never-crawl list", async () => {
    const partnerId = seedPartner("partner-never", { extraDomains: ["cdn.example.com", "portal.example.gov.in"] });

    const result = await recordPermission(partnerId);
    if (!result.ok) throw new Error("expected the permission to record");
    expect(result.crawlSources).toEqual({ created: ["forum.example.com", "cdn.example.com"], skipped: ["portal.example.gov.in"] });
    expect(sourceByDomain("portal.example.gov.in")).toBeUndefined();
  });
});

describe("nothing creates a source before the permission is recorded", () => {
  it("updatePlatformPartner on a partner without a recorded permission creates no source", async () => {
    const partnerId = seedPartner("partner-no-permission", { extraDomains: ["cdn.example.com", "shop.example.com"] });

    const updated = await updatePlatformPartner({ partnerId, extraDomains: ["cdn.example.com", "shop.example.com"] }, ACTOR);
    if (!updated.ok) throw new Error("expected the partner update to succeed");
    expect(updated.partner.extraDomains).toEqual(["cdn.example.com", "shop.example.com"]);
    expect(partnerMemory().partners.get(partnerId)!.crawlPermissionRecordedAt).toBeNull();

    // The domain change itself succeeded, but no crawl source appeared.
    expect(crawlMemory().sources.size).toBe(0);
    expect(inMemoryAuditLog.some((event) => event.entityType === "CrawlSource")).toBe(false);
  });
});

describe("a domain that already has a source is skipped, not duplicated", () => {
  it("leaves an existing ADMIN source untouched and reports it skipped", async () => {
    const partnerId = seedPartner("partner-existing");
    const admin = await createCrawlSource({ domain: "cdn.example.com", pageBudget: 10, delayMs: 2000, enabled: true }, "admin-9");
    if (!admin.ok) throw new Error("expected the admin source to be created");

    const result = await recordPermission(partnerId);
    if (!result.ok) throw new Error("expected the permission to record");
    expect(result.crawlSources).toEqual({ created: ["forum.example.com"], skipped: ["cdn.example.com"] });

    // One row for the host, still the admin's, not overwritten by a PARTNER row.
    expect([...crawlMemory().sources.values()].filter((s) => s.domain === "cdn.example.com")).toHaveLength(1);
    expect(sourceByDomain("cdn.example.com")).toMatchObject({
      origin: "ADMIN",
      enabled: true,
      pageBudget: 10,
      delayMs: 2000,
      approvedBy: "admin-9",
    });
    expect(actionEntries("partner_crawl_source_created")).toHaveLength(1);
  });
});

describe("recording the permission is idempotent", () => {
  it("re-recording creates nothing new", async () => {
    const partnerId = seedPartner("partner-re-record");
    const first = await recordPermission(partnerId, "2026-01-15");
    if (!first.ok) throw new Error("expected the permission to record");
    expect(first.crawlSources).toEqual({ created: ["forum.example.com", "cdn.example.com"], skipped: [] });

    const second = await recordPermission(partnerId, "2026-02-20", "re-filed agreement");
    if (!second.ok) throw new Error("expected the re-record to succeed");
    expect(second.crawlSources).toEqual({ created: [], skipped: ["forum.example.com", "cdn.example.com"] });
    expect(second.partner.crawlPermissionRecordedAt).toBe("2026-02-20T00:00:00.000Z");

    // Still exactly one source per domain and one created-entry per source.
    expect(crawlMemory().sources.size).toBe(2);
    expect(actionEntries("partner_crawl_source_created")).toHaveLength(2);
    expect(actionEntries("partner_crawl_permission_recorded")).toHaveLength(2);
  });
});

describe("updatePlatformPartner on a partner whose permission is recorded", () => {
  it("creates a source for a newly added extra domain", async () => {
    const partnerId = seedPartner("partner-new-domain");
    await recordPermission(partnerId);

    const updated = await updatePlatformPartner({ partnerId, extraDomains: ["cdn.example.com", "chat.example.com"] }, ACTOR);
    if (!updated.ok) throw new Error("expected the partner update to succeed");
    expect(updated.partner.extraDomains).toEqual(["cdn.example.com", "chat.example.com"]);

    expect(sourceByDomain("chat.example.com")).toMatchObject({ origin: "PARTNER", enabled: false, approvedBy: ACTOR });
    // The two known domains were skipped, not duplicated.
    expect(crawlMemory().sources.size).toBe(3);
    const created = actionEntries("partner_crawl_source_created");
    expect(created.map((entry) => (entry.data as { domain: string }).domain)).toEqual(["forum.example.com", "cdn.example.com", "chat.example.com"]);
    expect(created.at(-1)!.data).toMatchObject({ partnerId, domain: "chat.example.com", enabled: false });
  });

  it("changing only the channel email creates no source", async () => {
    const partnerId = seedPartner("partner-email-only");
    await recordPermission(partnerId);

    const updated = await updatePlatformPartner({ partnerId, channelEmail: "channel@example.com" }, ACTOR);
    if (!updated.ok) throw new Error("expected the partner update to succeed");
    expect(updated.partner).toMatchObject({ channelEmail: "channel@example.com" });

    expect(crawlMemory().sources.size).toBe(2);
    expect(actionEntries("partner_crawl_source_created")).toHaveLength(2);
  });
});

describe("the sources wait for the usual admin enable", () => {
  it("keeps PARTNER sources out of the crawler pool until updateCrawlSource switches one on", async () => {
    const partnerId = seedPartner("partner-enable");
    await recordPermission(partnerId);
    const row = sourceByDomain("forum.example.com")!;
    expect(row.enabled).toBe(false);
    expect(await listEnabledCrawlSources()).toEqual([]);

    const switched = await updateCrawlSource({ id: row.id, enabled: true }, "admin-2");
    if (!switched.ok) throw new Error("expected the enable to succeed");
    expect(switched.source).toMatchObject({ domain: "forum.example.com", enabled: true, origin: "PARTNER" });
    expect(sourceByDomain("forum.example.com")!.enabled).toBe(true);
    expect((await listEnabledCrawlSources()).map((source) => source.domain)).toEqual(["forum.example.com"]);
    // The other partner source is still disabled, and the enable is audited
    // like any admin change.
    expect(sourceByDomain("cdn.example.com")!.enabled).toBe(false);
    expect(actionEntries("crawl_source_updated")).toHaveLength(1);
  });
});

describe("ensurePartnerCrawlSources", () => {
  it("deduplicates a domain listed as both primary and extra", async () => {
    const result = await ensurePartnerCrawlSources(
      { id: "partner-dedupe", primaryDomain: "forum.example.com", extraDomains: ["forum.example.com", "cdn.example.com"] },
      ACTOR,
    );
    expect(result).toEqual({ created: ["forum.example.com", "cdn.example.com"], skipped: [] });
    expect(crawlMemory().sources.size).toBe(2);
    expect(actionEntries("partner_crawl_source_created")).toHaveLength(2);
  });
});
