/**
 * Automatic discovery of new sites (crawler v2 WP5), end to end against the
 * discovery fixture and the mock API's mirror of the app's rules:
 *   - a chain a.test -> b.test -> c.test -> d.test: b and c are crawled
 *     automatically once the app lists them; d, three hops out, is stored
 *     disabled and never fetched;
 *   - a never-crawl host is neither stored nor fetched;
 *   - the per-run cap (MAX_DISCOVERY_HOSTS) and the daily new-site cap hold;
 *   - a match on the third site promotes it in the app's rules;
 *   - the logs carry counts only, never a hostname.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildDiscoveryFixture,
  DISCOVERY_HOSTS,
  fixtureSeedUrl,
  TEST_KEY,
  CHAIN_A, CHAIN_B, CHAIN_C, CHAIN_D, CHAIN_NEVER, CHAIN_CAP, CHAIN_PAIR, CHAIN_CAP_HOSTS, CHAIN_PAIR_HOSTS,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildDiscoveryFixture();
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

const run = (api: MockAsmita, env: Record<string, string> = {}, lines: string[] = []) =>
  runFixtureCrawl(fx.site, api, { hosts: DISCOVERY_HOSTS, env, lines });

const RULES = { maxHops: 2, maxPerDay: 200, pageBudget: 5, reportedBudget: 2000, neverCrawl: [CHAIN_NEVER] };

describe("the discovery chain a -> b -> c -> d", () => {
  it("crawls b and c automatically, stores d disabled, never touches the never-crawl host, and a match promotes c", async () => {
    const api = await mock({
      sources: [siteSource({ id: "src-a", domain: CHAIN_A, pageBudget: 50, delayMs: 0 })],
      discovery: RULES,
    });
    const lines: string[] = [];

    // Run 1: only a.test is a source. Its page links b.test and never.test;
    // both hosts are reported, only b.test becomes a source.
    const first = await run(api, {}, lines);
    expect(first.result.exitCode).toBe(0);
    expect(api.discoveryReports).toEqual([
      { sourceId: "src-a", runId: expect.any(String), hosts: [CHAIN_B, CHAIN_NEVER], accepted: 1 },
    ]);
    expect(api.discovered.get(CHAIN_B)).toMatchObject({
      domain: CHAIN_B, hops: 1, discoveredFromId: "src-a", enabled: true, pageBudget: 5, disabledReason: null,
    });
    expect(api.discovered.has(CHAIN_NEVER)).toBe(false);
    for (const host of [CHAIN_B, CHAIN_C, CHAIN_D, CHAIN_NEVER]) expect(fx.site.requested(host)).toBe(false);

    // Run 2: b.test is a source now and is crawled; its page links c.test.
    const second = await run(api, {}, lines);
    expect(second.result.exitCode).toBe(0);
    expect(fx.site.requested(CHAIN_B, "/")).toBe(true);
    expect(fx.site.requested(CHAIN_C)).toBe(false);
    expect(fx.site.requested(CHAIN_D)).toBe(false);
    expect(fx.site.requested(CHAIN_NEVER)).toBe(false);
    const bId = api.discovered.get(CHAIN_B)!.id;
    expect(api.discovered.get(CHAIN_C)).toMatchObject({ hops: 2, discoveredFromId: bId, enabled: true });
    expect(api.discovered.has(CHAIN_NEVER)).toBe(false);

    // Run 3: c.test is a source, is crawled, and its planted image matches:
    // the app's rules promote it. Its page links d.test, three hops out,
    // which is stored disabled — and still never fetched.
    const third = await run(api, {}, lines);
    expect(third.result.exitCode).toBe(0);
    expect(fx.site.requested(CHAIN_C, "/")).toBe(true);
    expect(fx.site.requested(CHAIN_C, "/img/found.png")).toBe(true);
    expect(api.created.size).toBe(1);
    expect(api.posted).toHaveLength(1);
    expect(api.posted[0]).toMatchObject({ fingerprintId: "fp-chain-c", sourceId: api.discovered.get(CHAIN_C)!.id });
    expect(api.discovered.get(CHAIN_C)).toMatchObject({ hops: 0, pageBudget: 2000, promotedAt: expect.any(Number) });
    expect(api.discovered.get(CHAIN_D)).toMatchObject({ hops: 3, enabled: false, disabledReason: "max_hops" });
    expect(fx.site.requested(CHAIN_D)).toBe(false);
    expect(fx.site.requested(CHAIN_NEVER)).toBe(false);

    // Run 4: nothing is due (every fetched page is scheduled 24 h ahead), so
    // a stored-disabled d.test can never be handed out — no request at all.
    const fourth = await run(api, {}, lines);
    expect(fourth.result.exitCode).toBe(0);
    expect(fourth.result.summary.pagesAttempted).toBe(0);
    expect(fx.site.requested(CHAIN_D)).toBe(false);

    // Counts only in the logs: no hostname, no URL, no fingerprint.
    assertCleanLog(lines.join("\n"), { hostnames: DISCOVERY_HOSTS, hashes: fx.allHashes });
  }, 120_000);
});

describe("the per-run cap (MAX_DISCOVERY_HOSTS)", () => {
  it("reports at most the configured distinct hosts and counts the rest as capped", async () => {
    const api = await mock({
      sources: [siteSource({ id: "src-cap", domain: CHAIN_CAP, pageBudget: 50, delayMs: 0 })],
      discovery: RULES,
    });
    const { result } = await run(api, { MAX_DISCOVERY_HOSTS: "2" });
    expect(result.exitCode).toBe(0);
    expect(result.summary.discoveryHostsSeen).toBe(2);
    expect(result.summary.discoveryHostsReported).toBe(2);
    expect(result.summary.discoveryHostsCapped).toBe(3);
    expect(api.discoveryReports).toEqual([
      { sourceId: "src-cap", runId: expect.any(String), hosts: CHAIN_CAP_HOSTS.slice(0, 2), accepted: 2 },
    ]);
  }, 60_000);
});

describe("the daily new-site cap", () => {
  it("auto-enables only the first host of the day; the rest are stored disabled and never fetched", async () => {
    const api = await mock({
      sources: [siteSource({ id: "src-pair", domain: CHAIN_PAIR, pageBudget: 50, delayMs: 0 })],
      discovery: { ...RULES, maxPerDay: 1 },
    });
    const first = await run(api);
    expect(first.result.exitCode).toBe(0);
    expect(api.discovered.get(CHAIN_PAIR_HOSTS[0])).toMatchObject({ hops: 1, enabled: true, disabledReason: null });
    expect(api.discovered.get(CHAIN_PAIR_HOSTS[1])).toMatchObject({ hops: 1, enabled: false, disabledReason: "daily_cap" });

    // A second run crawls the enabled one and never the capped one.
    const second = await run(api);
    expect(second.result.exitCode).toBe(0);
    expect(fx.site.requested(CHAIN_PAIR_HOSTS[0])).toBe(true);
    expect(fx.site.requested(CHAIN_PAIR_HOSTS[1])).toBe(false);
  }, 60_000);
});
