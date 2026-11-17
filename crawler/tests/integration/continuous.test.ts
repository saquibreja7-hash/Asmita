/**
 * Continuous running and parallel sources (crawler v2 WP6), end to end
 * against the parallel fixture and the mock API:
 *   - twenty sources of mixed speed finish within a bound only concurrent
 *     source crawling can meet;
 *   - one hanging source does not delay the others: every fast source is
 *     fetched and reported while the hanging one is still stuck, and the
 *     hanging source's report is the last one the run sends;
 *   - `run --loop` keeps claiming work: it sleeps when nothing is due,
 *     picks up a source enabled while it is running, and exits 0 on SIGTERM;
 *   - the loop ends on the existing fatal exit codes (the key revoked
 *     between two passes) instead of spinning;
 *   - the command line keeps the one-shot form and rejects anything else;
 *   - the periodic run_progress line carries counts only, like every line.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMain } from "../../src/cli.ts";
import type { Source } from "../../src/asmita/client.ts";
import {
  buildParallelFixture,
  fixtureEnv,
  fixtureSeedUrl,
  HANG_HOST,
  PARALLEL_HOSTS,
  SPEED_HOSTS,
  SPEED_SERIAL_MS,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { loopbackTestPolicy } from "../support/test-policy.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildParallelFixture();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

async function mock(opts: Omit<MockAsmitaOptions, "key" | "pool">): Promise<MockAsmita> {
  const api = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, seedUrl: fixtureSeedUrl(fx.site.port), ...opts }).start();
  servers.push(api);
  return api;
}

const sourcesOf = (prefix: string, hosts: string[]): Source[] =>
  hosts.map((domain, i) => siteSource({ id: `${prefix}-${i + 1}`, domain, pageBudget: 5, delayMs: 0 }));

/** The fixture's request log is shared across tests: count only this test's. */
const requestsSince = (site: Fixture["site"], baseline: number) => site.requests.slice(baseline);

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("condition not met within the timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

type LogLine = { event?: string; summary?: { pagesClaimed?: number; newUrls?: number } };

describe("parallel sources", () => {
  it("finishes 20 mixed-speed sources within a bound only concurrency can meet", async () => {
    const api = await mock({ sources: sourcesOf("src-p", SPEED_HOSTS) });
    const baseline = fx.site.requests.length;
    const lines: string[] = [];
    const t0 = Date.now();
    const { result } = await runFixtureCrawl(fx.site, api, {
      hosts: PARALLEL_HOSTS,
      env: { GLOBAL_CONCURRENCY: "16" },
      lines,
    });
    const durationMs = Date.now() - t0;
    expect(result.exitCode).toBe(0);
    // Twenty home pages plus s1's linked second page, every source active.
    expect(result.summary.pagesClaimed).toBe(21);
    expect(result.summary.pagesFetched).toBe(21);
    expect(result.summary.sourcesActive).toBe(20);
    expect(result.summary.newUrls).toBe(1);
    for (const host of SPEED_HOSTS) {
      expect(requestsSince(fx.site, baseline).filter((r) => r.host === host && r.path === "/")).toHaveLength(1);
    }
    expect(requestsSince(fx.site, baseline).some((r) => r.host === SPEED_HOSTS[0]! && r.path === "/deep")).toBe(true);
    // A serial run needs SPEED_SERIAL_MS (4.1 s) of page time alone; eight
    // source workers finish in under a third of that.
    expect(durationMs).toBeLessThan(SPEED_SERIAL_MS / 3);
    assertCleanLog(lines.join("\n"), { hostnames: PARALLEL_HOSTS, hashes: [] });
  }, 60_000);

  it("does not let one hanging source delay the others", async () => {
    // The hang is listed first, so it holds a worker slot from the start.
    const all = sourcesOf("src-h", [HANG_HOST, ...SPEED_HOSTS]);
    const hangId = all[0]!.id;
    const api = await mock({ sources: all });
    const baseline = fx.site.requests.length;
    const lines: string[] = [];
    const t0 = Date.now();
    const { result } = await runFixtureCrawl(fx.site, api, {
      hosts: PARALLEL_HOSTS,
      env: { GLOBAL_CONCURRENCY: "16", PROGRESS_LOG_SECONDS: "1" },
      lines,
    });
    const durationMs = Date.now() - t0;
    expect(result.exitCode).toBe(0); // a failing source is not a run failure
    // The hanging page was attempted once and reported as an error...
    expect(requestsSince(fx.site, baseline).filter((r) => r.host === HANG_HOST && r.path === "/")).toHaveLength(1);
    const hangReport = api.reports.find((r) => r.sourceId === hangId && r.statuses.error === 1);
    expect(hangReport).toBeDefined();
    // ...and every fast source finished while it was stuck: the hang's
    // report is the last one the run sent.
    expect(api.reports.indexOf(hangReport!)).toBe(api.reports.length - 1);
    for (const host of SPEED_HOSTS) {
      expect(requestsSince(fx.site, baseline).filter((r) => r.host === host && r.path === "/")).toHaveLength(1);
    }
    // Serial would need the 4.1 s of page time plus the 1.5 s hang; the
    // concurrent run stays well under half of that.
    expect(durationMs).toBeLessThan((SPEED_SERIAL_MS + 1500) / 2);
    // The periodic progress line fired while the hang was pending, counts only.
    const progress = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === "run_progress");
    expect(progress.length).toBeGreaterThan(0);
    const last = progress[progress.length - 1]!;
    for (const f of ["elapsedMs", "sourcesActive", "pagesClaimed", "pagesFetched", "pagesNotModified", "newUrls", "hostsReported", "imagesHashed", "matches", "poolSize"]) {
      expect(last[f], f).toBeTypeOf("number");
    }
    expect(last.pagesClaimed as number).toBeGreaterThanOrEqual(8);
    assertCleanLog(lines.join("\n"), { hostnames: PARALLEL_HOSTS, hashes: [] });
  }, 60_000);
});

describe("run --loop", () => {
  it("sleeps when nothing is due, picks up a source enabled while it runs, and exits 0 on SIGTERM", async () => {
    const api = await mock({ sources: sourcesOf("src-l", [SPEED_HOSTS[0]!]) });
    const baseline = fx.site.requests.length;
    const seenS2Home = () => fx.site.requests.slice(baseline).some((r) => r.host === SPEED_HOSTS[1]! && r.path === "/");
    const lines: string[] = [];
    const stop = new AbortController();
    const done = runMain({
      argv: ["run", "--loop"],
      env: fixtureEnv(api.url, TEST_KEY, { LOOP_IDLE_SECONDS: "1" }),
      policy: loopbackTestPolicy(PARALLEL_HOSTS, fx.site.port),
      stopSignal: stop.signal,
      sink: (l) => lines.push(l),
    });
    const summaries = () =>
      lines
        .map((l) => JSON.parse(l) as LogLine)
        .filter((l) => l.event === "run_summary")
        .map((l) => l.summary!);

    // Pass 1 crawls s1: two pages claimed, one new URL reported.
    await waitUntil(() => summaries().length >= 1, 10_000);
    // Pass 2 finds nothing due everywhere; the loop sleeps before pass 3.
    await waitUntil(() => summaries().some((s) => s.pagesClaimed === 0), 10_000);
    // A source is switched on in the app while the loop is running.
    api.opts.sources.push(siteSource({ id: "src-l-2", domain: SPEED_HOSTS[1]!, pageBudget: 5, delayMs: 0 }));
    await waitUntil(seenS2Home, 10_000);
    // SIGTERM: the loop exits cleanly with 0.
    stop.abort();
    expect(await done).toBe(0);

    const all = summaries();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]!.pagesClaimed).toBe(2);
    expect(all[0]!.newUrls).toBe(1);
    // The first idle pass is the second one; some pass after it claims the
    // one page of the source that was enabled mid-run.
    const idleIdx = all.findIndex((s) => s.pagesClaimed === 0);
    expect(idleIdx).toBe(1);
    expect(all.slice(idleIdx + 1).some((s) => s.pagesClaimed === 1)).toBe(true);
    expect(lines.some((l) => l.includes('"event":"loop_idle"'))).toBe(true);
    assertCleanLog(lines.join("\n"), { hostnames: PARALLEL_HOSTS, hashes: [] });
  }, 60_000);

  it("ends the loop with the fatal exit code when the key is revoked between passes", async () => {
    const api = await mock({
      sources: sourcesOf("src-f", [SPEED_HOSTS[0]!]),
      statusAfter: { sources: { after: 1, status: 401 } },
    });
    const baseline = fx.site.requests.length;
    const code = await runMain({
      argv: ["run", "--loop"],
      env: fixtureEnv(api.url, TEST_KEY, { LOOP_IDLE_SECONDS: "1" }),
      policy: loopbackTestPolicy(PARALLEL_HOSTS, fx.site.port),
      sink: () => {},
    });
    expect(code).toBe(2);
    // Pass 1 crawled; pass 2 could not even load, and the loop stopped
    // there instead of spinning: exactly two source listings in total.
    expect(fx.site.requests.slice(baseline).some((r) => r.host === SPEED_HOSTS[0]! && r.path === "/")).toBe(true);
    expect(api.requests.filter((r) => r.path === "/api/crawler/sources")).toHaveLength(2);
  }, 30_000);
});

describe("the command line", () => {
  it("keeps the one-shot form and rejects anything but run and run --loop", async () => {
    const sink = () => {};
    expect(await runMain({ argv: [], env: {}, sink })).toBe(64);
    expect(await runMain({ argv: ["crawl"], env: {}, sink })).toBe(64);
    expect(await runMain({ argv: ["run", "extra"], env: {}, sink })).toBe(64);
    expect(await runMain({ argv: ["run", "--loop", "extra"], env: {}, sink })).toBe(64);
    // --loop without a valid configuration stops before any network activity.
    expect(await runMain({ argv: ["run", "--loop"], env: {}, sink })).toBe(1);
  });
});
