/**
 * Crawler v3 WP10, the "done when" fixture: a site that links the same page
 * in four forms — http/https, www./bare host, a trailing slash and a final
 * /index.html — shows one fetch, and a fetched page's <link rel="canonical">
 * is reported as an alias the app acts on: the alias's live row is killed
 * and an alias without a row gets a digest-only dead tombstone, so the
 * canonical address is never fetched (and never fetched just because it is
 * canonical). A self-referencing canonical and an off-scope canonical are
 * reported as nothing, and the off-scope host is never contacted and never
 * a discovery.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildCanonicalFixture,
  CANON_HOST,
  CANON_KILLED_PATH,
  CANON_LATE_PATH,
  CANON_OFFSITE_HOST,
  fixtureSeedUrl,
  TEST_KEY,
  WWW_CANON_HOST,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let first: RunResult;
let second: RunResult;
const logLines: string[] = [];
const servers: MockAsmita[] = [];

const HOUR = 60 * 60 * 1000;
let clock = Date.parse("2026-11-19T10:00:00Z");

/** Requests to any form of the target page, on either host. */
const targetForms = () =>
  fx.site.requests.filter(
    (r) =>
      (r.host === CANON_HOST && ["/target", "/target/", "/target/index.html"].includes(r.path)) ||
      (r.host === WWW_CANON_HOST && r.path === "/target"),
  );
const pathCount = (path: string) => fx.site.requests.filter((r) => r.host === CANON_HOST && r.path === path).length;
const rowByPath = (path: string) => [...api.pages.values()].find((r) => r.url === `http://${CANON_HOST}:${fx.site.port}${path}`);

beforeAll(async () => {
  fx = await buildCanonicalFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [siteSource({ id: "src-canon", domain: CANON_HOST, pageBudget: 50, delayMs: 0 })],
    seedUrl: fixtureSeedUrl(fx.site.port),
    now: () => clock,
  }).start();
  servers.push(api);
  ({ result: first } = await runFixtureCrawl(fx.site, api, { hosts: [CANON_HOST, WWW_CANON_HOST], lines: logLines, now: () => clock }));
  clock += 25 * HOUR;
  api.opts.now = () => clock;
  ({ result: second } = await runFixtureCrawl(fx.site, api, { hosts: [CANON_HOST, WWW_CANON_HOST], lines: logLines, now: () => clock }));
}, 120_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

describe("count the same page once (WP10)", () => {
  it("links the same page in four forms and fetches it once per run", () => {
    expect(first.exitCode).toBe(0);
    expect(first.summary.errors).toEqual({}); // the WP9 probes on this source miss quietly
    // One frontier row for the target: fetched exactly once in the first
    // run, in the first form seen (the bare path), and revisited exactly
    // once 24 h later — never once per spelling.
    expect(targetForms()).toHaveLength(2);
    expect(pathCount("/target")).toBe(2);
    expect(pathCount("/target/")).toBe(0);
    expect(pathCount("/target/index.html")).toBe(0);
    expect(fx.site.requests.filter((r) => r.host === WWW_CANON_HOST)).toHaveLength(0);
    // The https twin, linked after the row existed, changed nothing.
    const targetRow = rowByPath("/target")!;
    expect(targetRow.url).toBe(`http://${CANON_HOST}:${fx.site.port}/target`);
    expect(targetRow.status).toBe("FETCHED");
    expect(first.summary.pagesFetched).toBe(8); // home + the seven depth-1 pages
    expect(second.summary.pagesFetched).toBe(7); // the revisit: no alias row among them
  });

  it("reports the in-scope canonical as an alias and the app never fetches it again", () => {
    // Exactly the two in-scope aliases were reported: the killed live row
    // (/real-page, claimed with the reporting page's own batch) and the
    // late twin (no row yet; its link arrived in the same report).
    expect(new Set(api.reportedAliases.map((a) => a.url))).toEqual(
      new Set([`http://${CANON_HOST}:${fx.site.port}${CANON_KILLED_PATH}`, `http://${CANON_HOST}:${fx.site.port}${CANON_LATE_PATH}`]),
    );
    // The killed row: fetched once (it was already claimed), dead from the
    // alias on, and never due again.
    expect(pathCount(CANON_KILLED_PATH)).toBe(1);
    expect(rowByPath(CANON_KILLED_PATH)!.status).toBe("DEAD");
    // The late twin: its only row is the dead tombstone, so it was never
    // fetched at all, before or after the second run.
    expect(fx.site.requests.filter((r) => r.path === CANON_LATE_PATH)).toHaveLength(0);
    expect([...api.pages.values()].filter((r) => r.url.endsWith(CANON_LATE_PATH)).every((r) => r.status === "DEAD")).toBe(true);
  });

  it("a self-referencing canonical is no alias; an off-scope canonical is reported as nothing", () => {
    const selfRow = rowByPath("/self-canonical")!;
    expect(selfRow.status).toBe("FETCHED"); // alive: its own canonical did not kill it
    expect(rowByPath("/offscope-canonical")!.status).toBe("FETCHED");
    // The off-scope canonical host was never contacted and never reported
    // as a discovery (a canonical link is metadata, not an anchor).
    expect(fx.site.requests.filter((r) => r.host === CANON_OFFSITE_HOST)).toHaveLength(0);
    expect(api.discoveryReports).toEqual([]);
  });

  it("keeps the frontier bounded and the report contract intact", () => {
    expect(api.badRequests).toEqual([]);
    expect(Math.max(...api.bodySizes)).toBeLessThanOrEqual(256 * 1024);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), { hostnames: [CANON_HOST, WWW_CANON_HOST, CANON_OFFSITE_HOST], hashes: [] });
  });
});
