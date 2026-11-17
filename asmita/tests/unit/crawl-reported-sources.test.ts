import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP1 (full-crawler spec): a survivor's submitted link, and an approved
// crawler finding, make sure an enabled REPORTED CrawlSource exists for the
// link's host — the host only, never the link or the case, never for a
// never-crawl host, and never tied to her: erasing her account leaves the
// source in place. Memory path (no DATABASE_URL). Placeholder hosts only.

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { createCrawlSource, listEnabledCrawlSources } from "@/lib/crawl-sources";
import { recordCrawlConsent } from "@/lib/crawl-consent";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { addUrlsToCase, registerCaseWithUrls } from "@/lib/case-ops";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";

function reportedSource(domain: string) {
  return [...crawlMemory().sources.values()].find((s) => s.domain === domain);
}

function seedCase(userId: string) {
  return store.createCase(userId);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});
afterEach(() => vi.unstubAllEnvs());

describe("a survivor's submitted link creates a REPORTED source", () => {
  it("creates exactly one enabled REPORTED source for the link's host, with the default budget and delay", async () => {
    const record = await seedCase("user-1");
    const [result] = await addUrlsToCase(record.id, ["https://forum.example.com/thread/1"]);
    expect(result).toMatchObject({ ok: true, duplicate: false });

    const source = reportedSource("forum.example.com");
    expect(source).toMatchObject({
      kind: "SITE",
      domain: "forum.example.com",
      origin: "REPORTED",
      enabled: true,
      hops: 0,
      discoveredFromId: null,
      render: "HTTP",
      pageBudget: 2000,
      delayMs: 1500,
      approvedBy: null,
      lastCrawledAt: null,
      pagesCrawled: 0,
    });
    // The host only: nothing of the link, the case or the survivor is stored.
    const serialized = JSON.stringify(source);
    expect(serialized).not.toContain("thread/1");
    expect(serialized).not.toContain(record.id);
    expect(serialized).not.toContain("user-1");
  });

  it("is idempotent: a second link on the same host creates no second source", async () => {
    const record = await seedCase("user-1");
    await addUrlsToCase(record.id, ["https://forum.example.com/thread/1"]);
    const [again] = await addUrlsToCase(record.id, ["https://forum.example.com/thread/2"]);
    expect(again).toMatchObject({ ok: true });
    expect([...crawlMemory().sources.values()].filter((s) => s.domain === "forum.example.com")).toHaveLength(1);
  });

  it("does not duplicate a host an admin already added, and leaves that source untouched", async () => {
    const admin = await createCrawlSource({ domain: "forum.example.com", pageBudget: 10, delayMs: 2000, enabled: true }, "admin-1");
    expect(admin.ok).toBe(true);
    const record = await seedCase("user-1");
    await addUrlsToCase(record.id, ["https://forum.example.com/thread/1"]);
    const source = reportedSource("forum.example.com")!;
    expect(source.origin).toBe("ADMIN");
    expect(source.pageBudget).toBe(10);
    expect([...crawlMemory().sources.values()]).toHaveLength(1);
  });

  it("a never-crawl host creates no source", async () => {
    const record = await seedCase("user-1");
    const [result] = await addUrlsToCase(record.id, ["https://www.instagram.com/p/placeholder"]);
    expect(result).toMatchObject({ ok: true });
    expect(crawlMemory().sources.size).toBe(0);
  });

  it("a host on the CrawlBlockedHost list creates no source, for the host and its subdomains", async () => {
    crawlMemory().blockedHosts.set("blocked.example.org", { id: "bh-1", host: "blocked.example.org", reason: "owner request", addedBy: "admin-1", createdAt: new Date() });
    const record = await seedCase("user-1");
    await addUrlsToCase(record.id, ["https://blocked.example.org/a", "https://deep.forum.blocked.example.org/b", "https://fine.example.org/c"]);
    expect(reportedSource("blocked.example.org")).toBeUndefined();
    expect(reportedSource("deep.forum.blocked.example.org")).toBeUndefined();
    expect(reportedSource("fine.example.org")).toBeDefined();
  });

  it("budget and delay come from the environment, clamped to the admin bounds", async () => {
    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "777");
    vi.stubEnv("CRAWLER_DEFAULT_DELAY_MS", "2500");
    const first = await seedCase("user-1");
    await addUrlsToCase(first.id, ["https://forum.example.com/thread/1"]);
    expect(reportedSource("forum.example.com")).toMatchObject({ pageBudget: 777, delayMs: 2500 });

    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "99999");
    vi.stubEnv("CRAWLER_DEFAULT_DELAY_MS", "10");
    const second = await seedCase("user-2");
    await addUrlsToCase(second.id, ["https://other.example.org/thread/1"]);
    expect(reportedSource("other.example.org")).toMatchObject({ pageBudget: 10_000, delayMs: 500 });

    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "not-a-number");
    const third = await seedCase("user-3");
    await addUrlsToCase(third.id, ["https://third.example.org/thread/1"]);
    expect(reportedSource("third.example.org")).toMatchObject({ pageBudget: 2000, delayMs: 500 });
  });

  it("the audit entry carries the source id and host only, never an actor or a case", async () => {
    const record = await seedCase("user-1");
    await addUrlsToCase(record.id, ["https://forum.example.com/thread/1"]);
    const source = reportedSource("forum.example.com")!;
    const entries = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_REPORTED");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entityType: "CrawlSource", entityId: source.id });
    expect(entries[0].actorId).toBeUndefined();
    expect(JSON.stringify(entries[0].data)).not.toContain(record.id);
    expect(JSON.stringify(entries[0].data)).not.toContain("user-1");
    // A repeat link writes nothing.
    await addUrlsToCase(record.id, ["https://forum.example.com/thread/2"]);
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_REPORTED")).toHaveLength(1);
  });

  it("a link reported while creating the case creates the source too, once per host", async () => {
    const outcome = await registerCaseWithUrls("user-1", [
      "https://forum.example.com/post/1",
      "https://forum.example.com/post/2",
      "https://other.example.org/post/1",
    ]);
    expect(outcome).toMatchObject({ ok: true, accepted: 3 });
    expect(reportedSource("forum.example.com")).toMatchObject({ origin: "REPORTED", enabled: true });
    expect(reportedSource("other.example.org")).toMatchObject({ origin: "REPORTED", enabled: true });
    expect(crawlMemory().sources.size).toBe(2);

    // A replayed registration adds nothing.
    const replay = await registerCaseWithUrls("user-1", ["https://forum.example.com/post/1"], { registrationKeyHash: "key-1" });
    const again = await registerCaseWithUrls("user-1", ["https://forum.example.com/post/1"], { registrationKeyHash: "key-1" });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(replay).toMatchObject({ ok: true });
    expect(crawlMemory().sources.size).toBe(2);
  });
});

describe("an approved crawler finding creates a REPORTED source for its page host", () => {
  async function approvedFindingOn(pageUrl: string) {
    const record = await seedCase("user-1");
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("c".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    expect((await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" })).ok).toBe(true);
    const admin = await createCrawlSource({ domain: "forum.example.com", pageBudget: 50, delayMs: 1000, enabled: true }, "admin-1");
    expect(admin.ok).toBe(true);
    const sourceId = admin.ok ? admin.source.id : "";
    const ingest = await recordCrawlFindings({
      runId: "run-1",
      findings: [{
        fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!,
        pageUrl, imageUrl: "https://cdn.example.net/x.jpg",
        distance: 4, quality: 90, observedAt: "2026-11-16T00:00:00Z", sourceId,
      }],
    }, "key-1");
    expect(ingest.results).toEqual([{ status: "accepted" }]);
    const finding = [...crawlMemory().findings.values()][0];
    const outcome = await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED" });
    return record;
  }

  it("a finding on a subdomain of the source adds a REPORTED source for that subdomain", async () => {
    await approvedFindingOn("https://deep.forum.example.com/t/1");
    const subdomain = reportedSource("deep.forum.example.com");
    expect(subdomain).toMatchObject({ origin: "REPORTED", enabled: true, hops: 0, pageBudget: 2000, delayMs: 1500 });
    // The admin source is untouched.
    expect(reportedSource("forum.example.com")).toMatchObject({ origin: "ADMIN", pageBudget: 50 });
  });

  it("a finding on the source host itself adds nothing (the source exists)", async () => {
    await approvedFindingOn("https://forum.example.com/t/1");
    expect([...crawlMemory().sources.values()].filter((s) => s.domain === "forum.example.com")).toHaveLength(1);
  });
});

describe("erasing her account keeps the source and nothing links it to her", () => {
  it("hard-deleting the survivor leaves the REPORTED source in place", async () => {
    const record = await seedCase("user-erase");
    await addUrlsToCase(record.id, ["https://forum.example.com/thread/1"]);
    const source = reportedSource("forum.example.com")!;
    expect(source).toBeDefined();

    store.deactivateUser("user-erase");
    await store.hardDeleteDueUsers(new Date(Date.now() + 31 * 24 * 60 * 60_000));

    expect(store.cases.has(record.id)).toBe(false);
    expect(reportedSource("forum.example.com")).toBe(source);
    expect(source).toMatchObject({ origin: "REPORTED", enabled: true });
    // Nothing on the row or in its audit entry names her or her case.
    expect(JSON.stringify(source)).not.toContain(record.id);
    const entry = inMemoryAuditLog.find((e) => e.eventType === "CRAWL_SOURCE_REPORTED")!;
    expect(JSON.stringify(entry)).not.toContain("user-erase");
    expect(JSON.stringify(entry)).not.toContain(record.id);
  });
});

describe("GET /api/crawler/sources carries the new fields", () => {
  it("reports origin, hops and render for admin and reported sources, lowercased as the contract says", async () => {
    await createCrawlSource({ domain: "admin.example.com", pageBudget: 10, delayMs: 2000, enabled: true }, "admin-1");
    const record = await seedCase("user-1");
    await addUrlsToCase(record.id, ["https://reported.example.com/thread/1"]);
    await createCrawlSource({ domain: "disabled.example.com", pageBudget: 10, delayMs: 2000 }, "admin-1");

    const sources = await listEnabledCrawlSources();
    expect(sources).toEqual([
      { id: expect.any(String), kind: "site", domain: "admin.example.com", pageBudget: 10, delayMs: 2000, origin: "admin", hops: 0, render: "http" },
      { id: expect.any(String), kind: "site", domain: "reported.example.com", pageBudget: 2000, delayMs: 1500, origin: "reported", hops: 0, render: "http" },
    ]);
  });
});
