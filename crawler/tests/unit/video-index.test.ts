/**
 * The video frame index (video-fingerprints spec WP20): multi-index hashing
 * over the frames a video pool entry carries. Correctness is pinned against a
 * brute-force scan at real Hamming distances, including the pigeonhole
 * boundary at the capped threshold (31: one chunk of 16 must always be within
 * one bit), the per-video best distance, withdrawal, and lower thresholds.
 * Synthetic hashes only, generated in code.
 */
import { describe, expect, it } from "vitest";
import { effectiveThreshold, packHex, popcount32 } from "../../src/match/matcher.ts";
import { chunkNeighborhood, VideoFrameIndex, type VideoPoolEntry } from "../../src/match/video-index.ts";
import { flipBits, randomFingerprint } from "../support/synthetic.ts";

const hamming = (a: string, b: string): number => {
  const x = new Uint32Array(8);
  const y = new Uint32Array(8);
  packHex(a, x, 0);
  packHex(b, y, 0);
  let d = 0;
  for (let w = 0; w < 8; w++) d += popcount32(x[w]! ^ y[w]!);
  return d;
};

const video = (id: string, frames: string[]): VideoPoolEntry => ({ id, kind: "video", frames });

/** Brute force: every video whose best frame is within the threshold. */
function bruteForce(entries: readonly VideoPoolEntry[], hex: string, threshold: number) {
  const found = new Map<string, number>();
  for (const entry of entries) {
    let best: number | undefined;
    for (const frame of entry.frames) {
      const d = hamming(frame, hex);
      if (d <= threshold && (best === undefined || d < best)) best = d;
    }
    if (best !== undefined) found.set(entry.id, best);
  }
  return [...found.entries()]
    .map(([fingerprintId, distance]) => ({ fingerprintId, distance }))
    .sort((a, b) => a.distance - b.distance || (a.fingerprintId < b.fingerprintId ? -1 : 1));
}

describe("chunkNeighborhood", () => {
  it("radius 0 is the exact value alone", () => {
    expect(chunkNeighborhood(0xabcd, 0)).toEqual([0xabcd]);
  });

  it("radius 1 adds the sixteen one-bit neighbours and nothing else", () => {
    const out = chunkNeighborhood(0xabcd, 1);
    expect(out).toHaveLength(17);
    expect(new Set(out).size).toBe(17);
    for (const value of out) expect(hamming16(0xabcd, value)).toBeLessThanOrEqual(1);
  });

  it("radius 2 covers exactly the values within two bits", () => {
    const out = chunkNeighborhood(0x1234, 2);
    expect(out).toHaveLength(1 + 16 + 120);
    for (const value of out) expect(hamming16(0x1234, value)).toBeLessThanOrEqual(2);
  });
});

function hamming16(a: number, b: number): number {
  return popcount32((a ^ b) & 0xffff);
}

describe("VideoFrameIndex", () => {
  it("finds an exact frame and reports distance 0", () => {
    const base = randomFingerprint(1);
    const index = new VideoFrameIndex([video("fp-1", [randomFingerprint(2), base])], 31);
    expect(index.videoCount).toBe(1);
    expect(index.frameCount).toBe(2);
    expect(index.match(base)).toEqual([{ fingerprintId: "fp-1", distance: 0 }]);
  });

  it("matches near frames within the threshold and not beyond it", () => {
    const base = randomFingerprint(3);
    const index = new VideoFrameIndex([video("fp-1", [base])], 31);
    expect(index.match(flipBits(base, 31))).toEqual([{ fingerprintId: "fp-1", distance: 31 }]);
    expect(index.match(flipBits(base, 32))).toEqual([]);
    // The threshold comes from the pool and is capped at 31 like the Matcher's.
    const uncapped = new VideoFrameIndex([video("fp-1", [base])], 500);
    expect(uncapped.threshold).toBe(effectiveThreshold(500));
    expect(uncapped.match(flipBits(base, 32))).toEqual([]);
  });

  it("reports each video once, at its best frame distance", () => {
    const base = randomFingerprint(4);
    const index = new VideoFrameIndex([video("fp-1", [flipBits(base, 12, 1), flipBits(base, 5, 2)])], 31);
    expect(index.match(base)).toEqual([{ fingerprintId: "fp-1", distance: 5 }]);
  });

  it("matches two videos sharing a frame as two separate results, best first", () => {
    const shared = randomFingerprint(5);
    const index = new VideoFrameIndex(
      [video("fp-b", [flipBits(shared, 9, 3)]), video("fp-a", [shared])],
      31,
    );
    expect(index.match(shared)).toEqual([
      { fingerprintId: "fp-a", distance: 0 },
      { fingerprintId: "fp-b", distance: 9 },
    ]);
  });

  it("withdraw stops a video matching and updates has and idSetView", () => {
    const base = randomFingerprint(6);
    const index = new VideoFrameIndex([video("fp-1", [base]), video("fp-2", [flipBits(base, 1, 4)])], 31);
    expect(index.has("fp-1")).toBe(true);
    index.withdraw("fp-1");
    expect(index.has("fp-1")).toBe(false);
    expect([...index.idSetView()]).toEqual(["fp-2"]);
    expect(index.match(base)).toEqual([{ fingerprintId: "fp-2", distance: 1 }]);
  });

  it("handles duplicate frames within a video and an empty pool", () => {
    const base = randomFingerprint(7);
    const dup = new VideoFrameIndex([video("fp-1", [base, base])], 31);
    expect(dup.frameCount).toBe(2);
    expect(dup.match(base)).toEqual([{ fingerprintId: "fp-1", distance: 0 }]);
    const empty = new VideoFrameIndex([], 31);
    expect(empty.match(base)).toEqual([]);
    expect(empty.has("fp-1")).toBe(false);
  });

  it("stays correct at lower thresholds (sub-radius 0: an exact chunk must exist)", () => {
    const base = randomFingerprint(8);
    // At threshold 15 the guarantee is an error-free chunk: 15 differing
    // bits cannot touch all 16 chunks.
    for (const threshold of [0, 8, 15]) {
      const index = new VideoFrameIndex([video("fp-1", [base])], threshold);
      const query = flipBits(base, threshold, 100 + threshold);
      expect(index.match(query)).toEqual([{ fingerprintId: "fp-1", distance: threshold }]);
      expect(index.match(flipBits(base, threshold + 1, 200 + threshold))).toEqual([]);
    }
  });

  it("agrees with a brute-force scan over random pools and queries (property)", () => {
    const entries: VideoPoolEntry[] = [];
    for (let v = 0; v < 12; v++) {
      const frames: string[] = [];
      for (let f = 0; f < 8; f++) frames.push(randomFingerprint(1000 + v * 100 + f));
      entries.push(video(`fp-${v}`, frames));
    }
    const index = new VideoFrameIndex(entries, 31);
    const queries: string[] = [];
    for (let i = 0; i < 40; i++) {
      const frame = entries[i % entries.length]!.frames[i % 8]!;
      queries.push(flipBits(frame, i % 32, 300 + i)); // 0..31 differing bits
      queries.push(randomFingerprint(5000 + i)); // unrelated
    }
    for (const query of queries) {
      expect(index.match(query)).toEqual(bruteForce(entries, query, 31));
    }
    // A second index at a lower threshold agrees with the same scan.
    const lower = new VideoFrameIndex(entries, 12);
    for (const query of queries) {
      expect(lower.match(query)).toEqual(bruteForce(entries, query, 12));
    }
  });

  it("keeps every boundary distance findable at the capped threshold (pigeonhole)", () => {
    // Distances 0..31 must all be found; 32 must not.
    const base = randomFingerprint(9);
    const index = new VideoFrameIndex([video("fp-1", [base])], 31);
    for (let d = 0; d <= 31; d++) {
      const found = index.match(flipBits(base, d, 400 + d));
      expect(found).toEqual([{ fingerprintId: "fp-1", distance: d }]);
    }
    expect(index.match(flipBits(base, 32, 500))).toEqual([]);
  });

  it("indexes a thousand-frame video like any other", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => randomFingerprint(10_000 + i));
    const target = frames[437]!;
    const index = new VideoFrameIndex([video("fp-big", frames), video("fp-small", [flipBits(target, 3, 11)])], 31);
    expect(index.frameCount).toBe(1001);
    const found = index.match(target);
    expect(found).toEqual([
      { fingerprintId: "fp-big", distance: 0 },
      { fingerprintId: "fp-small", distance: 3 },
    ]);
  });
});
