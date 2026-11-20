/**
 * The SSCD second matching layer (WP28) end to end, against the sscd
 * fixture. The crawl runs with the real decoder child and a deterministic
 * in-process stand-in for the SSCD child (fakeSscdEmbed), so the pipeline
 * itself is what is proven here — the scope gate, the per-run budget, the
 * seeding offer, the borderline analyst score, the sscd finding shape and
 * the off switch. The real model's quality and speed are what
 * scripts/eval-sscd.ts measures.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSscdFixture, fixtureSeedUrl, SSCD_HOST, TEST_KEY, type SscdFixture } from "../support/fixture-site.ts";
import { fakeSscdEmbed } from "../support/synthetic.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";
import { SSCD_BORDERLINE_MIN_DISTANCE } from "../../src/crawler.ts";

let fx: SscdFixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildSscdFixture();
}, 30_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

/** The env of an SSCD-enabled run (the fake embedder replaces the child). */
const SSCD_ENV = {
  ENABLE_SSCD: "true",
  SSCD_MODEL_FILE: "/test/model/sscd.onnx",
  SSCD_THRESHOLD: "0.75",
};

function source(matched = true) {
  return {
    id: "src-sscd",
    kind: "site" as const,
    domain: SSCD_HOST,
    pageBudget: 20,
    delayMs: 0,
    origin: "admin" as const,
    hops: 0,
    render: "http" as const,
    ...(matched ? { matched: true } : {}),
  };
}

async function mock(opts: Partial<MockAsmitaOptions> = {}): Promise<MockAsmita> {
  const port = fx.site.port;
  const api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [source()],
    seedUrl: fixtureSeedUrl(fx.site.port),
    sscd: {
      model: "sscd_disc_mixup",
      version: "onnx-1",
      // The analyst confirmed the copy at this exact location.
      confirmedFindings: [
        {
          fingerprintId: "fp-sscd",
          pageUrl: `http://${SSCD_HOST}:${port}/confirmed.html`,
          imageUrl: `http://${SSCD_HOST}:${port}/img/confirmed.png`,
        },
      ],
    },
    ...opts,
  }).start();
  servers.push(api);
  return api;
}

const cleanLog = (lines: string[]) => assertCleanLog(lines.join("\n"), { hostnames: [SSCD_HOST], hashes: fx.allHashes });

describe("the SSCD second matching layer (WP28)", () => {
  it("finds an altered copy PDQ misses, seeds the confirmed copy, and scores the borderline match", async () => {
    // The fixture's honest premise: PDQ cannot see the altered variant,
    // the descriptor can, and the decoy matches nothing.
    expect(fx.variantPdqDistance).toBeGreaterThan(31);
    expect(fx.variantSimilarity).toBeGreaterThanOrEqual(0.75);
    expect(fx.variantSimilarity).toBeLessThanOrEqual(1);
    expect(fx.decoySimilarity).toBeLessThan(0.75);

    const api = await mock({ sources: [source()] });
    const { result, lines } = await runFixtureCrawl(fx.site, api, { hosts: ["sscd.fixture.test"], env: SSCD_ENV, sscd: { embed: fakeSscdEmbed } });
    expect(result.exitCode).toBe(0);
    expect(result.outcome).toBe("completed");

    const port = fx.site.port;
    // Exactly the four expected findings: the confirmed copy twice (one
    // exact, one borderline), the altered copy twice (both layers of the
    // same image: the second layer found it against both fingerprints).
    expect(api.created.size).toBe(4);
    expect(api.badRequests).toEqual([]);

    const pdqSscd = api.posted.find((f) => f.fingerprintId === "fp-sscd" && f.imageUrl.includes("/img/confirmed.png"));
    const pdqBorder = api.posted.find((f) => f.fingerprintId === "fp-border" && f.imageUrl.includes("/img/confirmed.png"));
    expect(pdqSscd?.method).toBe("pdq");
    expect(pdqSscd?.distance).toBe(0);
    expect(pdqSscd?.sscdSimilarity).toBeUndefined();
    // The borderline PDQ match carries the analyst score — never an
    // automatic accept or reject, so it is data on a pdq finding.
    expect(pdqBorder?.method).toBe("pdq");
    expect(pdqBorder?.distance).toBeGreaterThanOrEqual(SSCD_BORDERLINE_MIN_DISTANCE);
    expect(pdqBorder?.distance).toBeLessThanOrEqual(31);
    expect(pdqBorder?.sscdSimilarity).toBeGreaterThanOrEqual(0.99);

    const sscdFindings = api.posted.filter((f) => f.method === "sscd");
    expect(sscdFindings.length).toBe(2);
    for (const f of sscdFindings) {
      expect(f.imageUrl).toBe(`http://sscd.fixture.test:${port}/img/variant.png`);
      expect(f.pageUrl).toBe(`http://sscd.fixture.test:${port}/altered.html`);
      expect(f.distance).toBeUndefined();
      expect(f.sscdSimilarity).toBeGreaterThanOrEqual(0.75);
      expect(f.sscdSimilarity).toBeLessThanOrEqual(1);
      expect(f.quality).toBeGreaterThanOrEqual(50);
      expect(f.sourceId).toBe("src-sscd");
    }
    // The decoy matched nothing.
    expect(api.posted.some((f) => f.imageUrl.includes("/img/decoy.png"))).toBe(false);

    // Seeding: the crawler offered the embedding of the confirmed copy
    // while it held the bytes; the app kept it only for the confirmed
    // finding (the borderline fingerprint's offer was refused).
    expect(api.postedEmbeddings.length).toBe(2);
    expect(api.storedEmbeddings.size).toBe(1);
    const stored = [...api.storedEmbeddings.values()][0]!;
    expect(stored.fingerprintId).toBe("fp-sscd");
    expect(stored.model).toBe("sscd_disc_mixup");
    expect(stored.version).toBe("onnx-1");
    expect(stored.vector.length).toBe(16);

    // The summary's sscd counters (counts only): three inferences (the
    // confirmed copy's seeding, the altered copy, the decoy), two
    // second-layer hits, one stored and one refused embedding.
    expect(result.summary.sscdInferences).toBe(3);
    expect(result.summary.sscdMatches).toBe(2);
    expect(result.summary.sscdSkippedBudget).toBe(0);
    expect(result.summary.sscdSkippedScope).toBe(0);
    expect(result.summary.sscdEmbeddingsPosted).toBe(2);
    expect(result.summary.sscdEmbeddingsStored).toBe(1);
    expect(result.summary.sscdEmbeddingsRejected).toBe(1);
    expect(result.summary.sscdEmbeddingsUnsent).toBe(0);
    expect(result.summary.matches).toBe(4);
    // The test's in-process embedder has no child, so no sscd child block.
    expect(result.summary).not.toHaveProperty("sscd");

    // The pool logs carry the embedding count; the log scan stays clean
    // (no URL, no fingerprint, no vector ever logged).
    const loaded = lines.find((l) => l.includes("pool_loaded"));
    expect(loaded).toContain('"poolEmbeddings":2');
    cleanLog(lines);
  });

  it("changes nothing while ENABLE_SSCD is off", async () => {
    const api = await mock({ sources: [source()] });
    const { result, lines } = await runFixtureCrawl(fx.site, api, { hosts: ["sscd.fixture.test"] });
    expect(result.exitCode).toBe(0);

    // The exact pre-WP28 wire: only the two PDQ findings of the confirmed
    // copy, no method field on anything, and the embeddings route is never
    // called.
    expect(api.created.size).toBe(2);
    expect(api.posted.length).toBe(2);
    for (const f of api.posted) {
      expect(f.method).toBeUndefined();
      expect(f.sscdSimilarity).toBeUndefined();
      expect(f.distance).toBeDefined();
    }
    expect(api.postedEmbeddings.length).toBe(0);
    expect(api.requests.some((r) => r.path === "/api/crawler/embeddings")).toBe(false);

    // The summary carries no sscd fields at all, and the log line has no
    // embedding count to leak.
    expect(result.summary).not.toHaveProperty("sscdInferences");
    expect(result.summary).not.toHaveProperty("sscdMatches");
    expect(result.summary).not.toHaveProperty("sscd");
    const loaded = lines.find((l) => l.includes("pool_loaded"));
    expect(loaded).not.toContain("poolEmbeddings");
    cleanLog(lines);
  });

  it("spends at most SSCD_MAX_PER_RUN inferences and counts the rest as skipped", async () => {
    const api = await mock({ sources: [source()] });
    const { result } = await runFixtureCrawl(fx.site, api, {
      hosts: ["sscd.fixture.test"],
      env: { ...SSCD_ENV, SSCD_MAX_PER_RUN: "1" },
      sscd: { embed: fakeSscdEmbed },
    });
    expect(result.exitCode).toBe(0);
    expect(result.summary.sscdInferences).toBe(1);
    expect(result.summary.sscdSkippedBudget).toBe(2);
    // The PDQ layer is unaffected by the budget.
    expect(api.created.size).toBeGreaterThanOrEqual(2);
    // Whatever inference ran produced at most its own findings; every
    // sscd finding carries a similarity at or above the threshold.
    for (const f of api.posted) {
      if (f.method === "sscd") expect(f.sscdSimilarity!).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("stays inside SSCD_SCOPE=matched_sources and runs everywhere with scope=all", async () => {
    // The app did not flag this source: with the default scope, no SSCD
    // inference may run on it.
    const unmatched = source(false);
    const api = await mock({ sources: [unmatched] });
    const scoped = await runFixtureCrawl(fx.site, api, {
      hosts: ["sscd.fixture.test"],
      env: SSCD_ENV,
      sscd: { embed: fakeSscdEmbed },
    });
    expect(scoped.result.exitCode).toBe(0);
    expect(scoped.result.summary.sscdInferences).toBe(0);
    expect(scoped.result.summary.sscdSkippedScope).toBe(3);
    expect(scoped.result.summary.sscdMatches).toBe(0);
    expect(api.postedEmbeddings.length).toBe(0);
    // The PDQ layer is unaffected: both findings still happen, labelled.
    expect(api.created.size).toBe(2);
    expect(api.posted.every((f) => f.method === "pdq")).toBe(true);

    // With scope=all the same source runs the second layer.
    const api2 = await mock({ sources: [unmatched] });
    const everywhere = await runFixtureCrawl(fx.site, api2, {
      hosts: ["sscd.fixture.test"],
      env: { ...SSCD_ENV, SSCD_SCOPE: "all" },
      sscd: { embed: fakeSscdEmbed },
    });
    expect(everywhere.result.exitCode).toBe(0);
    expect(everywhere.result.summary.sscdInferences).toBe(3);
    expect(everywhere.result.summary.sscdSkippedScope).toBe(0);
    expect(everywhere.result.summary.sscdMatches).toBe(2);
  });
});
