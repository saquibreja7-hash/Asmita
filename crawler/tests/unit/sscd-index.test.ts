/**
 * The brute-force cosine index over the pool's SSCD embeddings (WP28):
 * threshold behaviour, best-per-fingerprint scores, withdrawal, and the
 * dimension-mismatch rule (a server bug can never produce a wrong number).
 */
import { describe, expect, it } from "vitest";
import { dot, EmbeddingIndex } from "../../src/match/sscd-index.ts";

const norm = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
};

describe("EmbeddingIndex (WP28)", () => {
  it("matches every fingerprint whose best vector reaches the threshold, best first", () => {
    const index = new EmbeddingIndex(
      [
        { id: "a", vectors: [norm([1, 0, 0, 0])] },
        { id: "b", vectors: [norm([0.9, 0.1, 0, 0]), norm([0, 0, 1, 0])] },
        { id: "c", vectors: [norm([0, 0, 0, 1])] },
      ],
      0.8,
    );
    const hits = index.match(norm([1, 0, 0, 0]));
    expect(hits.map((h) => h.fingerprintId)).toEqual(["a", "b"]);
    expect(hits[0]!.similarity).toBeGreaterThan(hits[1]!.similarity);
    expect(hits[1]!.similarity).toBeCloseTo(0.9939, 3);
  });

  it("keeps the threshold boundary exact", () => {
    const index = new EmbeddingIndex([{ id: "a", vectors: [norm([1, 0])] }], 0.8);
    expect(index.match(norm([1, 0]))).toHaveLength(1);
    // cos([1,0], [0.6, 0.8]) = 0.6 < 0.8: no hit.
    expect(index.match(norm([0.6, 0.8]))).toHaveLength(0);
  });

  it("scores one fingerprint's best vector and reports none for the rest", () => {
    const index = new EmbeddingIndex(
      [
        { id: "a", vectors: [norm([1, 0]), norm([0, 1])] },
        { id: "b", vectors: [norm([0, 0, 1])] },
      ],
      0.5,
    );
    expect(index.score("a", norm([0.9, 0.436]))!.toFixed(3)).toBe("0.900");
    // Orthogonal, so no similarity — but a number, not null: the query is
    // comparable, it simply does not look like b's vector.
    expect(index.score("b", norm([1, 0, 0]))).toBe(0);
    expect(index.score("missing", norm([1, 0, 0]))).toBeNull();
    expect(index.hasEmbeddings("a")).toBe(true);
    expect(index.hasEmbeddings("missing")).toBe(false);
  });

  it("withdraws a fingerprint at once", () => {
    const index = new EmbeddingIndex([{ id: "a", vectors: [norm([1, 0])] }], 0.5);
    index.withdraw("a");
    expect(index.match(norm([1, 0]))).toHaveLength(0);
    expect(index.score("a", norm([1, 0]))).toBeNull();
    expect(index.hasEmbeddings("a")).toBe(false);
    expect(index.has("a")).toBe(false);
  });

  it("never compares vectors of different dimensions", () => {
    const index = new EmbeddingIndex([{ id: "a", vectors: [norm([1, 0, 0])] }], 0.5);
    // A dimension mismatch is a server bug: no similarity at all, never a
    // number, and never a match.
    expect(index.score("a", norm([1, 0]))).toBeNull();
    expect(index.match(norm([1, 0]))).toHaveLength(0);
    expect(dot([1, 0], [1, 0, 0])).toBe(-1);
  });

  it("counts only fingerprints with embeddings and tolerates duplicates", () => {
    const index = new EmbeddingIndex(
      [
        { id: "a", vectors: [norm([1, 0])] },
        { id: "a", vectors: [norm([0, 1])] },
        { id: "b", vectors: [] },
      ],
      0.5,
    );
    expect(index.size).toBe(1);
  });
});
