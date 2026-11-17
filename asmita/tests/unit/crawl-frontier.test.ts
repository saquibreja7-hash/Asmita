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
  FRONTIER_CLAIM_MS,
  FRONTIER_MAX_INTERVAL_MS,
  FRONTIER_REVISIT_MS,
  planNextVisit,
  reportCrawlPages,
} from "@/lib/crawl-pages";
import { purgeExpiredCrawlPages, URL_RETENTION_MS } from "@/lib/url-retention";
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
