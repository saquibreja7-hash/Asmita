import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP8 (full-crawler spec): the address-free crawler stats on the memory
// path and through the admin route — sites by origin and state, pages
// crawled today (the budget window), the frontier queue, discovered sites
// today, matches awaiting review, the last run the app saw, page outcomes
// by code. The fixture rows deliberately contain address-like strings, and
// the tests prove none of them reaches the aggregates. Placeholder hosts
// only; nothing here fetches anything.

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlMemory, resetCrawlMemory, type MemoryCrawlFinding, type MemoryCrawlSource } from "@/lib/crawl-store";
import { createCrawlSource, ensureCrawlSourceForReportedHost } from "@/lib/crawl-sources";
import { claimCrawlPages, reportCrawlPages } from "@/lib/crawl-pages";
import { getCrawlerStats } from "@/lib/crawl-stats";
import { GET as getStatsRoute } from "@/app/api/admin/crawler/stats/route";

function admin(sub: string) {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole: "SUPER_ADMIN", mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

const T = new Date("2026-11-17T09:00:00.000Z");
const DAY_START = new Date("2026-11-17T00:00:00.000Z");
const at = (iso: string) => new Date(iso);
const T1 = at("2026-11-17T07:00:00.000Z");
const T2 = at("2026-11-17T08:00:00.000Z");
const T3 = at("2026-11-17T08:20:00.000Z");
const T4 = at("2026-11-17T08:30:00.000Z");
const T5 = at("2026-11-17T08:35:00.000Z");
const T6 = at("2026-11-17T08:50:00.000Z");
const T7 = at("2026-11-17T08:10:00.000Z");
const T8 = at("2026-11-17T08:15:00.000Z");

let srcA: string;

/** A DISCOVERED source, inserted directly so the test controls its fields. */
function addDiscoveredSource(id: string, domain: string, enabled: boolean, createdAt: Date) {
  const row: MemoryCrawlSource = {
    id, kind: "SITE", domain, pageBudget: 50, delayMs: 1500, enabled, approvedBy: null,
    origin: "DISCOVERED", hops: 1, discoveredFromId: "src-a", render: "HTTP",
    lastCrawledAt: null, pagesCrawled: 0, createdAt,
    pausedUntil: null, pauseReason: null, disabledReason: null,
  };
  crawlMemory().sources.set(id, row);
}

function addFinding(id: string, runId: string, status: MemoryCrawlFinding["reviewStatus"], firstSeenAt: Date, lastSeenAt: Date) {
  crawlMemory().findings.set(id, {
    id, caseId: "case-1", hashSubmissionId: "hs-1", crawlConsentId: null,
    // Address-like on purpose: the aggregates must never carry them out.
    pageUrlEncrypted: "https://secret-page.example.org/item", imageUrlEncrypted: "https://secret-image.example.org/item.jpg",
    urlDigest: `digest-${id}`, distance: 5, quality: 80, firstSeenAt, lastSeenAt,
    sourceId: srcA, runId, reviewStatus: status, reviewedById: null, reviewedAt: null,
    secondReviewedById: null, secondReviewedAt: null,
    labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
    labelSexual: false, labelSexualById: null, labelSexualAt: null,
    labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
  });
}

async function claimOne(sourceId: string, when: Date) {
  const batch = await claimCrawlPages(sourceId, 1, when);
  if (batch.length !== 1) throw new Error(`expected one claimed page at ${when.toISOString()}, got ${batch.length}`);
  return batch[0]!;
}

/** Drives the frontier so the world ends in a known state at time T. */
async function seedWorld() {
  // Admin source A: seed fetched, then one link per outcome.
  const a = await createCrawlSource({ domain: "a.example.org", pageBudget: 100, delayMs: 500, enabled: true }, "admin-1");
  if (!a.ok) throw new Error("source A");
  srcA = a.source.id;
  const seed = await claimOne(srcA, T1);
  await reportCrawlPages(srcA, "run-1", [{
    id: seed.id,
    status: "fetched",
    links: [1, 2, 3, 4, 5, 6].map((n) => ({ url: `https://a.example.org/p${n}`, kind: "page" as const })),
  }], T1);
  const x1 = await claimOne(srcA, T2);
  await reportCrawlPages(srcA, "run-1", [{ id: x1.id, status: "not_modified", etag: "v1", links: [] }], T2);
  const x2 = await claimOne(srcA, T3);
  await reportCrawlPages(srcA, "run-1", [{ id: x2.id, status: "gone", links: [] }], T3);
  const x3 = await claimOne(srcA, T4);
  await reportCrawlPages(srcA, "run-1", [{ id: x3.id, status: "error", links: [] }], T4);
  const x4 = await claimOne(srcA, T5);
  await reportCrawlPages(srcA, "run-1", [{ id: x4.id, status: "blocked", links: [] }], T5);
  await claimOne(srcA, T6); // claimed, never reported
  // The sixth link is never claimed: pending and due.

  // A disabled admin source: no pages ever.
  await createCrawlSource({ domain: "b.example.org", pageBudget: 10, delayMs: 500, enabled: false }, "admin-1");

  // A reported source, enabled from birth; its seed is claimed and not reported.
  await ensureCrawlSourceForReportedHost("r.example.org");
  const reported = [...crawlMemory().sources.values()].find((s) => s.domain === "r.example.org")!;
  await claimOne(reported.id, T6);

  // Discovered sources (WP5 creates these; only the stats read them today):
  // D1 today and enabled, D3 exactly at the UTC day start, D2 yesterday.
  addDiscoveredSource("src-d1", "d1.example.org", true, at("2026-11-17T08:00:00.000Z"));
  addDiscoveredSource("src-d3", "d3.example.org", false, DAY_START);
  addDiscoveredSource("src-d2", "d2.example.org", false, at("2026-11-16T08:00:00.000Z"));
  const d1seed = await claimOne("src-d1", T7);
  await reportCrawlPages("src-d1", "run-2", [{ id: d1seed.id, status: "fetched", links: [{ url: "https://d1.example.org/q1", kind: "page" }] }], T7);
  const d1a = await claimOne("src-d1", T8);
  for (let n = 0; n < 5; n++) {
    await reportCrawlPages("src-d1", "run-2", [{ id: d1a.id, status: "error", links: [] }], T8); // the fifth marks it dead
  }

  // Findings of two runs; run-new is the newest and holds three of them.
  addFinding("f1", "run-old", "CANDIDATE", T2, T2);
  addFinding("f2", "run-new", "CANDIDATE", T2, at("2026-11-17T08:30:00.000Z"));
  addFinding("f3", "run-new", "DISMISSED", at("2026-11-17T07:30:00.000Z"), T8);
  addFinding("f4", "run-new", "APPROVED", T2, at("2026-11-17T08:40:00.000Z"));
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getCrawlerStats, memory path", () => {
  beforeEach(seedWorld);

  it("aggregates sites by origin and state, and the day's counts", async () => {
    const stats = await getCrawlerStats(T);
    expect(stats.sites).toEqual({
      total: 6,
      enabled: 3, // A, the reported source, D1
      disabled: 3, // B, D2, D3
      byOrigin: {
        admin: { total: 2, enabled: 1, disabled: 1 },
        reported: { total: 1, enabled: 1, disabled: 0 },
        discovered: { total: 3, enabled: 1, disabled: 2 },
      },
    });
    // D1 (today) and D3 (exactly at the UTC day start) count; D2 (yesterday) does not.
    expect(stats.discoveredSitesToday).toBe(2);
    // Pages with a lastFetchedAt inside the UTC day: A's seed and x1 and x2, D1's seed.
    expect(stats.pagesCrawledToday).toBe(4);
    expect(stats.generatedAt).toBe(T.toISOString());
  });

  it("partitions the queue into pending, due, claimed, scheduled and dead", async () => {
    const stats = await getCrawlerStats(T);
    expect(stats.queue).toEqual({ live: 8, pending: 3, due: 1, claimed: 2, scheduled: 5, dead: 2 });
    // Live rows split exactly into the three disjoint buckets.
    expect(stats.queue.due + stats.queue.claimed + stats.queue.scheduled).toBe(stats.queue.live);
  });

  it("counts page outcomes by the code of their last report", async () => {
    const stats = await getCrawlerStats(T);
    expect(stats.pagesByStatus).toEqual({ pending: 3, fetched: 2, notModified: 1, gone: 1, blocked: 1, error: 1, dead: 1 });
  });

  it("counts matches awaiting review and the decided ones", async () => {
    const stats = await getCrawlerStats(T);
    expect(stats.findings).toEqual({ awaitingReview: 2, approved: 1, dismissed: 1, minorProtocol: 0, labels: { aiMade: 0, sexual: 0, possibleMinor: 0 } });
  });

  it("counts findings by analyst label and the minors protocol", async () => {
    // f1: all three labels, so it moves from CANDIDATE into the minors
    // protocol state. f3 is DISMISSED: the possible-minor label is recorded
    // on it, but a dismissed finding keeps its dismissal (it is out of the
    // adult flow already), so it does not move.
    const f1 = crawlMemory().findings.get("f1")!;
    Object.assign(f1, { labelAiMade: true, labelSexual: true, labelPossibleMinor: true, reviewStatus: "MINOR_PROTOCOL", minorProtocolBefore: "CANDIDATE" });
    Object.assign(crawlMemory().findings.get("f3")!, { labelAiMade: true, labelPossibleMinor: true });
    const stats = await getCrawlerStats(T);
    expect(stats.findings).toEqual({
      awaitingReview: 1, approved: 1, dismissed: 1,
      minorProtocol: 1,
      labels: { aiMade: 2, sexual: 1, possibleMinor: 2 },
    });
    // Counts by label only: no address, host, fingerprint or case reference.
    const text = JSON.stringify(stats.findings);
    for (const banned of ["example.org", "http", "secret", "case-"]) expect(text, banned).not.toContain(banned);
  });

  it("reports the last run the app can see and the last activity of any kind", async () => {
    const stats = await getCrawlerStats(T);
    expect(stats.lastRun).toEqual({
      // The newest finding (08:40) is later than the last page fetch (08:20)
      // and the last source visit (08:35), so it is the activity stamp.
      activityAt: "2026-11-17T08:40:00.000Z",
      findingRun: {
        runId: "run-new",
        firstSeenAt: "2026-11-17T07:30:00.000Z",
        lastSeenAt: "2026-11-17T08:40:00.000Z",
        findings: 3,
      },
    });
  });

  it("carries no address, host, fingerprint or case reference anywhere in the aggregates", async () => {
    const text = JSON.stringify(await getCrawlerStats(T));
    for (const banned of ["example.org", "example.com", "http", "secret", "case-", "digest-"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("answers an empty world with zeros and no run", async () => {
    resetCrawlMemory();
    const stats = await getCrawlerStats(T);
    expect(stats).toEqual({
      generatedAt: T.toISOString(),
      sites: { total: 0, enabled: 0, disabled: 0, byOrigin: { admin: { total: 0, enabled: 0, disabled: 0 }, reported: { total: 0, enabled: 0, disabled: 0 }, discovered: { total: 0, enabled: 0, disabled: 0 } } },
      pagesCrawledToday: 0,
      queue: { live: 0, pending: 0, due: 0, claimed: 0, scheduled: 0, dead: 0 },
      discoveredSitesToday: 0,
      findings: { awaitingReview: 0, approved: 0, dismissed: 0, minorProtocol: 0, labels: { aiMade: 0, sexual: 0, possibleMinor: 0 } },
      pagesByStatus: { pending: 0, fetched: 0, notModified: 0, gone: 0, blocked: 0, error: 0, dead: 0 },
      lastRun: { activityAt: null, findingRun: null },
    });
  });
});

describe("GET /api/admin/crawler/stats", () => {
  beforeEach(() => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("reviewer-1") as never);
  });

  it("refuses anyone without findings:review", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const response = await getStatsRoute();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "permission_denied" });
    expect(requireAdminPermission).toHaveBeenCalledWith("findings:review");
  });

  it("returns the aggregates, never an address, and is not cached", async () => {
    await seedWorld();
    const response = await getStatsRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      stats: {
        sites: { total: number; enabled: number; disabled: number; byOrigin: Record<string, { total: number; enabled: number; disabled: number }> };
        queue: { live: number; pending: number; dead: number };
        pagesByStatus: Record<string, number>;
        findings: { awaitingReview: number; approved: number; dismissed: number; minorProtocol: number; labels: { aiMade: number; sexual: number; possibleMinor: number } };
        lastRun: { findingRun: { runId: string } | null };
      };
      crawlerEnabled: boolean;
    };
    expect(body.crawlerEnabled).toBe(true);
    expect(body.stats.sites).toEqual({
      total: 6, enabled: 3, disabled: 3,
      byOrigin: {
        admin: { total: 2, enabled: 1, disabled: 1 },
        reported: { total: 1, enabled: 1, disabled: 0 },
        discovered: { total: 3, enabled: 1, disabled: 2 },
      },
    });
    // The route serves at the real clock, so only the clock-independent
    // splits are asserted here; the full numbers are covered above with a
    // fixed now (due, claimed, scheduled and the day counts move with time).
    expect(body.stats.queue).toMatchObject({ live: 8, pending: 3, dead: 2 });
    expect(body.stats.pagesByStatus).toEqual({ pending: 3, fetched: 2, notModified: 1, gone: 1, blocked: 1, error: 1, dead: 1 });
    expect(body.stats.findings).toEqual({ awaitingReview: 2, approved: 1, dismissed: 1, minorProtocol: 0, labels: { aiMade: 0, sexual: 0, possibleMinor: 0 } });
    expect(body.stats.lastRun.findingRun?.runId).toBe("run-new");
    const text = JSON.stringify(body);
    for (const banned of ["example.org", "http", "secret"]) expect(text, banned).not.toContain(banned);
  });

  it("reads with the crawler switched off, and says so", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    const response = await getStatsRoute();
    expect(response.status).toBe(200);
    expect((await response.json() as { crawlerEnabled: boolean }).crawlerEnabled).toBe(false);
  });
});
