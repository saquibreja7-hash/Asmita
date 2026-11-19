import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP5 (full-crawler spec): the app applies the discovery rules to hosts the
// crawler reports from in-scope pages — a DISCOVERED source one hop deeper
// than its parent, auto-enabled within the hop limit and the daily new-site
// cap, stored disabled beyond it; a match promotes it; three budget-spent
// days without a match pause it for 30 days; the admin page fields exist.
// Memory path (no DATABASE_URL). Placeholder hosts only.

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory, sourceDayKey, type MemoryCrawlPage } from "@/lib/crawl-store";
import {
  DISCOVERY_PAUSE_MS,
  PAUSE_REASON_NO_MATCH,
  recordCrawlDiscoveries,
  sweepDiscoveredCrawlSources,
} from "@/lib/crawl-discoveries";
import { claimCrawlPages, reportCrawlPages } from "@/lib/crawl-pages";
import { createCrawlSource, listCrawlSources, listEnabledCrawlSources, updateCrawlSource } from "@/lib/crawl-sources";
import { recordCrawlConsent } from "@/lib/crawl-consent";
import { recordCrawlFindings } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";
import { issueCrawlServiceKey } from "@/lib/crawler-auth";
import { POST as postDiscoveries } from "@/app/api/crawler/discoveries/route";
import { sha256 } from "@/lib/hash";

const NOW = new Date("2026-11-17T09:30:00Z");
const DAY = 24 * 60 * 60 * 1000;

function sourceByDomain(domain: string) {
  return [...crawlMemory().sources.values()].find((s) => s.domain === domain);
}

type SourceInput = Parameters<typeof createCrawlSource>[0];

async function adminSource(domain: string, over: Partial<SourceInput> = {}) {
  const result = await createCrawlSource({ domain, pageBudget: 50, delayMs: 500, enabled: true, ...over }, "admin-1");
  expect(result.ok).toBe(true);
  return result.ok ? result.source : undefined;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => vi.unstubAllEnvs());

describe("the discovery rules (recordCrawlDiscoveries)", () => {
  it("creates a DISCOVERED source one hop deeper than its parent, enabled, with the discovered budget", async () => {
    const parent = (await adminSource("seed.example.org"))!;
    const { accepted } = await recordCrawlDiscoveries(parent.id, "run-1", ["linked.example.org"], NOW, "key-1");
    expect(accepted).toBe(1);
    const source = sourceByDomain("linked.example.org")!;
    expect(source).toMatchObject({
      kind: "SITE",
      origin: "DISCOVERED",
      hops: 1,
      discoveredFromId: parent.id,
      enabled: true,
      approvedBy: null,
      pageBudget: 200,
      delayMs: 1500,
      pauseReason: null,
      pausedUntil: null,
      disabledReason: null,
    });
  });

  it("walks A -> B -> C -> D: B and C are enabled, D is stored disabled beyond the hop limit", async () => {
    vi.stubEnv("CRAWLER_MAX_DISCOVERY_HOPS", "2");
    const a = (await adminSource("a.example.org"))!;
    expect((await recordCrawlDiscoveries(a.id, "run-1", ["b.example.org"], NOW)).accepted).toBe(1);
    const b = sourceByDomain("b.example.org")!;
    expect(b).toMatchObject({ origin: "DISCOVERED", hops: 1, enabled: true });

    expect((await recordCrawlDiscoveries(b.id, "run-1", ["c.example.org"], NOW)).accepted).toBe(1);
    const c = sourceByDomain("c.example.org")!;
    expect(c).toMatchObject({ origin: "DISCOVERED", hops: 2, enabled: true, discoveredFromId: b.id });

    expect((await recordCrawlDiscoveries(c.id, "run-1", ["d.example.org"], NOW)).accepted).toBe(1);
    const d = sourceByDomain("d.example.org")!;
    expect(d).toMatchObject({ origin: "DISCOVERED", hops: 3, enabled: false, disabledReason: "max_hops" });
    // Stored disabled means the frontier hands out nothing and the crawler's
    // source list never shows it.
    expect(await claimCrawlPages(d.id, 10, NOW)).toEqual([]);
    expect((await listEnabledCrawlSources()).map((s) => s.domain)).not.toContain("d.example.org");
  });

  it("skips never-crawl hosts (built-in list, blocked table and their subdomains) and hosts that are already sources", async () => {
    crawlMemory().blockedHosts.set("blocked.example.org", { id: "bh-1", host: "blocked.example.org", reason: "owner request", addedBy: "admin-1", createdAt: NOW });
    const parent = (await adminSource("seed.example.org"))!;
    const { accepted } = await recordCrawlDiscoveries(
      parent.id,
      "run-1",
      ["www.instagram.com", "deep.facebook.com", "deep.forum.blocked.example.org", "blocked.example.org", "seed.example.org", "not a host", "10.0.0.1"],
      NOW,
    );
    expect(accepted).toBe(0);
    expect(crawlMemory().sources.size).toBe(1);
    // A repeat host within one report creates one source only.
    expect((await recordCrawlDiscoveries(parent.id, "run-1", ["fine.example.org", "fine.example.org"], NOW)).accepted).toBe(1);
  });

  it("auto-enables at most CRAWLER_MAX_NEW_SITES_PER_DAY per UTC day; the rest are stored disabled with the reason", async () => {
    vi.stubEnv("CRAWLER_MAX_NEW_SITES_PER_DAY", "2");
    const parent = (await adminSource("seed.example.org"))!;
    const first = await recordCrawlDiscoveries(parent.id, "run-1", ["one.example.org", "two.example.org", "three.example.org"], NOW);
    expect(first.accepted).toBe(3); // stored, enabled or not
    expect(sourceByDomain("one.example.org")).toMatchObject({ enabled: true, disabledReason: null });
    expect(sourceByDomain("two.example.org")).toMatchObject({ enabled: true, disabledReason: null });
    expect(sourceByDomain("three.example.org")).toMatchObject({ enabled: false, disabledReason: "daily_cap" });

    // The same day: nothing more is auto-enabled.
    const second = await recordCrawlDiscoveries(parent.id, "run-1", ["four.example.org"], NOW);
    expect(second.accepted).toBe(1);
    expect(sourceByDomain("four.example.org")).toMatchObject({ enabled: false, disabledReason: "daily_cap" });

    // The next day the cap is fresh again.
    const nextDay = await recordCrawlDiscoveries(parent.id, "run-1", ["five.example.org"], new Date(NOW.getTime() + DAY));
    expect(nextDay.accepted).toBe(1);
    expect(sourceByDomain("five.example.org")).toMatchObject({ enabled: true, disabledReason: null });
  });

  it("requires the reporting parent to exist and be enabled", async () => {
    expect((await recordCrawlDiscoveries("no-such-source", "run-1", ["x.example.org"], NOW)).accepted).toBe(0);
    const parent = (await adminSource("seed.example.org"))!;
    await updateCrawlSource({ id: parent.id, enabled: false }, "admin-1");
    expect((await recordCrawlDiscoveries(parent.id, "run-1", ["x.example.org"], NOW)).accepted).toBe(0);
    expect(sourceByDomain("x.example.org")).toBeUndefined();
  });

  it("audits one CRAWL_SOURCE_DISCOVERED per created source, with the service key as the actor and no link or case", async () => {
    const parent = (await adminSource("seed.example.org"))!;
    await recordCrawlDiscoveries(parent.id, "run-42", ["linked.example.org"], NOW, "key-7");
    const entries = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_DISCOVERED");
    expect(entries).toHaveLength(1);
    const source = sourceByDomain("linked.example.org")!;
    expect(entries[0]).toMatchObject({
      entityType: "CrawlSource", entityId: source.id, actorId: "crawler:key-7",
      data: { action: "crawl_source_discovered", domain: "linked.example.org", hops: 1, enabled: true, runId: "run-42" },
    });
    // A skipped host writes nothing.
    await recordCrawlDiscoveries(parent.id, "run-42", ["instagram.com"], NOW, "key-7");
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_DISCOVERED")).toHaveLength(1);
  });
});

describe("a match promotes a discovered site", () => {
  async function discoveredWithFinding(pageHost: string) {
    const record = await store.createCase("user-1");
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("c".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    expect((await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" })).ok).toBe(true);
    const parent = (await adminSource("seed.example.org"))!;
    const { accepted } = await recordCrawlDiscoveries(parent.id, "run-1", [pageHost], NOW);
    expect(accepted).toBe(1);
    const source = sourceByDomain(pageHost)!;
    const ingest = await recordCrawlFindings({
      runId: "run-1",
      findings: [{
        fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!,
        pageUrl: `https://${pageHost}/thread/1`, imageUrl: "https://cdn.example.net/x.jpg",
        distance: 4, quality: 90, observedAt: "2026-11-17T09:00:00Z", sourceId: source.id,
      }],
    }, "key-1");
    expect(ingest.results).toEqual([{ status: "accepted" }]);
    return source;
  }

  it("resets hops to 0 and raises the budget to the reported budget, idempotently", async () => {
    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "3000");
    await discoveredWithFinding("promoted.example.org");
    const after = sourceByDomain("promoted.example.org")!;
    expect(after).toMatchObject({ origin: "DISCOVERED", hops: 0, pageBudget: 3000, enabled: true });
    const promoted = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_PROMOTED");
    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({ entityId: after.id, actorId: "crawler:key-1", data: { action: "crawl_source_promoted", domain: "promoted.example.org", pageBudget: 3000 } });

    // A second finding under it changes nothing and audits nothing new.
    const again = await recordCrawlFindings({
      runId: "run-2",
      findings: [{
        fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!,
        pageUrl: "https://promoted.example.org/thread/2", imageUrl: "https://cdn.example.net/y.jpg",
        distance: 5, quality: 90, observedAt: "2026-11-17T09:05:00Z", sourceId: after.id,
      }],
    }, "key-1");
    expect(again.results).toEqual([{ status: "accepted" }]);
    expect(sourceByDomain("promoted.example.org")).toMatchObject({ hops: 0, pageBudget: 3000 });
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_PROMOTED")).toHaveLength(1);
  });

  it("never touches an admin source an admin set higher", async () => {
    const record = await store.createCase("user-2");
    crawlMemory().fingerprints.set("hs-2", { id: "hs-2", caseId: record.id, hashEncrypted: encryptField("d".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    expect((await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-2"], templateId: "t", templateDigest: "d" })).ok).toBe(true);
    const admin = (await adminSource("admin.example.org", { pageBudget: 9000 }))!;
    await recordCrawlFindings({
      runId: "run-1",
      findings: [{
        fingerprintId: crawlMemory().fingerprints.get("hs-2")!.crawlPoolId!,
        pageUrl: "https://admin.example.org/t/1", imageUrl: "https://cdn.example.net/x.jpg",
        distance: 4, quality: 90, observedAt: "2026-11-17T09:00:00Z", sourceId: admin.id,
      }],
    }, "key-1");
    expect(sourceByDomain("admin.example.org")).toMatchObject({ origin: "ADMIN", hops: 0, pageBudget: 9000 });
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_PROMOTED")).toHaveLength(0);
  });
});

describe("the unproductive-site pause sweep", () => {
  function seedFetchedDay(sourceId: string, at: Date, pages: number) {
    for (let i = 0; i < pages; i += 1) {
      const row: MemoryCrawlPage = {
        id: `page-${sourceId}-${at.toISOString()}-${i}`,
        sourceId,
        urlEncrypted: encryptField(`https://x.example.org/${at.toISOString()}/${i}`),
        urlDigest: sha256(`${sourceId}\u0000${at.toISOString()}\u0000${i}`),
        depth: 0, kind: "PAGE", etag: null, lastModified: null, status: "FETCHED",
        claimedUntil: null, lastFetchedAt: at, nextDueAt: new Date(at.getTime() + DAY), failCount: 0, createdAt: at,
      };
      crawlMemory().pages.set(row.id, row);
    }
    // The per-day counter the frontier report keeps for those fetches
    // (review fix: the pause reads it, not lastFetchedAt).
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const key = sourceDayKey(sourceId, day);
    crawlMemory().sourceDays.set(key, (crawlMemory().sourceDays.get(key) ?? 0) + pages);
  }

  async function discoveredSite(domain: string, budget: number) {
    const parent = sourceByDomain("seed.example.org") ?? (await adminSource("seed.example.org"))!;
    const { accepted } = await recordCrawlDiscoveries(parent.id, "run-1", [domain], NOW);
    expect(accepted).toBe(1);
    const source = sourceByDomain(domain)!;
    source.pageBudget = budget;
    return source;
  }

  const dayStart = (offset: number) => new Date(Date.UTC(2026, 10, 17) - offset * DAY);

  it("pauses a site whose budget was spent three days running with no match, for 30 days", async () => {
    const source = await discoveredSite("spent.example.org", 2);
    seedFetchedDay(source.id, dayStart(0), 2);
    seedFetchedDay(source.id, dayStart(1), 2);
    seedFetchedDay(source.id, dayStart(2), 2);

    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 1, resumed: 0 });
    const after = sourceByDomain("spent.example.org")!;
    expect(after.enabled).toBe(false);
    expect(after.pauseReason).toBe(PAUSE_REASON_NO_MATCH);
    expect(after.pausedUntil!.getTime() - NOW.getTime()).toBe(DISCOVERY_PAUSE_MS);
    // Paused means off: no claims, and the crawler's source list omits it.
    expect(await claimCrawlPages(after.id, 10, NOW)).toEqual([]);
    expect((await listEnabledCrawlSources()).map((s) => s.domain)).not.toContain("spent.example.org");
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_PAUSED")).toHaveLength(1);
  });

  it("pauses a site that refetched the same pages every day: revisits do not hide earlier days (review fix)", async () => {
    const source = await discoveredSite("revisit.example.org", 2);
    // Day 1: seed plus one link, both fetched; days 2 and 3 revisit the same two pages.
    const first = await claimCrawlPages(source.id, 2, dayStart(2));
    await reportCrawlPages(source.id, "run-1", [{ id: first[0]!.id, status: "fetched", links: [{ url: "https://revisit.example.org/a", kind: "page" }] }], new Date(dayStart(2).getTime() + 60_000));
    const second = await claimCrawlPages(source.id, 2, new Date(dayStart(2).getTime() + 120_000));
    await reportCrawlPages(source.id, "run-1", second.map((u) => ({ id: u.id, status: "fetched" as const, links: [] })), new Date(dayStart(2).getTime() + 180_000));
    for (const back of [1, 0]) {
      const at = new Date(dayStart(back).getTime() + (10 - back * 5) * 60_000); // each visit 24 h + after the last
      const batch = await claimCrawlPages(source.id, 2, at);
      expect(batch).toHaveLength(2);
      await reportCrawlPages(source.id, "run-1", batch.map((u) => ({ id: u.id, status: "fetched" as const, links: [] })), new Date(at.getTime() + 60_000));
    }
    // Every page's lastFetchedAt is today now, yet each day spent its budget.
    expect([...crawlMemory().pages.values()].filter((p) => p.sourceId === source.id).every((p) => p.lastFetchedAt! >= dayStart(0))).toBe(true);
    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 1, resumed: 0 });
    expect(sourceByDomain("revisit.example.org")).toMatchObject({ enabled: false, pauseReason: PAUSE_REASON_NO_MATCH });
  });

  it("prunes per-day counters older than a week", async () => {
    const source = await discoveredSite("old.example.org", 2);
    crawlMemory().sourceDays.set(sourceDayKey(source.id, dayStart(8)), 5);
    crawlMemory().sourceDays.set(sourceDayKey(source.id, dayStart(1)), 1);
    await sweepDiscoveredCrawlSources(NOW);
    expect(crawlMemory().sourceDays.has(sourceDayKey(source.id, dayStart(8)))).toBe(false);
    expect(crawlMemory().sourceDays.get(sourceDayKey(source.id, dayStart(1)))).toBe(1);
  });

  it("does not pause a site with a match in the window, or one that spent only two days", async () => {
    const matched = await discoveredSite("matched.example.org", 2);
    seedFetchedDay(matched.id, dayStart(0), 2);
    seedFetchedDay(matched.id, dayStart(1), 2);
    seedFetchedDay(matched.id, dayStart(2), 2);
    crawlMemory().findings.set("f-1", {
      id: "f-1", caseId: "case-1", hashSubmissionId: "hs-1", crawlConsentId: null,
      pageUrlEncrypted: "", imageUrlEncrypted: "", urlDigest: null, distance: 4, quality: 90,
      firstSeenAt: new Date(dayStart(1).getTime() + 3_600_000), lastSeenAt: new Date(dayStart(1).getTime() + 3_600_000),
      sourceId: matched.id, runId: "run-1", reviewStatus: "CANDIDATE", reviewedById: null, reviewedAt: null,
      secondReviewedById: null, secondReviewedAt: null,
      labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
      labelSexual: false, labelSexualById: null, labelSexualAt: null,
      labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
      labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
      minorProtocolBefore: null,
    });

    const short = await discoveredSite("short.example.org", 2);
    seedFetchedDay(short.id, dayStart(0), 2);
    seedFetchedDay(short.id, dayStart(1), 2);

    const result = await sweepDiscoveredCrawlSources(NOW);
    expect(result).toEqual({ paused: 0, resumed: 0 });
    expect([...crawlMemory().sources.values()].every((s) => s.enabled)).toBe(true);
  });

  it("resumes an expired pause and cannot immediately re-pause it", async () => {
    const source = await discoveredSite("spent.example.org", 2);
    seedFetchedDay(source.id, dayStart(0), 2);
    seedFetchedDay(source.id, dayStart(1), 2);
    seedFetchedDay(source.id, dayStart(2), 2);
    await sweepDiscoveredCrawlSources(NOW);
    expect(sourceByDomain("spent.example.org")!.enabled).toBe(false);

    const later = new Date(NOW.getTime() + DISCOVERY_PAUSE_MS + 60_000);
    const resumed = await sweepDiscoveredCrawlSources(later);
    expect(resumed).toEqual({ paused: 0, resumed: 1 });
    const after = sourceByDomain("spent.example.org")!;
    expect(after).toMatchObject({ enabled: true, pauseReason: null, pausedUntil: null });
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_RESUMED")).toHaveLength(1);
  });

  it("an admin switching a paused or stored-disabled site on clears the automatic state", async () => {
    const source = await discoveredSite("spent.example.org", 2);
    seedFetchedDay(source.id, dayStart(0), 2);
    seedFetchedDay(source.id, dayStart(1), 2);
    seedFetchedDay(source.id, dayStart(2), 2);
    await sweepDiscoveredCrawlSources(NOW);
    const paused = sourceByDomain("spent.example.org")!;

    await updateCrawlSource({ id: paused.id, enabled: true }, "admin-9");
    expect(sourceByDomain("spent.example.org")).toMatchObject({ enabled: true, pauseReason: null, pausedUntil: null });
    // A later sweep does not touch the admin's decision.
    expect(await sweepDiscoveredCrawlSources(new Date(NOW.getTime() + DISCOVERY_PAUSE_MS + 60_000))).toEqual({ paused: 0, resumed: 0 });

    // The same clearing applies to the reason a site was stored disabled.
    vi.stubEnv("CRAWLER_MAX_DISCOVERY_HOPS", "0");
    const parent = sourceByDomain("seed.example.org")!;
    await recordCrawlDiscoveries(parent.id, "run-2", ["deep.example.org"], NOW);
    const stored = sourceByDomain("deep.example.org")!;
    expect(stored.disabledReason).toBe("max_hops");
    await updateCrawlSource({ id: stored.id, enabled: true }, "admin-9");
    expect(sourceByDomain("deep.example.org")).toMatchObject({ enabled: true, disabledReason: null });
  });
});

describe("an admin's switch overrides an automatic pause for good (review fix)", () => {
  it("an admin switching a paused discovered site off clears the pause, so the sweep never resumes it", async () => {
    const parent = await adminSource("seed.example.org");
    await recordCrawlDiscoveries(parent!.id, "run-1", ["paused.example.org"], NOW);
    const source = sourceByDomain("paused.example.org")!;
    Object.assign(source, { enabled: false, pausedUntil: new Date(NOW.getTime() + DISCOVERY_PAUSE_MS), pauseReason: PAUSE_REASON_NO_MATCH });

    const result = await updateCrawlSource({ id: source.id, enabled: false }, "admin-9");
    expect(result.ok).toBe(true);
    expect(sourceByDomain("paused.example.org")).toMatchObject({ enabled: false, pausedUntil: null, pauseReason: null });

    const later = new Date(NOW.getTime() + DISCOVERY_PAUSE_MS + 60_000);
    expect(await sweepDiscoveredCrawlSources(later)).toEqual({ paused: 0, resumed: 0 });
    expect(sourceByDomain("paused.example.org")!.enabled).toBe(false);
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_SOURCE_RESUMED")).toHaveLength(0);
  });

  it("the sweep never resumes a row that is enabled even if pause fields linger", async () => {
    const parent = await adminSource("seed.example.org");
    await recordCrawlDiscoveries(parent!.id, "run-1", ["lingering.example.org"], NOW);
    const source = sourceByDomain("lingering.example.org")!;
    Object.assign(source, { enabled: true, pausedUntil: new Date(NOW.getTime() - 60_000), pauseReason: PAUSE_REASON_NO_MATCH });
    expect((await sweepDiscoveredCrawlSources(NOW)).resumed).toBe(0);
  });

  it("a budget-only change leaves an automatic pause in place", async () => {
    const parent = await adminSource("seed.example.org");
    await recordCrawlDiscoveries(parent!.id, "run-1", ["budget.example.org"], NOW);
    const source = sourceByDomain("budget.example.org")!;
    const until = new Date(NOW.getTime() + DISCOVERY_PAUSE_MS);
    Object.assign(source, { enabled: false, pausedUntil: until, pauseReason: PAUSE_REASON_NO_MATCH });
    await updateCrawlSource({ id: source.id, pageBudget: 30 }, "admin-9");
    expect(sourceByDomain("budget.example.org")).toMatchObject({ enabled: false, pausedUntil: until, pauseReason: PAUSE_REASON_NO_MATCH });
  });
});

describe("the admin page fields (WP5)", () => {
  it("listCrawlSources resolves a discovered site's parent domain and carries the pause state", async () => {
    const parent = (await adminSource("seed.example.org"))!;
    await recordCrawlDiscoveries(parent.id, "run-1", ["linked.example.org"], NOW);
    const views = await listCrawlSources();
    const linked = views.find((v) => v.domain === "linked.example.org")!;
    expect(linked).toMatchObject({
      origin: "DISCOVERED", hops: 1, discoveredFromId: parent.id,
      discoveredFromDomain: "seed.example.org",
      pausedUntil: null, pauseReason: null, disabledReason: null,
    });
    const seed = views.find((v) => v.domain === "seed.example.org")!;
    expect(seed.discoveredFromDomain).toBeNull();
  });

  it("a discovered site whose parent is gone still lists, with no parent domain", async () => {
    const parent = (await adminSource("seed.example.org"))!;
    await recordCrawlDiscoveries(parent.id, "run-1", ["orphan.example.org"], NOW);
    crawlMemory().sources.delete(parent.id);
    const orphan = (await listCrawlSources()).find((v) => v.domain === "orphan.example.org")!;
    expect(orphan.discoveredFromId).toBe(parent.id);
    expect(orphan.discoveredFromDomain).toBeNull();
  });
});

describe("POST /api/crawler/discoveries", () => {
  let key: string;

  beforeEach(async () => {
    key = (await issueCrawlServiceKey("test")).key;
  });

  function crawlerRequest(body?: unknown, auth?: string | null) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const bearer = auth === undefined ? `Bearer ${key}` : auth;
    if (bearer) headers.authorization = bearer;
    return new Request("https://asmita.test/api/crawler/discoveries", {
      method: "POST",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("answers 503 while ENABLE_CRAWLER is off", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await postDiscoveries(crawlerRequest({ sourceId: "s", runId: "r", hosts: [] }))).status).toBe(503);
  });

  it("answers 401 without the service key, and 400 for a malformed body", async () => {
    expect((await postDiscoveries(crawlerRequest({ sourceId: "s", runId: "r", hosts: [] }, null))).status).toBe(401);
    expect((await postDiscoveries(crawlerRequest({ sourceId: "s", runId: "r", hosts: ["x.example.org"], extra: 1 }))).status).toBe(400);
    expect((await postDiscoveries(crawlerRequest({ sourceId: "s", runId: "r" }))).status).toBe(400);
    const tooMany = Array.from({ length: 201 }, (_, i) => `h${i}.example.org`);
    expect((await postDiscoveries(crawlerRequest({ sourceId: "s", runId: "r", hosts: tooMany }))).status).toBe(400);
  });

  it("applies the rules and answers with the accepted count", async () => {
    const parent = (await adminSource("seed.example.org"))!;
    const response = await postDiscoveries(crawlerRequest({ sourceId: parent.id, runId: "run-1", hosts: ["linked.example.org", "instagram.com"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(sourceByDomain("linked.example.org")).toMatchObject({ origin: "DISCOVERED", hops: 1 });
    expect(sourceByDomain("instagram.com")).toBeUndefined();
  });
});
