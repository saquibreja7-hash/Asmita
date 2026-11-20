/**
 * WP28's knobs and wire contracts: the config fails closed (only "true"
 * enables; the model path must be absolute then; nothing changes in the
 * defaults while off) and the client schemas accept exactly what the app's
 * strict schemas accept — the sscd finding shape, the borderline score,
 * the pool's embedding block, the sources' matched flag and the embeddings
 * request.
 */
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import {
  EmbeddingsRequestSchema,
  FindingSchema,
  PoolImageEntrySchema,
  SourcesSchema,
} from "../../src/asmita/client.ts";

const BASE = {
  ASMITA_API_URL: "http://127.0.0.1:8787",
  CRAWLER_SERVICE_KEY: "test-service-key-0123456789-abcdefghij",
  CRAWLER_USER_AGENT: "AsmitaCrawler/0.1 (test)",
};

describe("SSCD configuration (WP28)", () => {
  it("is off unless ENABLE_SSCD is exactly \"true\" (anything else is a config error)", () => {
    // On needs its model file too (the refine below); the switch itself is
    // what is pinned here.
    const cfg = loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/m.onnx" });
    expect(cfg.ENABLE_SSCD).toBe(true);
    const off = loadConfig({ ...BASE, ENABLE_SSCD: "false" });
    expect(off.ENABLE_SSCD).toBe(false);
    const unset = loadConfig(BASE);
    expect(unset.ENABLE_SSCD).toBe(false);
    // Fail closed: a typo'd value stops the process, never silently off.
    for (const value of ["1", "yes", "TRUE", "on"]) {
      expect(() => loadConfig({ ...BASE, ENABLE_SSCD: value })).toThrow();
    }
  });

  it("keeps every default while off and never demands a model file", () => {
    const cfg = loadConfig(BASE);
    expect(cfg.SSCD_SCOPE).toBe("matched_sources");
    expect(cfg.SSCD_MAX_PER_RUN).toBe(2000);
    expect(cfg.SSCD_THRESHOLD).toBe(0.85);
    expect(cfg.SSCD_MODEL_ID).toBe("sscd_disc_mixup");
    expect(cfg.SSCD_MODEL_VERSION).toBe("onnx-1");
    expect(cfg.SSCD_MODEL_FILE).toBe("");
    expect(cfg.SSCD_EMBED_DIM).toBe(512);
    expect(cfg.SSCD_TIMEOUT_MS).toBe(20000);
  });

  it("fails closed when the layer is on without an absolute model path", () => {
    expect(() => loadConfig({ ...BASE, ENABLE_SSCD: "true" })).toThrow();
    expect(() => loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "relative/onnx" })).toThrow();
    const cfg = loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/app/models/sscd.onnx" });
    expect(cfg.ENABLE_SSCD).toBe(true);
  });

  it("bounds the threshold and the scope", () => {
    expect(() => loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/m", SSCD_THRESHOLD: "0.2" })).toThrow();
    expect(() => loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/m", SSCD_THRESHOLD: "1.5" })).toThrow();
    expect(() => loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/m", SSCD_SCOPE: "everywhere" })).toThrow();
    const cfg = loadConfig({ ...BASE, ENABLE_SSCD: "true", SSCD_MODEL_FILE: "/m", SSCD_SCOPE: "all", SSCD_MAX_PER_RUN: "0" });
    expect(cfg.SSCD_SCOPE).toBe("all");
    expect(cfg.SSCD_MAX_PER_RUN).toBe(0);
  });
});

const finding = (extra: Record<string, unknown>) => ({
  fingerprintId: "fp-1",
  pageUrl: "http://a.test/p",
  imageUrl: "http://a.test/i.png",
  distance: 10,
  quality: 80,
  observedAt: "2026-11-19T10:00:00.000Z",
  sourceId: "src-1",
  ...extra,
});

describe("the findings contract with the method field (WP28)", () => {
  it("keeps the pre-WP28 shape valid (absent method means pdq)", () => {
    expect(FindingSchema.safeParse(finding({})).success).toBe(true);
  });

  it("accepts an sscd finding only with a similarity and without a distance", () => {
    expect(FindingSchema.safeParse(finding({ method: "sscd", distance: undefined, sscdSimilarity: 0.9 })).success).toBe(true);
    expect(FindingSchema.safeParse(finding({ method: "sscd", distance: 5, sscdSimilarity: 0.9 })).success).toBe(false);
    expect(FindingSchema.safeParse(finding({ method: "sscd", distance: undefined })).success).toBe(false);
    expect(FindingSchema.safeParse(finding({ method: "sscd", distance: undefined, sscdSimilarity: 1.2 })).success).toBe(false);
  });

  it("carries the borderline score on a pdq finding only", () => {
    expect(FindingSchema.safeParse(finding({ method: "pdq", distance: 27, sscdSimilarity: 0.86 })).success).toBe(true);
    expect(FindingSchema.safeParse(finding({ method: "vpdq", distance: 12, sscdSimilarity: 0.86 })).success).toBe(false);
    // A non-sscd finding still needs its distance.
    expect(FindingSchema.safeParse(finding({ method: "pdq", distance: undefined })).success).toBe(false);
  });
});

describe("the pool and sources contracts (WP28)", () => {
  it("accepts an image entry's sscd block and keeps entries without one", () => {
    expect(PoolImageEntrySchema.safeParse({ id: "a", pdq: "0".repeat(64), quality: 90 }).success).toBe(true);
    const withSscd = PoolImageEntrySchema.safeParse({
      id: "a",
      pdq: "0".repeat(64),
      quality: 90,
      sscd: { model: "sscd_disc_mixup", version: "onnx-1", vectors: [[0.1, -0.2], [0.3, 0.4]] },
    });
    expect(withSscd.success).toBe(true);
    // Vectors are bounded in count and value; the model identity is bounded too.
    expect(
      PoolImageEntrySchema.safeParse({
        id: "a",
        pdq: "0".repeat(64),
        quality: 90,
        sscd: { model: "sscd_disc_mixup", version: "onnx-1", vectors: Array.from({ length: 17 }, () => [0.1]) },
      }).success,
    ).toBe(false);
    expect(
      PoolImageEntrySchema.safeParse({
        id: "a",
        pdq: "0".repeat(64),
        quality: 90,
        sscd: { model: "sscd_disc_mixup", version: "onnx-1", vectors: [[1.5]] },
      }).success,
    ).toBe(false);
  });

  it("takes the sources' matched flag as optional (a switched-off app serves none)", () => {
    const sources = SourcesSchema.parse({
      sources: [{ id: "s", kind: "site", domain: "a.test", pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" }],
    });
    expect(sources.sources[0]!.matched).toBeUndefined();
    const flagged = SourcesSchema.parse({
      sources: [{ id: "s", kind: "site", domain: "a.test", pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http", matched: true }],
    });
    expect(flagged.sources[0]!.matched).toBe(true);
  });
});

describe("the embeddings request contract (WP28)", () => {
  const item = (extra: Record<string, unknown>) => ({
    fingerprintId: "fp-1",
    pageUrl: "http://a.test/p",
    imageUrl: "http://a.test/i.png",
    model: "sscd_disc_mixup",
    version: "onnx-1",
    // A 16-dim vector (the schema's floor): the real descriptor is 512.
    vector: Array.from({ length: 16 }, (_, i) => Math.sin(i + 1) / 2),
    ...extra,
  });

  it("accepts a well-formed batch and nothing else", () => {
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: [item({})] }).success).toBe(true);
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: [] }).success).toBe(false);
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: Array.from({ length: 11 }, () => item({})) }).success).toBe(false);
    // Vectors must be at least 16-dim, bounded, finite; no extra fields.
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: [item({ vector: [0.1] })] }).success).toBe(false);
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: [item({ extra: 1 })] }).success).toBe(false);
    const nan = item({}).vector.map((v, i) => (i === 0 ? Number.NaN : v));
    expect(EmbeddingsRequestSchema.safeParse({ runId: "r-1", embeddings: [item({ vector: nan })] }).success).toBe(false);
  });
});
