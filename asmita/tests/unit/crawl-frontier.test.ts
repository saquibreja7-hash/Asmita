import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The app-backed frontier (full-crawler spec WP3) on the memory path: seeds,
// claims, reports, scheduling, budget, retention — plus the two service
// routes. Every URL is a placeholder; nothing here fetches anything.

import { resetCrawlMemory, crawlMemory } from "@/lib/crawl-store";
import { issueCrawlServiceKey } from "@/lib/crawler-auth";
import { createCrawlSource } from "@/lib/crawl-sources";
import {
  claimCrawlPages,
  crawlPageDigest,
  crawlPageKey,
  FRONTIER_ALIASES_PER_PAGE_MAX,
  FRONTIER_CLAIM_MS,
  FRONTIER_MAX_INTERVAL_MS,
  FRONTIER_PRIORITY_DEFAULT,
  FRONTIER_PRIORITY_LASTMOD,
  FRONTIER_REVISIT_MS,
  linkPriority,
  planNextVisit,
  reportCrawlPages,
} from "@/lib/crawl-pages";
import { purgeExpiredCrawlPages, URL_RETENTION_MS } from "@/lib/url-retention";
import { pageKey } from "@/lib/crawl-page-key";
import { encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { POST as postClaim } from "@/app/api/crawler/frontier/claim/route";
import { POST as postReport } from "@/app/api/crawler/frontier/report/route";

let key: string;
let sourceId: string;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function crawlerRequest(path: string, init: { method?: string; body?: unknown; auth?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = init.auth === undefined ? `Bearer ${key}` : init.auth;
  if (auth) headers.authorization = auth;
  return new Request(`https://asmita.test/api/crawler/${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) } : {}),
  });
}

async function createSource(domain: string, pageBudget: number, enabled = true) {
  const created = await createCrawlSource({ domain, pageBudget, delayMs: 0, enabled }, "admin-1");
  if (!created.ok) throw new Error("source");
  return created.source.id;
}

const nowAt = (offsetMs: number) => new Date(Date.UTC(2026, 10, 17, 9, 0, 0) + offsetMs);

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  ({ key } = await issueCrawlServiceKey("test crawler"));
  sourceId = await createSource("forum.example.com", 100);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("claim", () => {
  it("creates the seed row on the first claim and claims it for 30 minutes", async () => {
    const now = nowAt(0);
    const urls = await claimCrawlPages(sourceId, 10, now);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatchObject({ url: "https://forum.example.com/", depth: 0 });
    const row = crawlMemory().pages.get(urls[0]!.id)!;
    expect(row.claimedUntil).toEqual(new Date(now.getTime() + FRONTIER_CLAIM_MS));
    expect(row.urlEncrypted).not.toContain("forum.example.com"); // encrypted at rest
    expect(crawlPageDigest(sourceId, "https://forum.example.com/")).toBe(row.urlDigest);
    // A second claim in the same window gets nothing: the row is claimed.
    expect(await claimCrawlPages(sourceId, 10, nowAt(1 * MIN))).toEqual([]);
  });

  it("does not seed twice: later claims see the row it created", async () => {
    await claimCrawlPages(sourceId, 10, nowAt(0));
    const rows = [...crawlMemory().pages.values()];
    expect(rows).toHaveLength(1);
    await claimCrawlPages(sourceId, 10, nowAt(1 * MIN));
    expect([...crawlMemory().pages.values()]).toHaveLength(1);
  });

  it("a killed run loses only its claimed batch: the rows become due again after 30 minutes", async () => {
    // Run 1 claims and dies without reporting.
    const claimed = await claimCrawlPages(sourceId, 10, nowAt(0));
    expect(claimed).toHaveLength(1);
    // 29 minutes later: still nothing to do.
    expect(await claimCrawlPages(sourceId, 10, nowAt(29 * MIN))).toEqual([]);
    // 31 minutes later: the lost batch is due again, same row.
    const again = await claimCrawlPages(sourceId, 10, nowAt(31 * MIN));
    expect(again.map((u) => u.id)).toEqual(claimed.map((u) => u.id));
  });

  it("claims nothing for an unknown or disabled source", async () => {
    expect(await claimCrawlPages("src-missing", 10, nowAt(0))).toEqual([]);
    const disabled = await createSource("down.example.com", 10, false);
    expect(await claimCrawlPages(disabled, 10, nowAt(0))).toEqual([]);
    expect([...crawlMemory().pages.values()].filter((p) => p.sourceId === disabled)).toHaveLength(0);
  });

  it("caps a claim at the source's remaining budget for the day", async () => {
    const budget = await createSource("small.example.com", 3);
    const seed = await claimCrawlPages(budget, 10, nowAt(0));
    const report = await reportCrawlPages(budget, "run-1", [{ id: seed[0]!.id, status: "fetched", links: [
      { url: "https://small.example.com/a", kind: "page" },
      { url: "https://small.example.com/b", kind: "page" },
      { url: "https://small.example.com/c", kind: "page" },
      { url: "https://small.example.com/d", kind: "page" },
    ] }], nowAt(1 * MIN));
    expect(report.accepted).toBe(1);
    // Budget 3, one page fetched today: two more may go out, the rest waits.
    const batch = await claimCrawlPages(budget, 10, nowAt(2 * MIN));
    expect(batch).toHaveLength(2);
    await reportCrawlPages(budget, "run-1", batch.map((u) => ({ id: u.id, status: "fetched", links: [] })), nowAt(3 * MIN));
    expect(await claimCrawlPages(budget, 10, nowAt(4 * MIN))).toEqual([]);
    // Tomorrow the source hands out URLs again.
    expect((await claimCrawlPages(budget, 10, nowAt(DAY + 5 * MIN))).length).toBeGreaterThan(0);
  });

  it("counts rows already out with another crawler against the budget (review fix)", async () => {
    const budget = await createSource("shared.example.com", 4);
    const seed = await claimCrawlPages(budget, 10, nowAt(0));
    await reportCrawlPages(budget, "run-1", [{ id: seed[0]!.id, status: "fetched", links:
      ["a", "b", "c", "d", "e", "f"].map((path) => ({ url: `https://shared.example.com/${path}`, kind: "page" as const })) }], nowAt(1 * MIN));
    // Budget 4, one fetched: three may go out today in total, across processes.
    const first = await claimCrawlPages(budget, 2, nowAt(2 * MIN)); // crawler A
    expect(first).toHaveLength(2);
    const second = await claimCrawlPages(budget, 10, nowAt(3 * MIN)); // crawler B
    expect(second).toHaveLength(1);
    expect(await claimCrawlPages(budget, 10, nowAt(4 * MIN))).toEqual([]);
    // A's batch is reported: still nothing more (fetched 3 + B's 1 out = 4).
    await reportCrawlPages(budget, "run-a", first.map((u) => ({ id: u.id, status: "fetched", links: [] })), nowAt(5 * MIN));
    expect(await claimCrawlPages(budget, 10, nowAt(6 * MIN))).toEqual([]);
    // B is killed: once its claim expires its slot is free again.
    const afterExpiry = await claimCrawlPages(budget, 10, nowAt(3 * MIN + 30 * MIN + 1));
    expect(afterExpiry).toHaveLength(1);
  });
});

describe("report", () => {
  let claimed: Awaited<ReturnType<typeof claimCrawlPages>>;

  beforeEach(async () => {
    claimed = await claimCrawlPages(sourceId, 10, nowAt(0));
  });

  it("stores new in-scope links only, deduplicated by the keyed digest, at parent depth + 1", async () => {
    const seedId = claimed[0]!.id;
    const { accepted } = await reportCrawlPages(sourceId, "run-1", [
      {
        id: seedId,
        status: "fetched",
        links: [
          { url: "https://forum.example.com/thread/1", kind: "page" },
          { url: "https://forum.example.com/thread/1?utm_source=x", kind: "page" }, // same page, tracking param
          { url: "https://sub.forum.example.com/post/2", kind: "page" }, // subdomain is in scope
          { url: "https://other.example.org/page", kind: "page" }, // off-site: never stored
          { url: "https://forum.example.com:8443/x", kind: "page" }, // port: refused
          { url: "https://user:pw@forum.example.com/x", kind: "page" }, // credentials: refused
          { url: "ftp://forum.example.com/x", kind: "page" }, // scheme: refused
          { url: "javascript:void(0)", kind: "page" }, // not a URL: refused
        ],
      },
    ], nowAt(1 * MIN));
    expect(accepted).toBe(1);
    const rows = [...crawlMemory().pages.values()];
    expect(rows.filter((r) => r.id !== seedId)).toHaveLength(2); // thread/1 and post/2 only
    const thread = rows.find((r) => r.urlDigest === crawlPageDigest(sourceId, "https://forum.example.com/thread/1"))!;
    const sub = rows.find((r) => r.urlDigest === crawlPageDigest(sourceId, "https://sub.forum.example.com/post/2"))!;
    expect(thread.depth).toBe(1); // seed depth 0 + 1
    expect(sub.depth).toBe(1);
    expect(thread.kind).toBe("PAGE");
    // Every stored URL is encrypted: no plaintext address anywhere in the row.
    expect(rows.every((r) => !r.urlEncrypted.includes("forum.example.com"))).toBe(true);
    // The tracking-param twin was deduplicated: exactly one row for the page.
    expect(rows.filter((r) => r.urlDigest === thread.urlDigest)).toHaveLength(1);
  });

  it("schedules a fetched page 24 h ahead and clears the claim; the source counters move", async () => {
    const seedId = claimed[0]!.id;
    const before = crawlMemory().sources.get(sourceId)!;
    const pagesBefore = before.pagesCrawled;
    await reportCrawlPages(sourceId, "run-1", [
      { id: seedId, status: "fetched", etag: "v1", lastModified: "Tue, 17 Nov 2026 09:00:00 GMT", links: [] },
    ], nowAt(5 * MIN));
    const row = crawlMemory().pages.get(seedId)!;
    expect(row.status).toBe("FETCHED");
    expect(row.nextDueAt.getTime() - nowAt(5 * MIN).getTime()).toBe(FRONTIER_REVISIT_MS);
    expect(row.claimedUntil).toBeNull();
    expect(row.etag).toBe("v1");
    expect(row.lastFetchedAt).toEqual(nowAt(5 * MIN));
    expect(crawlMemory().sources.get(sourceId)!.pagesCrawled).toBe(pagesBefore + 1);
    expect(crawlMemory().sources.get(sourceId)!.lastCrawledAt).toEqual(nowAt(5 * MIN));
    // Not due again for 24 h, so a second run claims nothing.
    expect(await claimCrawlPages(sourceId, 10, nowAt(6 * MIN))).toEqual([]);
  });

  it("doubles the interval after not_modified, up to the 14-day cap", async () => {
    const seedId = claimed[0]!.id;
    const t0 = nowAt(0);
    // First visit fetched: due t0+24h.
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "fetched", etag: "v1", links: [] }], t0);
    let row = crawlMemory().pages.get(seedId)!;
    // Visit 2 at t0+24h: not_modified -> 48 h interval.
    const t1 = new Date(row.nextDueAt.getTime());
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "not_modified", etag: "v1", links: [] }], t1);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.nextDueAt.getTime() - t1.getTime()).toBe(48 * HOUR);
    expect(row.status).toBe("NOT_MODIFIED");
    // Visit 3 at t1+48h: 96 h.
    const t2 = new Date(row.nextDueAt.getTime());
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "not_modified", links: [] }], t2);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.nextDueAt.getTime() - t2.getTime()).toBe(96 * HOUR);
    // Keep going: every further interval is capped at 14 days.
    let now = new Date(row.nextDueAt.getTime());
    for (let i = 0; i < 8; i++) {
      const previous = now;
      await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "not_modified", links: [] }], now);
      row = crawlMemory().pages.get(seedId)!;
      now = new Date(row.nextDueAt.getTime());
      expect(now.getTime() - previous.getTime()).toBeLessThanOrEqual(FRONTIER_MAX_INTERVAL_MS);
    }
    expect(planNextVisit(
      { nextDueAt: new Date(t0.getTime() + 13 * DAY), lastFetchedAt: t0, failCount: 0, etag: null, lastModified: null },
      { status: "not_modified" },
      t0,
    ).nextDueAt.getTime() - t0.getTime()).toBe(FRONTIER_MAX_INTERVAL_MS);
  });

  it("backs off errors 1 h, 6 h, 24 h and marks the page dead after five failures", async () => {
    const seedId = claimed[0]!.id;
    const t0 = nowAt(0);
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "error", links: [] }], t0);
    let row = crawlMemory().pages.get(seedId)!;
    expect(row.status).toBe("ERROR");
    expect(row.failCount).toBe(1);
    expect(row.nextDueAt.getTime() - t0.getTime()).toBe(1 * HOUR);
    expect(row.lastFetchedAt).toBeNull(); // an error is not a fetch: no budget use

    // Second failure: 6 h from its visit time.
    const t1 = row.nextDueAt;
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "error", links: [] }], t1);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.failCount).toBe(2);
    expect(row.nextDueAt.getTime() - t1.getTime()).toBe(6 * HOUR);

    // Third and fourth: 24 h each. The fifth failure kills the page.
    let cursor = row.nextDueAt;
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "error", links: [] }], cursor);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.failCount).toBe(3);
    expect(row.nextDueAt.getTime() - cursor.getTime()).toBe(24 * HOUR);
    cursor = row.nextDueAt;
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "error", links: [] }], cursor);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.failCount).toBe(4);
    cursor = row.nextDueAt;
    const { accepted } = await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "error", links: [] }], cursor);
    expect(accepted).toBe(1);
    row = crawlMemory().pages.get(seedId)!;
    expect(row.status).toBe("DEAD");
    expect(row.failCount).toBe(5);
    // A dead page is never due again, and a late report cannot revive it.
    expect(await claimCrawlPages(sourceId, 10, new Date(cursor.getTime() + 30 * DAY))).toEqual([]);
    const revived = await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "fetched", links: [] }], new Date(cursor.getTime() + 31 * DAY));
    expect(revived.accepted).toBe(0);
    expect(crawlMemory().pages.get(seedId)!.status).toBe("DEAD");
  });

  it("gone is dead for good; blocked is rechecked after 24 h", async () => {
    const seedId = claimed[0]!.id;
    const t = nowAt(0);
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "gone", links: [] }], t);
    expect(crawlMemory().pages.get(seedId)!.status).toBe("GONE");
    expect(crawlMemory().pages.get(seedId)!.lastFetchedAt).toEqual(t);
    expect(await claimCrawlPages(sourceId, 10, new Date(t.getTime() + 30 * DAY))).toEqual([]);

    // Blocked: not fetched, scheduled again in 24 h.
    const second = await createSource("blocked.example.com", 10);
    const b = await claimCrawlPages(second, 10, t);
    await reportCrawlPages(second, "run-1", [{ id: b[0]!.id, status: "blocked", links: [] }], t);
    const row = crawlMemory().pages.get(b[0]!.id)!;
    expect(row.status).toBe("BLOCKED");
    expect(row.lastFetchedAt).toBeNull();
    expect(row.nextDueAt.getTime() - t.getTime()).toBe(24 * HOUR);
    expect(await claimCrawlPages(second, 10, new Date(t.getTime() + HOUR))).toEqual([]);
    expect((await claimCrawlPages(second, 10, new Date(t.getTime() + 25 * HOUR))).length).toBe(1);
  });

  it("a permanent failure's gone report kills the row on the first attempt (WP13)", async () => {
    // The crawler reports `gone` straight away for a fetch failure that
    // retrying cannot fix (a DNS name that does not exist, a TLS
    // certificate failure), so the row dies immediately — it does not
    // spend the five error retries first.
    const seedId = claimed[0]!.id;
    const t = nowAt(0);
    const first = await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "gone", links: [] }], t);
    expect(first.accepted).toBe(1);
    const row = crawlMemory().pages.get(seedId)!;
    expect(row.status).toBe("GONE");
    expect(row.failCount).toBe(0); // dead without the five error retries
    expect(row.lastFetchedAt).toEqual(t); // counted as visited, not as an error
    // A retried report (the crawler lost the answer) changes nothing.
    const again = await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "gone", links: [] }], nowAt(1 * MIN));
    expect(again.accepted).toBe(0); // a dead row is never resurrected
    expect(await claimCrawlPages(sourceId, 10, new Date(t.getTime() + 30 * DAY))).toEqual([]);
  });

  it("ignores entries that are malformed, unknown, or another source's rows", async () => {
    const otherSource = await createSource("other-forum.example.com", 10);
    const otherSeed = await claimCrawlPages(otherSource, 10, nowAt(0));
    const seedId = claimed[0]!.id;
    const { accepted } = await reportCrawlPages(sourceId, "run-1", [
      { id: seedId, status: "fetched", links: [] },
      { id: "src-unknown", status: "fetched", links: [] },
      { id: otherSeed[0]!.id, status: "gone", links: [] }, // another source's row
      { status: "fetched" }, // malformed: no id
      { id: seedId, status: "fetched", links: [{ url: "https://forum.example.com/ok", kind: "bogus" }] }, // bad link kind -> entry skipped
    ], nowAt(1 * MIN));
    // The first entry is applied; the rest are skipped. (The last is a
    // duplicate id anyway: only its first entry counts.)
    expect(accepted).toBe(1);
    expect(crawlMemory().pages.get(otherSeed[0]!.id)!.status).toBe("PENDING"); // untouched
  });
});

describe("scheduling plan (pure)", () => {
  const base = { nextDueAt: new Date(0), lastFetchedAt: new Date(0), failCount: 0, etag: null, lastModified: null };

  it("keeps the stored validators when a report carries none", () => {
    const plan = planNextVisit({ ...base, etag: "v1", lastModified: "date-1" }, { status: "fetched" }, new Date(10));
    expect(plan.etag).toBe("v1");
    expect(plan.lastModified).toBe("date-1");
  });

  it("a first not_modified (no previous fetch) doubles from the 24 h baseline", () => {
    const plan = planNextVisit({ ...base, lastFetchedAt: null, nextDueAt: new Date(0) }, { status: "not_modified" }, new Date(10));
    expect(plan.nextDueAt.getTime() - 10).toBe(48 * HOUR);
  });
});

describe("retention", () => {
  it("deletes frontier rows after 30 days except rows still due for crawling", async () => {
    const t = nowAt(0);
    const seed = await claimCrawlPages(sourceId, 10, t);
    const seedId = seed[0]!.id;
    await reportCrawlPages(sourceId, "run-1", [{ id: seedId, status: "fetched", links: [{ url: "https://forum.example.com/a", kind: "page" }] }], t);

    const now = new Date(t.getTime() + 31 * DAY);
    // The fetched row is scheduled 24 h out from t, so at t+31d it is 7 days
    // past due and still waiting for a crawler: kept.
    // The never-claimed link row is also due: kept.
    expect(await purgeExpiredCrawlPages(now)).toBe(0);
    expect([...crawlMemory().pages.values()].length).toBe(2);

    // Report both as gone: dead rows are never due, so the sweep removes them.
    const due = await claimCrawlPages(sourceId, 10, now);
    expect(due.length).toBe(2);
    await reportCrawlPages(sourceId, "run-1", due.map((u) => ({ id: u.id, status: "gone", links: [] })), now);
    const purged = await purgeExpiredCrawlPages(new Date(now.getTime() + URL_RETENTION_MS + 2 * DAY));
    expect(purged).toBe(2);
    expect([...crawlMemory().pages.values()].length).toBe(0);
  });
});

describe("bounded frontier (review fix)", () => {
  it("purges expired rows of a disabled or paused source even when they are due", async () => {
    const t = nowAt(0);
    const seed = await claimCrawlPages(sourceId, 10, t);
    await reportCrawlPages(sourceId, "run-1", [{ id: seed[0]!.id, status: "fetched", links: [{ url: "https://forum.example.com/a", kind: "page" }] }], t);
    const later = new Date(t.getTime() + 31 * DAY);
    // Enabled: both rows are due and kept (unchanged WP3 behaviour).
    expect(await purgeExpiredCrawlPages(later)).toBe(0);
    // Switched off (an admin, a block or the 30-day pause): nothing will
    // crawl them, so they leave with the retention.
    crawlMemory().sources.get(sourceId)!.enabled = false;
    expect(await purgeExpiredCrawlPages(later)).toBe(2);
    expect(crawlMemory().pages.size).toBe(0);
  });

  it("caps the rows one source may hold; links beyond the cap are dropped", async () => {
    vi.stubEnv("CRAWLER_FRONTIER_MAX_PAGES_PER_SOURCE", "1000");
    const t = nowAt(0);
    const seed = await claimCrawlPages(sourceId, 10, t);
    // 499 links per page (the per-page cap is 500), reported across three pages.
    const many = (prefix: string) => Array.from({ length: 499 }, (_, i) => ({ url: `https://forum.example.com/${prefix}${i}`, kind: "page" as const }));
    await reportCrawlPages(sourceId, "run-1", [{ id: seed[0]!.id, status: "fetched", links: many("a") }], t);
    expect(crawlMemory().pages.size).toBe(500);
    const batch = await claimCrawlPages(sourceId, 2, nowAt(MIN));
    await reportCrawlPages(sourceId, "run-1", [
      { id: batch[0]!.id, status: "fetched", links: many("b") },
      { id: batch[1]!.id, status: "fetched", links: many("c") },
    ], nowAt(2 * MIN));
    expect(crawlMemory().pages.size).toBe(1000);
    const more = await claimCrawlPages(sourceId, 1, nowAt(3 * MIN));
    await reportCrawlPages(sourceId, "run-1", [{ id: more[0]!.id, status: "fetched", links: many("d") }], nowAt(4 * MIN));
    expect(crawlMemory().pages.size).toBe(1000);
  });
});

describe("frontier routes", () => {
  it("answers 503 while ENABLE_CRAWLER is off and 401 without the key", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: { sourceId, limit: 1 } }))).status).toBe(503);
    expect((await postReport(crawlerRequest("frontier/report", { method: "POST", body: { sourceId, runId: "r", pages: [] } }))).status).toBe(503);
    vi.stubEnv("ENABLE_CRAWLER", "true");
    expect((await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: { sourceId, limit: 1 }, auth: null }))).status).toBe(401);
    expect((await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: { sourceId, limit: 1 }, auth: "Bearer cwk_" + "0".repeat(48) }))).status).toBe(401);
  });

  it("claim: strict body, seed out, validators only when present", async () => {
    for (const bad of [
      {},
      { sourceId },
      { sourceId, limit: 0 },
      { sourceId, limit: 201 },
      { sourceId, limit: 1, extra: true },
      { sourceId: "src x", limit: 1 },
    ]) {
      const response = await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: bad }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
    const response = await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: { sourceId, limit: 5 } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { urls: Array<{ id: string; url: string; depth: number; etag?: string; lastModified?: string }> };
    expect(body.urls).toHaveLength(1);
    expect(body.urls[0]).toEqual({ id: body.urls[0]!.id, url: "https://forum.example.com/", depth: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The seed row is claimed now: a second claim in the window gets nothing.
    const response2 = await postClaim(crawlerRequest("frontier/claim", { method: "POST", body: { sourceId, limit: 5 } }));
    expect(await response2.json()).toEqual({ urls: [] });
  });

  it("report: strict envelope, per-page validation, accepted count", async () => {
    const claimed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const id = claimed[0]!.id;
    for (const bad of [
      { sourceId, pages: [] },
      { runId: "r", pages: [] },
      { sourceId, runId: "r", pages: [], extra: 1 },
      { sourceId, runId: "bad id", pages: [] },
      { sourceId, runId: "r" },
    ]) {
      expect((await postReport(crawlerRequest("frontier/report", { method: "POST", body: bad }))).status).toBe(400);
    }
    const ok = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: { sourceId, runId: "run-1", pages: [{ id, status: "fetched", links: [{ url: "https://forum.example.com/x", kind: "page" }] }] },
    }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ accepted: 1 });
    // A second report of the same page: applied again (retry-safe), and the
    // duplicate link is deduplicated, never stored twice.
    const again = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: { sourceId, runId: "run-1", pages: [{ id, status: "fetched", links: [{ url: "https://forum.example.com/x", kind: "page" }] }] },
    }));
    expect(await again.json()).toEqual({ accepted: 1 });
    expect([...crawlMemory().pages.values()].filter((p) => p.urlDigest === crawlPageDigest(sourceId, "https://forum.example.com/x"))).toHaveLength(1);
  });
});

// --- crawler v3 WP10: count the same page once ------------------------------

/** Every form of one page: scheme, host form, trailing slash, index document. */
const ONE_PAGE = [
  "https://forum.example.com/target",
  "http://forum.example.com/target",
  "https://forum.example.com/target/",
  "https://forum.example.com/target/index.html",
  "https://forum.example.com/target/index.htm",
  "https://forum.example.com/target/index.php",
  "https://www.forum.example.com/target",
  "http://www.forum.example.com/target/index.html",
  "https://forum.example.com/target?utm_source=x", // tracking noise
];

/** Near-misses that must stay distinct pages. */
const DISTINCT_PAGES = [
  "https://forum.example.com/", // the root is its own page
  "https://forum.example.com/target/extra",
  "https://forum.example.com/target?a=1", // a real parameter is content
  "https://forum.example.com:8443/target", // a non-default port is another server
  "https://shop.forum.example.com/target", // a subdomain other than www
  "https://forum.example.com/indexeling", // "index" as a prefix
  "https://forum.example.com/target/index.html/x", // the index document is not final
];

describe("page key (WP10)", () => {
  it("digests every form of one page to one frontier row", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    await reportCrawlPages(sourceId, "run-1", [
      { id: seed[0]!.id, status: "fetched", links: ONE_PAGE.map((url) => ({ url, kind: "page" as const })) },
    ], nowAt(1 * MIN));
    const rows = [...crawlMemory().pages.values()];
    expect(rows).toHaveLength(2); // the seed and exactly one row for the target
    const target = rows.find((r) => r.urlDigest === crawlPageDigest(sourceId, "https://forum.example.com/target"));
    expect(target).toBeDefined();
    expect(target!.depth).toBe(1);
  });

  it("keeps distinct pages distinct", () => {
    for (const raw of DISTINCT_PAGES) {
      expect(crawlPageDigest(sourceId, raw), raw).not.toBe(crawlPageDigest(sourceId, "https://forum.example.com/target"));
    }
    expect(new Set(DISTINCT_PAGES.map((raw) => crawlPageDigest(sourceId, raw))).size).toBe(DISTINCT_PAGES.length);
  });

  it("is the same key the crawler computes (shared module, both sides pinned)", () => {
    // crawlPageKey delegates to the one module the crawler imports
    // (asmita/src/lib/crawl-page-key.ts); the crawler's
    // tests/unit/page-key-contract.test.ts pins its urlKey to the same
    // module, so this is the contract that both sides agree.
    for (const raw of [...ONE_PAGE, ...DISTINCT_PAGES, "https://forum.example.com/index.html"]) {
      expect(crawlPageKey(raw), raw).toBe(pageKey(raw));
    }
  });

  it("collapses the root's index document to the root itself", () => {
    expect(crawlPageKey("https://forum.example.com/index.html")).toBe("https://forum.example.com/");
    expect(crawlPageKey("https://forum.example.com/index.php")).toBe("https://forum.example.com/");
    expect(crawlPageKey("https://forum.example.com/")).toBe("https://forum.example.com/");
  });

  it("existing rows keep their stored digest; a same-page link is a second row until the old one ages out", async () => {
    // A row digested under the pre-WP10 rule (address as written, tracking
    // stripped) is never re-digested: the digest is computed once at insert.
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const legacyUrl = "https://forum.example.com/old/";
    const legacyDigest = sha256(`crawl-page\u0000${sourceId}\u0000${legacyUrl}`);
    crawlMemory().pages.set("page-legacy", {
      id: "page-legacy", sourceId, urlEncrypted: encryptField(legacyUrl), urlDigest: legacyDigest,
      depth: 1, kind: "PAGE", priority: 100, etag: null, lastModified: null, status: "PENDING",
      claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: nowAt(0),
    });
    await reportCrawlPages(sourceId, "run-1", [
      { id: seed[0]!.id, status: "fetched", links: [{ url: "https://forum.example.com/old", kind: "page" }] },
    ], nowAt(1 * MIN));
    // The old row is untouched, digest and status included.
    const legacy = crawlMemory().pages.get("page-legacy")!;
    expect(legacy.urlDigest).toBe(legacyDigest);
    expect(legacy.status).toBe("PENDING");
    // The new-rule link of the same page is stored as a second row (the
    // duplicate is accepted until the old row ages out of retention).
    const fresh = [...crawlMemory().pages.values()].find((r) => r.urlDigest === crawlPageDigest(sourceId, "https://forum.example.com/old"));
    expect(fresh).toBeDefined();
    expect(fresh!.id).not.toBe("page-legacy");
  });
});

describe("canonical aliases (WP10, review fix)", () => {
  // Review fix: an alias retires only a row that was never fetched and is
  // not a depth-0 seed; it never kills a fetched row or a seed, never
  // inserts a placeholder row, and is ignored when the reporting page was
  // reached via pagination.
  const rowOf = (url: string) => [...crawlMemory().pages.values()].filter((r) => r.urlDigest === crawlPageDigest(sourceId, url));

  async function seedWithLinks(links: Array<{ url: string; kind: "page"; pagination?: boolean }>) {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    await reportCrawlPages(sourceId, "run-1", [{ id: seed[0]!.id, status: "fetched", links }], nowAt(1 * MIN));
    return seed[0]!;
  }

  it("retires a never-fetched alias row; a later link in another spelling adds no row", async () => {
    await seedWithLinks([
      { url: "https://forum.example.com/dupe", kind: "page" },
      { url: "https://forum.example.com/twin", kind: "page" },
    ]);
    const batch = await claimCrawlPages(sourceId, 1, nowAt(2 * MIN)); // only /dupe goes out
    const dupe = batch[0]!;
    expect(dupe.url.endsWith("/dupe") || dupe.url.endsWith("/twin")).toBe(true);
    const other = dupe.url.endsWith("/dupe") ? "https://forum.example.com/twin" : "https://forum.example.com/dupe";
    // The fetched page names the other one (trailing-slash form) as canonical.
    await reportCrawlPages(sourceId, "run-1", [{ id: dupe.id, status: "fetched", aliases: [`${other}/`], links: [] }], nowAt(3 * MIN));
    const otherRows = rowOf(other);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0]!.status).toBe("DEAD"); // never fetched, depth 1: retired
    // A later link in another spelling neither adds a row nor revives it.
    await reportCrawlPages(sourceId, "run-1", [
      { id: dupe.id, status: "fetched", links: [{ url: other.replace("https://", "https://www.") + "/index.html", kind: "page" }] },
    ], nowAt(31 * DAY));
    expect(rowOf(other)).toHaveLength(1);
    expect(rowOf(other)[0]!.status).toBe("DEAD");
  });

  it("never kills a row that has been fetched, even in the same report", async () => {
    await seedWithLinks([
      { url: "https://forum.example.com/dupe", kind: "page" },
      { url: "https://forum.example.com/twin", kind: "page" },
    ]);
    const batch = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    const dupe = batch.find((b) => b.url.endsWith("/dupe"))!;
    const twin = batch.find((b) => b.url.endsWith("/twin"))!;
    // Same report: the twin is visited, so it is no alias victim.
    await reportCrawlPages(sourceId, "run-1", [
      { id: dupe.id, status: "fetched", aliases: ["https://forum.example.com/twin/"], links: [] },
      { id: twin.id, status: "fetched", links: [] },
    ], nowAt(3 * MIN));
    expect(crawlMemory().pages.get(twin.id)!.status).toBe("FETCHED");
    // A later report: the twin was fetched before, so it still stands.
    await reportCrawlPages(sourceId, "run-2", [
      { id: dupe.id, status: "fetched", aliases: ["https://forum.example.com/twin"], links: [] },
    ], nowAt(1 * DAY + 3 * MIN));
    expect(crawlMemory().pages.get(twin.id)!.status).toBe("FETCHED");
  });

  it("a site-wide canonical to the home page never kills the seed", async () => {
    const seed = await seedWithLinks([{ url: "https://forum.example.com/thread", kind: "page" }]);
    const batch = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    await reportCrawlPages(sourceId, "run-1", [
      { id: batch[0]!.id, status: "fetched", aliases: ["https://www.forum.example.com/"], links: [] },
    ], nowAt(3 * MIN));
    expect(crawlMemory().pages.get(seed.id)!.status).toBe("FETCHED");
    // The seed is due again tomorrow like any fetched page.
    expect((await claimCrawlPages(sourceId, 10, nowAt(1 * DAY + 2 * MIN))).map((b) => b.id)).toContain(seed.id);
  });

  it("paginated pages naming page 1 as canonical never retire page 1", async () => {
    // The seed links the listing and its page 2 (a pagination link); page 2
    // is claimed and fetched first (pagination runs before plain pages).
    await seedWithLinks([
      { url: "https://forum.example.com/list", kind: "page" },
      { url: "https://forum.example.com/list?page=2", kind: "page", pagination: true },
    ]);
    const first = await claimCrawlPages(sourceId, 1, nowAt(2 * MIN));
    expect(first[0]!.url).toBe("https://forum.example.com/list?page=2");
    await reportCrawlPages(sourceId, "run-1", [
      { id: first[0]!.id, status: "fetched", aliases: ["https://forum.example.com/list"], links: [] },
    ], nowAt(3 * MIN));
    const listRows = rowOf("https://forum.example.com/list");
    expect(listRows).toHaveLength(1);
    expect(listRows[0]!.status).toBe("PENDING"); // never fetched yet, still not retired
    const next = await claimCrawlPages(sourceId, 10, nowAt(4 * MIN));
    expect(next.map((b) => b.url)).toEqual(["https://forum.example.com/list"]);
  });

  it("an alias without a row inserts nothing; its link in the same report is not stored", async () => {
    await seedWithLinks([{ url: "https://forum.example.com/canon-page", kind: "page" }]);
    const batch = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: batch[0]!.id,
        status: "fetched",
        aliases: ["https://forum.example.com/late-twin"],
        links: [
          { url: "https://forum.example.com/late-twin", kind: "page" },
          { url: "https://forum.example.com/real-content", kind: "page" },
        ],
      },
    ], nowAt(3 * MIN));
    expect(rowOf("https://forum.example.com/late-twin")).toHaveLength(0); // no placeholder row
    const real = rowOf("https://forum.example.com/real-content");
    expect(real).toHaveLength(1);
    expect(real[0]!.status).toBe("PENDING");
    expect([...crawlMemory().pages.values()].filter((r) => r.status === "DEAD")).toHaveLength(0);
  });

  it("ignores self-aliases, off-scope aliases and malformed ones", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const seedRow = crawlMemory().pages.get(seed[0]!.id)!;
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: seed[0]!.id,
        status: "fetched",
        aliases: [
          seed[0]!.url, // names itself canonical: no alias
          "https://forum.example.com/", // the seed's own address, same digest
          "https://other.example.org/x", // off the source host: never stored
          "https://forum.example.com:8443/x", // non-default port: refused
          "https://user:pw@forum.example.com/x", // credentials: refused
          "not a valid url at all", // malformed: refused
          "ftp://forum.example.com/x", // scheme: refused
        ],
        links: [{ url: "https://forum.example.com/kept", kind: "page" }],
      },
    ], nowAt(1 * MIN));
    const rows = [...crawlMemory().pages.values()];
    expect(rows).toHaveLength(2); // the seed and the kept link only
    expect(crawlMemory().pages.get(seed[0]!.id)!.status).toBe("FETCHED"); // not killed by its self-alias
    expect(crawlMemory().pages.get(seed[0]!.id)!.urlDigest).toBe(seedRow.urlDigest);
  });

  it("an alias of a dead row changes nothing; a retried report is safe", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const id = seed[0]!.id;
    // Five failures kill the page (the app's dead-after-five rule).
    let cursor = nowAt(0);
    for (let i = 0; i < 5; i++) {
      await reportCrawlPages(sourceId, "run-1", [{ id, status: "error", links: [] }], cursor);
      cursor = crawlMemory().pages.get(id)!.nextDueAt;
    }
    expect(crawlMemory().pages.get(id)!.status).toBe("DEAD");
    // A late report of the dead row — with an alias, as a retry might carry —
    // changes nothing: no row is scheduled, nothing is stored.
    const late = await reportCrawlPages(sourceId, "run-1", [
      { id, status: "fetched", aliases: ["https://forum.example.com/after-dead"], links: [] },
    ], nowAt(3 * DAY));
    expect(late.accepted).toBe(0);
    expect(rowOf("https://forum.example.com/after-dead")).toHaveLength(0);
    expect([...crawlMemory().pages.values()]).toHaveLength(1);
  });

  it("the report schema is strict: more than 20 aliases skips the entry whole", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const id = seed[0]!.id;
    const aliases = (n: number) => Array.from({ length: n }, (_, i) => `https://forum.example.com/alias-${i}`);
    // 21 aliases: the entry fails validation and is skipped, envelope intact.
    const over = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: { sourceId, runId: "run-1", pages: [{ id, status: "fetched", aliases: aliases(FRONTIER_ALIASES_PER_PAGE_MAX + 1), links: [] }] },
    }));
    expect(over.status).toBe(200);
    expect(await over.json()).toEqual({ accepted: 0 });
    expect(crawlMemory().pages.get(id)!.status).toBe("PENDING"); // not scheduled
    // Exactly 20 (all distinct) is accepted: the page moves; none has a row, so nothing else changes.
    const ok = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: { sourceId, runId: "run-1", pages: [{ id, status: "fetched", aliases: aliases(FRONTIER_ALIASES_PER_PAGE_MAX), links: [] }] },
    }));
    expect(await ok.json()).toEqual({ accepted: 1 });
    expect(crawlMemory().pages.get(id)!.status).toBe("FETCHED");
    expect([...crawlMemory().pages.values()]).toHaveLength(1);
    // Not a string, or a bad shape, is refused the same way.
    const bad = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: { sourceId, runId: "run-1", pages: [{ id, status: "fetched", aliases: ["https://forum.example.com/a", 5], links: [] }] },
    }));
    expect(await bad.json()).toEqual({ accepted: 0 });
  });
});

// --- crawler v3 WP11: crawl the useful pages first ---------------------------

/** The frontier row of one page of this source, looked up by its path. */
function rowOf(path: string) {
  const digest = crawlPageDigest(sourceId, `https://forum.example.com${path}`);
  return [...crawlMemory().pages.values()].find((r) => r.urlDigest === digest)!;
}

describe("crawl order (WP11)", () => {
  it("linkPriority: sitemap 10, feed 20, pagination 30, pages 50 + 10 per depth, capped", () => {
    expect(linkPriority({ kind: "sitemap" }, 1)).toBe(10);
    expect(linkPriority({ kind: "feed" }, 1)).toBe(20);
    expect(linkPriority({ kind: "page", pagination: true }, 1)).toBe(30);
    expect(linkPriority({ kind: "page", pagination: false }, 1)).not.toBe(30); // only a marked link is pagination
    expect(linkPriority({ kind: "page" }, 0)).toBe(50);
    expect(linkPriority({ kind: "page" }, 1)).toBe(60);
    expect(linkPriority({ kind: "page" }, 5)).toBe(100);
    expect(linkPriority({ kind: "page" }, 9)).toBe(100); // the cap is the default
    expect(FRONTIER_PRIORITY_DEFAULT).toBe(100);
    expect(FRONTIER_PRIORITY_LASTMOD).toBe(5);
  });

  it("a report stores each link's row with the priority its kind implies", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: seed[0]!.id,
        status: "fetched",
        links: [
          { url: "https://forum.example.com/sitemap.xml", kind: "sitemap" },
          { url: "https://forum.example.com/feed.rss", kind: "feed" },
          { url: "https://forum.example.com/list?page=2", kind: "page", pagination: true },
          { url: "https://forum.example.com/deep", kind: "page" },
        ],
      },
    ], nowAt(1 * MIN));
    expect(rowOf("/sitemap.xml").priority).toBe(10);
    expect(rowOf("/feed.rss").priority).toBe(20);
    expect(rowOf("/list?page=2").priority).toBe(30);
    expect(rowOf("/deep").priority).toBe(60); // depth 1: 50 + 10
    // The seed row is the app's own: it keeps the default.
    expect(crawlMemory().pages.get(seed[0]!.id)!.priority).toBe(100);
    // A link reported by a depth-1 page sits one level deeper.
    const batch = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    expect(batch.map((u) => u.url)).toEqual([
      "https://forum.example.com/sitemap.xml",
      "https://forum.example.com/feed.rss",
      "https://forum.example.com/list?page=2",
      "https://forum.example.com/deep",
    ]);
    await reportCrawlPages(sourceId, "run-1", [
      { id: batch[0]!.id, status: "fetched", links: [{ url: "https://forum.example.com/from-sitemap", kind: "page" }] },
    ], nowAt(3 * MIN));
    expect(rowOf("/from-sitemap").priority).toBe(70); // depth 2
  });

  it("claims lowest priority first, then the row that has been due the longest", async () => {
    // A row stored before WP11 (the default 100) runs after every new row.
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    await reportCrawlPages(sourceId, "run-1", [
      { id: seed[0]!.id, status: "fetched", links: [{ url: "https://forum.example.com/a", kind: "page" }] },
    ], nowAt(1 * MIN));
    crawlMemory().pages.set("page-old", {
      id: "page-old", sourceId, urlEncrypted: encryptField("https://forum.example.com/old"), urlDigest: crawlPageDigest(sourceId, "https://forum.example.com/old")!,
      depth: 1, kind: "PAGE", priority: FRONTIER_PRIORITY_DEFAULT, etag: null, lastModified: null, status: "PENDING",
      claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: nowAt(0),
    });
    let batch = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    expect(batch.map((u) => u.url)).toEqual(["https://forum.example.com/a", "https://forum.example.com/old"]);
    // Both rows are claimed for 30 minutes; the next ordering check runs
    // after the claim window.
    const claimed = new Set(batch.map((u) => u.id));
    expect(claimed.has("page-old")).toBe(true);

    // Same priority: the earlier nextDueAt wins; a lower number beats a later due time.
    const rowA = rowOf("/a");
    rowA.priority = 60;
    rowA.nextDueAt = nowAt(10 * MIN);
    const old = crawlMemory().pages.get("page-old")!;
    old.priority = 60;
    old.nextDueAt = nowAt(5 * MIN);
    crawlMemory().pages.set("page-mid", {
      id: "page-mid", sourceId, urlEncrypted: encryptField("https://forum.example.com/mid"), urlDigest: crawlPageDigest(sourceId, "https://forum.example.com/mid")!,
      depth: 1, kind: "PAGE", priority: 90, etag: null, lastModified: null, status: "PENDING",
      claimedUntil: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0, createdAt: nowAt(0),
    });
    batch = await claimCrawlPages(sourceId, 10, nowAt(40 * MIN));
    // old (60, due 5 min) before a (60, due 10 min) before mid (90, due since ever).
    expect(batch.map((u) => u.url)).toEqual(["https://forum.example.com/old", "https://forum.example.com/a", "https://forum.example.com/mid"]);
  });

  it("a sitemap link whose lastmod is newer than the row's last fetch jumps the queue", async () => {
    const t0 = nowAt(0);
    const seed = await claimCrawlPages(sourceId, 10, t0);
    // The seed's report stores a sitemap row (10) and a page row whose
    // sitemap entry carries a lastmod. The page has never been fetched:
    // no last fetch to compare, so no jump — it is due immediately anyway.
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: seed[0]!.id,
        status: "fetched",
        links: [
          { url: "https://forum.example.com/sitemap.xml", kind: "sitemap" },
          { url: "https://forum.example.com/changed", kind: "page", lastmod: "2026-11-17T09:05:00Z" },
          { url: "https://forum.example.com/stale", kind: "page", lastmod: "2026-11-17T08:00:00Z" },
        ],
      },
    ], t0);
    expect(rowOf("/changed").priority).toBe(60);
    expect(rowOf("/stale").priority).toBe(60);

    // Fetch the sitemap first (priority 10) and let it report /changed with
    // the same lastmod: still no fetch to beat.
    const first = await claimCrawlPages(sourceId, 1, nowAt(1 * MIN));
    expect(first.map((u) => u.url)).toEqual(["https://forum.example.com/sitemap.xml"]);
    await reportCrawlPages(sourceId, "run-1", [
      { id: first[0]!.id, status: "fetched", links: [{ url: "https://forum.example.com/changed", kind: "page", lastmod: "2026-11-17T09:05:00Z" }] },
    ], nowAt(1 * MIN));
    expect(rowOf("/changed").priority).toBe(60);

    // Fetch /changed itself (last fetch = t2) and /stale (last fetch = t2).
    const second = await claimCrawlPages(sourceId, 10, nowAt(2 * MIN));
    expect(second.map((u) => u.url)).toEqual(["https://forum.example.com/changed", "https://forum.example.com/stale"]);
    await reportCrawlPages(sourceId, "run-1", second.map((u) => ({ id: u.id, status: "fetched" as const, links: [] })), nowAt(2 * MIN));
    expect(rowOf("/changed").nextDueAt.getTime() - nowAt(2 * MIN).getTime()).toBe(FRONTIER_REVISIT_MS);

    // A retried sitemap report (retry-safe by design) carries a lastmod newer
    // than /changed's last fetch: priority 5, due now — hours before its own
    // 24 h schedule. /stale's lastmod is older than its fetch: unchanged.
    const t3 = nowAt(3 * MIN);
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: first[0]!.id,
        status: "fetched",
        links: [
          { url: "https://forum.example.com/changed", kind: "page", lastmod: "2026-11-17T09:10:00Z" },
          { url: "https://forum.example.com/stale", kind: "page", lastmod: "2026-11-17T08:00:00Z" },
        ],
      },
    ], t3);
    const changed = rowOf("/changed");
    expect(changed.priority).toBe(FRONTIER_PRIORITY_LASTMOD);
    expect(changed.nextDueAt).toEqual(t3); // due immediately
    expect(changed.lastFetchedAt).toEqual(nowAt(2 * MIN)); // the jump does not refetch by itself
    expect(rowOf("/stale").priority).toBe(60);
    expect(rowOf("/stale").nextDueAt.getTime() - nowAt(2 * MIN).getTime()).toBe(FRONTIER_REVISIT_MS);

    // The jumped row is the only thing due: it is claimed next, 24 h early.
    const third = await claimCrawlPages(sourceId, 10, nowAt(4 * MIN));
    expect(third.map((u) => u.url)).toEqual(["https://forum.example.com/changed"]);
  });

  it("no jump for a page this report fetched, a never-fetched row, or a dead row", async () => {
    const t0 = nowAt(0);
    const seed = await claimCrawlPages(sourceId, 10, t0);
    await reportCrawlPages(sourceId, "run-1", [
      { id: seed[0]!.id, status: "fetched", links: [
        { url: "https://forum.example.com/sitemap.xml", kind: "sitemap" },
        { url: "https://forum.example.com/fresh", kind: "page" },
        { url: "https://forum.example.com/doomed", kind: "page" },
      ] },
    ], t0);
    const batch = await claimCrawlPages(sourceId, 10, nowAt(1 * MIN));
    const byUrl = new Map(batch.map((u) => [u.url, u.id]));
    // All three rows are in this one report; the sitemap names /fresh with a
    // future lastmod — but /fresh was fetched by this very report, so its
    // fresh 24 h schedule wins. /doomed went gone: dead is final.
    await reportCrawlPages(sourceId, "run-1", [
      {
        id: byUrl.get("https://forum.example.com/sitemap.xml")!,
        status: "fetched",
        links: [
          { url: "https://forum.example.com/fresh", kind: "page", lastmod: "2026-11-18T09:00:00Z" },
          { url: "https://forum.example.com/doomed", kind: "page", lastmod: "2026-11-18T09:00:00Z" },
        ],
      },
      { id: byUrl.get("https://forum.example.com/fresh")!, status: "fetched", links: [] },
      { id: byUrl.get("https://forum.example.com/doomed")!, status: "gone", links: [] },
    ], nowAt(2 * MIN));
    const fresh = rowOf("/fresh");
    expect(fresh.priority).toBe(60); // not bumped to 5
    expect(fresh.nextDueAt.getTime() - nowAt(2 * MIN).getTime()).toBe(FRONTIER_REVISIT_MS);
    const doomed = rowOf("/doomed");
    expect(doomed.status).toBe("GONE");
    expect(doomed.priority).toBe(60); // dead rows are never re-queued
    // And nothing is due before the 24 h schedules.
    expect(await claimCrawlPages(sourceId, 10, nowAt(3 * MIN))).toEqual([]);
  });

  it("accepts the crawler's WP11 link fields; a bad one skips the entry whole (contract)", async () => {
    const seed = await claimCrawlPages(sourceId, 10, nowAt(0));
    const ok = await postReport(crawlerRequest("frontier/report", {
      method: "POST",
      body: {
        sourceId,
        runId: "run-1",
        pages: [{
          id: seed[0]!.id,
          status: "fetched",
          links: [
            { url: "https://forum.example.com/page-1", kind: "page", pagination: true },
            { url: "https://forum.example.com/page-2", kind: "page", lastmod: "2026-11-17T09:00:00Z" },
            { url: "https://forum.example.com/sitemap-2.xml", kind: "sitemap", lastmod: "2026-11-17T09:00:00.000Z" },
          ],
        }],
      },
    }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ accepted: 1 });
    expect(rowOf("/page-1").priority).toBe(30);
    expect(rowOf("/page-2").priority).toBe(60); // stored, never fetched: the lastmod is not a jump
    expect(rowOf("/sitemap-2.xml").priority).toBe(10);
    // Strict per-entry validation: a non-ISO lastmod, a non-boolean pagination
    // marker or an unknown field skips the entry (the page is not scheduled).
    for (const links of [
      [{ url: "https://forum.example.com/x1", kind: "page", lastmod: "17 Nov 2026" }],
      [{ url: "https://forum.example.com/x2", kind: "page", pagination: "yes" }],
      [{ url: "https://forum.example.com/x3", kind: "page", urgent: true }],
    ]) {
      const bad = await postReport(crawlerRequest("frontier/report", {
        method: "POST",
        body: { sourceId, runId: "run-1", pages: [{ id: seed[0]!.id, status: "fetched", links }] },
      }));
      expect(await bad.json()).toEqual({ accepted: 0 });
    }
    expect([...crawlMemory().pages.values()].filter((r) => r.urlDigest === crawlPageDigest(sourceId, "https://forum.example.com/x1"))).toHaveLength(0);
  });
});
