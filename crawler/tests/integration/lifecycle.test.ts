/**
 * Run lifecycle against the fixture site: switched off (503), bad key (401),
 * graceful stop, pool re-sync that withdraws a fingerprint, stale pool,
 * flaky findings endpoint, global budgets.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, Source } from "../../src/asmita/client.ts";
import { runMain } from "../../src/cli.ts";
import { POOL_MAX_AGE_MS } from "../../src/crawler.ts";
import { EXIT } from "../../src/exit-codes.ts";
import { buildFixture, fixtureEnv, fixtureSeedUrl, FIXTURE_HOSTS, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { loopbackTestPolicy } from "../support/test-policy.ts";

let fx: Fixture;
const servers: MockAsmita[] = [];

const source = (delayMs = 0, pageBudget = 50): Source => ({ id: "src-fixture", kind: "site", domain: SOURCE_DOMAIN, pageBudget, delayMs, origin: "admin", hops: 0, render: "http" });

async function mock(opts: Partial<MockAsmitaOptions> = {}): Promise<MockAsmita> {
  const m = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, sources: [source()], seedUrl: fixtureSeedUrl(fx.site.port), ...opts }).start();
  servers.push(m);
  return m;
}

beforeAll(async () => {
  fx = await buildFixture();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

describe("run lifecycle", () => {
  it("exits 0 without crawling when the crawler is switched off (503)", async () => {
    const api = await mock({ status: { sources: 503 } });
    const before = fx.site.requests.length;
    const lines: string[] = [];
    const code = await runMain({
      argv: ["run"],
      env: fixtureEnv(api.url, TEST_KEY),
      policy: loopbackTestPolicy(FIXTURE_HOSTS, fx.site.port),
      sink: (l) => lines.push(l),
    });
    expect(code).toBe(0);
    expect(fx.site.requests.length).toBe(before);
    expect(lines.some((l) => l.includes('"outcome":"disabled"'))).toBe(true);
  });

  it("exits 2 when the service key is rejected (401)", async () => {
    const api = await mock({ key: "a-different-key-that-the-crawler-does-not-have" });
    const lines: string[] = [];
    const code = await runMain({
      argv: ["run"],
      env: fixtureEnv(api.url, TEST_KEY),
      policy: loopbackTestPolicy(FIXTURE_HOSTS, fx.site.port),
      sink: (l) => lines.push(l),
    });
    expect(code).toBe(2);
    expect(lines.some((l) => l.includes('"code":"api_unauthorized"'))).toBe(true);
  });

  it("exits 1 with only key names on invalid config", async () => {
    const lines: string[] = [];
    const code = await runMain({ argv: ["run"], env: { ASMITA_API_URL: "http://example.invalid" }, sink: (l) => lines.push(l) });
    expect(code).toBe(1);
    expect(lines.join("")).not.toContain("example.invalid");
    expect(lines.join("")).toContain("ASMITA_API_URL");
  });

  it("stops gracefully on a stop request, flushes findings and reports 'stopped'", async () => {
    const api = await mock({ sources: [source(150)] });
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 1200);
    const { result } = await runFixtureCrawl(fx.site, api, { stopSignal: stop.signal });
    expect(result.outcome).toBe("stopped");
    // Whatever was found before the stop was delivered, not lost.
    expect(result.summary.findingsUnsent).toBe(0);
    expect(result.summary.findingsPosted).toBe(result.summary.matches);
    expect(result.summary.pagesAttempted as number).toBeLessThan(12);
  }, 30_000);

  it("drops a fingerprint removed from the pool at re-sync", async () => {
    const withdrawn: Pool = { ...fx.pool, version: "fixture-2", fingerprints: fx.pool.fingerprints.filter((f) => f.id !== "fp-b" && f.id !== "fp-a") };
    const api = await mock({ poolAfterFirst: withdrawn, sources: [source(40)] });
    const { result } = await runFixtureCrawl(fx.site, api, { poolResyncMs: 30 });
    expect(result.summary.poolSyncs as number).toBeGreaterThan(1);
    const ids = new Set(api.posted.map((f) => f.fingerprintId));
    // Withdrawn ids are never posted, whether they were matched before the
    // re-sync (purged from the queue; unit-tested in findings.test.ts) or after.
    expect(ids.has("fp-b")).toBe(false);
    expect(ids.has("fp-a")).toBe(false);
    expect(ids.has("fp-c")).toBe(true);
    expect(result.summary.findingsRejected).toBe(0);
  }, 30_000);

  it("drops a fingerprint the server no longer accepts and counts the rejection", async () => {
    // A tiny server body limit also forces 413 -> split -> resend down to
    // single-finding batches; nothing may be lost or sent twice.
    const api = await mock({ notAccepted: ["fp-two-1"], bodyLimit: 900 });
    const { result } = await runFixtureCrawl(fx.site, api);
    const rejected = result.summary.rejectedByReason as Record<string, number>;
    expect(rejected).toEqual({ fingerprint_not_accepted: 1 });
    expect(api.created.size).toBe(fx.expected.length - 1);
    expect(api.posted.filter((f) => f.fingerprintId === "fp-two-1")).toHaveLength(1);
    expect((result.summary.errors as Record<string, number>).api_payload_too_large ?? 0).toBeGreaterThan(0);
    expect(result.summary.findingsUnsent).toBe(0);
    expect(api.badRequests).toEqual([]);
  }, 30_000);

  it("stops matching when the pool is older than 60 minutes", async () => {
    const api = await mock({ status: {}, sources: [source()] });
    const t = Date.now();
    let calls = 0;
    // Clock jumps past the max pool age right after the pool is loaded.
    const now = () => (++calls > 3 ? t + POOL_MAX_AGE_MS + 1 : t);
    const { result } = await runFixtureCrawl(fx.site, api, { now });
    expect(result.outcome).toBe("pool_stale");
    expect(api.posted.length).toBe(0);
    expect(result.exitCode).toBe(EXIT.POOL_STALE);
    expect(result.summary.exitCode).toBe(5);
  }, 30_000);

  it("retries a flaky findings endpoint without losing or duplicating findings", async () => {
    const api = await mock({ failFirst: { findings: 1 } });
    const { result } = await runFixtureCrawl(fx.site, api, { env: { API_ATTEMPTS: "3" } });
    expect(api.created.size).toBe(fx.expected.length);
    expect(result.summary.findingsAccepted).toBe(fx.expected.length);
    expect(result.summary.findingsUnsent).toBe(0);
  }, 30_000);

  it("honours global page and image budgets (counting attempts)", async () => {
    const api = await mock();
    const { result } = await runFixtureCrawl(fx.site, api, { env: { MAX_PAGES: "2", MAX_IMAGES: "3" } });
    expect(result.outcome).toBe("budget");
    expect(result.summary.pagesAttempted).toBe(2);
    expect(result.summary.imagesSeen).toBe(3);
  }, 30_000);

  describe("exit codes", () => {
    it("0 for a clean run, even when one source is unreachable", async () => {
      const down: Source = { id: "src-down", kind: "site", domain: "unreachable.test", pageBudget: 5, delayMs: 0, origin: "admin", hops: 0, render: "http" };
      const api = await mock({ sources: [source(), down] });
      const { result } = await runFixtureCrawl(fx.site, api);
      expect(result.exitCode).toBe(EXIT.OK);
      expect(result.summary.exitCode).toBe(0);
      // Its robots.txt could not be fetched, so it was treated as disallow-all.
      expect((result.summary.robots as Record<string, number>).unreachable).toBeGreaterThan(0);
      expect((result.summary.errors as Record<string, number>).robots_disallowed).toBeGreaterThan(0);
      expect(api.created.size).toBe(fx.expected.length);
    }, 30_000);

    it("2 when the key is rejected mid-run (findings endpoint 401)", async () => {
      const api = await mock({ status: { findings: 401 } });
      const lines: string[] = [];
      const code = await runMain({
        argv: ["run"],
        env: fixtureEnv(api.url, TEST_KEY),
        policy: loopbackTestPolicy(FIXTURE_HOSTS, fx.site.port),
        sink: (l) => lines.push(l),
      });
      expect(code).toBe(EXIT.UNAUTHORIZED);
      expect(lines.some((l) => l.includes('"outcome":"unauthorized"'))).toBe(true);
    }, 30_000);

    it("3 when findings are still undelivered at exit", async () => {
      const api = await mock({ status: { findings: 502 } });
      const { result } = await runFixtureCrawl(fx.site, api, { env: { API_ATTEMPTS: "1" } });
      expect(result.summary.findingsUnsent).toBe(fx.expected.length);
      expect(result.exitCode).toBe(EXIT.FINDINGS_UNDELIVERED);
    }, 30_000);

    it("4 when the server refuses a batch as malformed (400)", async () => {
      const api = await mock({ status: { findings: 400 } });
      const { result } = await runFixtureCrawl(fx.site, api);
      expect(result.summary.findingsFailed).toBe(fx.expected.length);
      expect(result.exitCode).toBe(EXIT.CONTRACT_ERROR);
      expect((result.summary.problems as Record<string, number>).contractErrors).toBe(fx.expected.length);
    }, 30_000);

    it("4 when the server rejects findings as page_not_in_source (a scope bug)", async () => {
      const api = await mock({ sourceDomainOverride: "elsewhere.test" });
      // The override also applies to the frontier's link scope check, so the
      // run would stop after the seed page; seed the page set directly (the
      // mock's addPage) to give the findings path its full batch of work.
      const port = fx.site.port;
      for (const p of ["/", "/gallery", "/lazy", "/moved", "/level1", "/level2", "/doc.pdf", "/private/secret", "/nofollow-page", "/goaway"]) {
        api.addPage("src-fixture", `http://${SOURCE_DOMAIN}:${port}${p}`, 0);
      }
      api.addPage("src-fixture", `http://www.${SOURCE_DOMAIN}:${port}/sub`, 0);
      const { result } = await runFixtureCrawl(fx.site, api);
      expect((result.summary.rejectedByReason as Record<string, number>).page_not_in_source).toBe(fx.expected.length);
      expect((result.summary.problems as Record<string, number>).scopeErrors).toBe(fx.expected.length);
      expect(result.exitCode).toBe(EXIT.CONTRACT_ERROR);
    }, 30_000);

    it("0 and every finding accepted against a server still sending created/duplicate", async () => {
      let clock = Date.now();
      const api = await mock({ legacyStatuses: true, now: () => clock });
      const first = await runFixtureCrawl(fx.site, api);
      // A second run the next day: every page is due again, the same
      // findings are re-posted and the server answers "duplicate".
      clock += 25 * 60 * 60 * 1000;
      const second = await runFixtureCrawl(fx.site, api);
      expect(first.result.summary.findingsAccepted).toBe(fx.expected.length);
      expect(second.result.summary.findingsAccepted).toBe(fx.expected.length);
      expect(second.result.exitCode).toBe(EXIT.OK);
    }, 60_000);

    it("0 when the crawler is switched off mid-run, even with findings unsent", async () => {
      const api = await mock({ status: { findings: 503 } });
      const { result } = await runFixtureCrawl(fx.site, api);
      expect(result.outcome).toBe("disabled");
      expect(result.exitCode).toBe(EXIT.OK);
    }, 30_000);
  });
});
