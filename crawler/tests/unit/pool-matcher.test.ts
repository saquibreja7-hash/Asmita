/**
 * The pool matcher (video-fingerprints spec WP20): the image Matcher and the
 * video frame index behind one interface — combined, ordered results tagged
 * by kind; has/idSetView/withdraw covering both; and the counts the logs
 * carry. Synthetic hashes only.
 */
import { describe, expect, it } from "vitest";
import { PoolMatcher, type PoolFingerprint } from "../../src/match/pool-matcher.ts";
import { flipBits, randomFingerprint } from "../support/synthetic.ts";

describe("PoolMatcher", () => {
  it("splits the pool: images to the Matcher, videos to the frame index", () => {
    const imageHash = randomFingerprint(1);
    const frame = randomFingerprint(2);
    const pool: PoolFingerprint[] = [
      { id: "fp-img", pdq: imageHash, quality: 90 },
      { id: "fp-vid", kind: "video", frames: [frame, randomFingerprint(3)] },
      { id: "fp-img-2", pdq: flipBits(imageHash, 4, 5), quality: 80 },
    ];
    const matcher = new PoolMatcher(pool, 31);
    expect(matcher.imageSize).toBe(2);
    expect(matcher.videoCount).toBe(1);
    expect(matcher.frameCount).toBe(2);
    expect(matcher.size).toBe(3);
    expect(matcher.images.size).toBe(2);
    expect(matcher.videos.frameCount).toBe(2);
  });

  it("merges image and video hits, tagged by kind, best distance first", () => {
    const imageHash = randomFingerprint(10);
    const pool: PoolFingerprint[] = [
      { id: "fp-img-far", pdq: flipBits(imageHash, 9, 11), quality: 90 },
      { id: "fp-img-near", pdq: flipBits(imageHash, 2, 12), quality: 90 },
      { id: "fp-vid-b", kind: "video", frames: [flipBits(imageHash, 6, 13)] },
      { id: "fp-vid-a", kind: "video", frames: [imageHash] },
    ];
    const matcher = new PoolMatcher(pool, 31);
    expect(matcher.match(imageHash)).toEqual([
      { fingerprintId: "fp-vid-a", distance: 0, kind: "video" },
      { fingerprintId: "fp-img-near", distance: 2, kind: "image" },
      { fingerprintId: "fp-vid-b", distance: 6, kind: "video" },
      { fingerprintId: "fp-img-far", distance: 9, kind: "image" },
    ]);
  });

  it("keeps the Matcher's image behaviour untouched (quality, threshold cap)", () => {
    const hash = randomFingerprint(20);
    const matcher = new PoolMatcher([{ id: "fp-img", pdq: hash, quality: 100 }], 31);
    expect(matcher.match(hash)).toEqual([{ fingerprintId: "fp-img", distance: 0, kind: "image" }]);
    expect(matcher.match(flipBits(hash, 32, 21))).toEqual([]);
  });

  it("has and idSetView cover both kinds; withdraw hits both", () => {
    const hash = randomFingerprint(30);
    const pool: PoolFingerprint[] = [
      { id: "fp-img", pdq: hash, quality: 90 },
      { id: "fp-vid", kind: "video", frames: [hash] },
    ];
    const matcher = new PoolMatcher(pool, 31);
    expect(matcher.has("fp-img")).toBe(true);
    expect(matcher.has("fp-vid")).toBe(true);
    expect([...matcher.idSetView()].sort()).toEqual(["fp-img", "fp-vid"]);

    matcher.withdraw("fp-vid");
    expect(matcher.has("fp-vid")).toBe(false);
    expect([...matcher.idSetView()]).toEqual(["fp-img"]);
    expect(matcher.match(hash)).toEqual([{ fingerprintId: "fp-img", distance: 0, kind: "image" }]);

    matcher.withdraw("fp-img");
    expect(matcher.has("fp-img")).toBe(false);
    expect(matcher.match(hash)).toEqual([]);
  });

  it("accepts an empty pool and video frames only", () => {
    const empty = new PoolMatcher([], 31);
    expect(empty.size).toBe(0);
    expect(empty.match(randomFingerprint(40))).toEqual([]);

    const hash = randomFingerprint(41);
    const videosOnly = new PoolMatcher([{ id: "fp-vid", kind: "video", frames: [hash] }], 31);
    expect(videosOnly.imageSize).toBe(0);
    expect(videosOnly.match(hash)).toEqual([{ fingerprintId: "fp-vid", distance: 0, kind: "video" }]);
  });
});
