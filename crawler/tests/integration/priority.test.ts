/**
 * Crawler v3 WP11, the "done when" fixture: a source whose robots.txt names
 * a sitemap with <lastmod> entries and whose home page links a pagination
 * page, a plain page and a feed. The mock mirrors the app's priorities, so
 * the first run's claims come back in priority order — sitemap before feed
 * before pagination before plain page — and the report carries the
 * pagination flag and the normalised lastmods. A day later (the second run
 * is started inside the jump test, so the earlier assertions see only the
 * first run's state) the sitemap's entry that is newer than the row's last
 * fetch jumps the queue: with a two-page claim limit, /gallery is fetched
 * a full batch before /plain, which nothing but priority 5 explains.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildPriorityFixture,
  fixtureSeedUrl,
  PRIO_HOST,
  PRIO_LASTMOD_NEW_ISO,
  PRIO_LASTMOD_OLD_ISO,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let first: RunResult;
let second: RunResult | null = null;
const logLines: string[] = [];
const servers: MockAsmita[] = [];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let clock = Date.parse("2026-11-19T10:00:00Z");
/** Where the fixture's request log stood after the first run. */
let afterFirst = 0;

/** This source's fixture requests, robots.txt aside. */
const seen = () => fx.site.requests.filter((r) => r.host === PRIO_HOST && r.path !== "/robots.txt");
/** The same, from the second run on. */
const seenSecond = () => fx.site.requests.slice(afterFirst).filter((r) => r.host === PRIO_HOST && r.path !== "/robots.txt");

/** The frontier row of one path. */
const row = (path: string) => [...api.pages.values()].find((p) => p.url.endsWith(path))!;

type ReportedLink = { url: string; kind: string; pagination?: boolean; lastmod?: string };

/** Every link every report carried, flattened. */
const reportedLinks = (): ReportedLink[] =>
  api.requests
    .filter((r) => r.method === "POST" && r.path === "/api/crawler/frontier/report")
    .flatMap((r) => (((r.body as { pages?: Array<{ links?: ReportedLink[] }> }).pages ?? []).flatMap((p) => p.links ?? [])));

beforeAll(async () => {
  fx = await buildPriorityFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [siteSource({ id: "src-prio", domain: PRIO_HOST, pageBudget: 50, delayMs: 0 })],
    seedUrl: fixtureSeedUrl(fx.site.port),
    now: () => clock,
  }).start();
  servers.push(api);
  ({ result: first } = await runFixtureCrawl(fx.site, api, { hosts: [PRIO_HOST], lines: logLines, now: () => clock }));
  afterFirst = fx.site.requests.length;
}, 120_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

describe("crawl the useful pages first (WP11)", () => {
  it("claims in priority order: sitemap, feed, pagination, then plain pages", () => {
    expect(first.exitCode).toBe(0);
    expect(first.summary.errors).toEqual({});
    // The seed first, then the four depth-1 rows in priority order (the
    // mock orders claims exactly like the app), then the sitemap's and the
    // feed's depth-2 rows, which were all due at once.
    expect(seen().map((r) => r.path)).toEqual([
      "/",
      "/sitemap.xml",
      "/feed.rss",
      "/listing?page=2",
      "/plain",
      "/gallery",
      "/stale",
      "/from-feed",
    ]);
    expect(first.summary.pagesFetched).toBe(6); // 8 pages served, two of them XML documents
  });

  it("reports the pagination flag and the normalised lastmods (contract)", () => {
    expect(api.badRequests).toEqual([]); // the mock's strict schema accepted every report
    const links = reportedLinks();
    expect(links.find((l) => l.url.endsWith("/listing?page=2"))).toMatchObject({ kind: "page", pagination: true });
    const plain = links.find((l) => l.url.endsWith("/plain"))!;
    expect(plain.kind).toBe("page");
    expect("pagination" in plain).toBe(false); // an unmarked page link carries no flag
    // The sitemap's entries: the ISO datetime and the date-only value are
    // both normalised to strict ISO before they are sent.
    expect(links.find((l) => l.url.endsWith("/gallery"))).toMatchObject({ kind: "page", lastmod: PRIO_LASTMOD_NEW_ISO });
    expect(links.find((l) => l.url.endsWith("/stale"))).toMatchObject({ kind: "page", lastmod: PRIO_LASTMOD_OLD_ISO });
    expect(links.find((l) => l.url.endsWith("/sitemap.xml"))).toMatchObject({ kind: "sitemap" }); // the robots.txt stash link carries no lastmod
    expect(links.find((l) => l.url.endsWith("/feed.rss"))).toMatchObject({ kind: "feed" }); // a page's feed link
    expect(links.find((l) => l.url.endsWith("/from-feed"))).toMatchObject({ kind: "page" }); // the feed's entries are pages
  });

  it("the frontier rows carry the priorities (the mock mirrors the app)", () => {
    expect(row("/sitemap.xml").priority).toBe(10);
    expect(row("/feed.rss").priority).toBe(20);
    expect(row("/listing?page=2").priority).toBe(30);
    expect(row("/plain").priority).toBe(60); // depth 1: 50 + 10
    expect(row("/gallery").priority).toBe(70); // depth 2: 50 + 20, stored never-fetched: the future lastmod is not a jump
    expect(row("/stale").priority).toBe(70);
    expect(row("/from-feed").priority).toBe(70); // the feed's entries are depth 2 as well
  });

  it("a newer lastmod jumps the queue: /gallery is claimed a batch before /plain", async () => {
    // A day later everything run 1 fetched is due again. Batch A claims the
    // sitemap (10) and the feed (20); the sitemap's re-report bumps
    // /gallery — its lastmod is newer than the fetch run 1 recorded — to
    // priority 5, due now. Batch B claims /gallery (5) + /listing (30),
    // ahead of /plain and /stale (60, due no later). /stale's old lastmod
    // re-queues nothing.
    clock += 25 * HOUR;
    api.opts.now = () => clock;
    ({ result: second } = await runFixtureCrawl(fx.site, api, {
      hosts: [PRIO_HOST],
      lines: logLines,
      env: { FRONTIER_CLAIM_LIMIT: "2" },
      now: () => clock,
    }));
    expect(second.exitCode).toBe(0);
    expect(second.summary.errors).toEqual({});
    // The seed row runs at its stored priority 50 (review fix 8: the app's
    // own row is a depth-0 page), after the pagination link (30) and ahead
    // of every depth-1 page (60) — no longer after every reported row.
    expect(seenSecond().map((r) => r.path)).toEqual([
      "/sitemap.xml",
      "/feed.rss",
      "/gallery",
      "/listing?page=2",
      "/",
      "/plain",
      "/stale",
      "/from-feed",
    ]);
    expect(second.summary.pagesFetched).toBe(6); // 8 pages served, two of them XML documents
    // The jump was one-shot (review fix 8): /gallery's own fetch in this run
    // reset its priority to the kind/depth value, so the bump is spent.
    expect(row("/gallery").priority).toBe(70);
    expect(row("/gallery").nextDueAt).toBe(clock + DAY); // fetched at the bumped time, scheduled normally
    expect(row("/stale").priority).toBe(70); // the old lastmod bumped nothing
  }, 120_000);

  it("keeps the report contract and logs no URL, hostname, fingerprint or body", () => {
    expect(Math.max(...api.bodySizes)).toBeLessThanOrEqual(256 * 1024);
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), { hostnames: [PRIO_HOST], hashes: [] });
  });
});
