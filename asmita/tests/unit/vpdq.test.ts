import { describe, expect, it } from "vitest";
import { hammingDistance, PDQ_HASH_PATTERN } from "@/lib/pdq/pdq";
import {
  VPDQ_CLIENT_VERSION,
  VPDQ_DEDUP_DISTANCE,
  VPDQ_MAX_DURATION_SEC,
  VPDQ_MAX_FRAMES,
  VPDQ_MIN_FRAME_QUALITY,
  VpdqError,
  bestFrameQuality,
  finalizeFrames,
  sampleTimes,
  submittedDurationSec,
  toVideoHashItem,
  videoTooLong,
  type VideoFrameHash,
} from "@/lib/pdq/vpdq";

// Two hashes as far apart as PDQ allows, and one a known small distance from
// the first, so the dedup rule is tested on real Hamming distances.
const H0 = "0".repeat(64);
const HF = "f".repeat(64);
// 54 zeros then ten 1-nibbles: Hamming distance 10 from H0 (exactly the cap).
const H10 = "0".repeat(54) + "1".repeat(10);
// 53 zeros then eleven 1-nibbles: distance 11 from H0, distance 1 from H10.
const H11 = "0".repeat(53) + "1".repeat(11);

function frame(hash: string, quality: number, t: number): VideoFrameHash {
  return { hash, quality, t };
}

describe("vPDQ sampling decisions", () => {
  it("samples every whole second inside the video, starting at 0", () => {
    expect(sampleTimes(6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sampleTimes(6.5)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sampleTimes(1)).toEqual([0]);
    expect(sampleTimes(0.4)).toEqual([0]);
  });

  it("samples at most 3600 seconds (the 60-minute cap)", () => {
    const times = sampleTimes(VPDQ_MAX_DURATION_SEC);
    expect(times).toHaveLength(3600);
    expect(times[0]).toBe(0);
    expect(times[3599]).toBe(3599);
  });

  it("refuses videos longer than 60 minutes, and only those", () => {
    expect(videoTooLong(600)).toBe(false);
    expect(videoTooLong(3600)).toBe(false);
    expect(videoTooLong(3600.1)).toBe(true);
    expect(videoTooLong(Number.POSITIVE_INFINITY)).toBe(true);
    expect(videoTooLong(Number.NaN)).toBe(true);
  });

  it("reports a whole-second duration that covers every sampled timestamp", () => {
    expect(submittedDurationSec(6)).toBe(6);
    expect(submittedDurationSec(6.5)).toBe(7);
    expect(submittedDurationSec(0.4)).toBe(1);
    expect(submittedDurationSec(3600)).toBe(3600);
    // One frame per whole second, so the sample count is always the duration.
    for (const duration of [0.4, 1, 6, 6.5, 59.99, 600, 3599.2, 3600]) {
      expect(sampleTimes(duration)).toHaveLength(submittedDurationSec(duration));
    }
  });
});

describe("vPDQ keep pipeline", () => {
  it("drops frames below the quality floor and keeps the rest in order", () => {
    // The spec's floor: "frames with PDQ quality below 50 are dropped" — a
    // frame exactly at the floor is kept.
    expect(VPDQ_MIN_FRAME_QUALITY).toBe(50);
    const kept = finalizeFrames([
      frame(H0, 100, 0),
      frame(HF, VPDQ_MIN_FRAME_QUALITY - 1, 1), // below the floor: dropped even though nothing precedes it
      frame(HF, VPDQ_MIN_FRAME_QUALITY, 2),
      frame(H0, 0, 3),
    ]);
    expect(kept.map((f) => f.t)).toEqual([0, 2]);
    expect(kept[0].hash).toBe(H0);
    expect(kept[1].hash).toBe(HF);
  });

  it("drops a frame within the dedup distance of the previous kept frame", () => {
    expect(hammingDistance(H0, H10)).toBe(VPDQ_DEDUP_DISTANCE);
    expect(hammingDistance(H0, H11)).toBe(VPDQ_DEDUP_DISTANCE + 1);
    const kept = finalizeFrames([
      frame(H0, 100, 0),
      frame(H10, 100, 1), // distance 10 from the previous kept: dropped
      frame(H11, 100, 2), // distance 11 from H0 (H10 was dropped): kept
      frame(H10, 100, 3), // distance 1 from the previous kept (H11): dropped
      frame(HF, 100, 4), // distance 245 from H11: kept
    ]);
    expect(kept.map((f) => f.t)).toEqual([0, 2, 4]);
  });

  it("keeps an evenly spaced 1000 when more survive dedup", () => {
    const many: VideoFrameHash[] = [];
    for (let i = 0; i < 1500; i++) {
      // Alternating far-apart hashes survive dedup, so the cap does the work.
      many.push(frame(i % 2 === 0 ? H0 : HF, 100, i));
    }
    const kept = finalizeFrames(many);
    expect(kept).toHaveLength(VPDQ_MAX_FRAMES);
    // First and last are kept; the picks are strictly increasing and even
    // (1500 into 1000: every gap is one or two original seconds).
    expect(kept[0].t).toBe(0);
    expect(kept[kept.length - 1].t).toBe(1499);
    for (let j = 1; j < kept.length; j++) {
      const gap = kept[j].t - kept[j - 1].t;
      expect(gap).toBeGreaterThanOrEqual(1);
      expect(gap).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the first and last frame when just over the cap", () => {
    const many: VideoFrameHash[] = [];
    for (let i = 0; i < 1001; i++) many.push(frame(i % 2 === 0 ? H0 : HF, 100, i));
    const kept = finalizeFrames(many);
    expect(kept).toHaveLength(1000);
    expect(kept[0].t).toBe(0);
    expect(kept[kept.length - 1].t).toBe(1000);
    // Strictly increasing: nothing picked twice (a float stride can collide on
    // the last index; the integer spread cannot).
    for (let j = 1; j < kept.length; j++) expect(kept[j].t).toBeGreaterThan(kept[j - 1].t);
  });

  it("returns nothing when every frame is below the quality floor", () => {
    expect(finalizeFrames([frame(H0, VPDQ_MIN_FRAME_QUALITY - 1, 0), frame(HF, 10, 1)])).toEqual([]);
    expect(finalizeFrames([])).toEqual([]);
  });

  it("bestFrameQuality is the highest frame quality", () => {
    expect(bestFrameQuality([frame(H0, 10, 0), frame(HF, 70, 1), frame(H0, 55, 2)])).toBe(70);
    expect(bestFrameQuality([])).toBe(0);
  });
});

describe("vPDQ wire item (WP17 contract)", () => {
  it("carries only kind, frames, durationSec and clientVersion", () => {
    const item = toVideoHashItem({ frames: [frame(H0, 80, 0), frame(HF, 60, 5)], durationSec: 6 });
    expect(Object.keys(item).sort()).toEqual(["clientVersion", "durationSec", "frames", "kind"]);
    expect(item.kind).toBe("video");
    expect(item.durationSec).toBe(6);
    expect(item.clientVersion).toBe(VPDQ_CLIENT_VERSION);
    expect(VPDQ_CLIENT_VERSION).toMatch(/^vpdq-ts-/);
    for (const frameItem of item.frames) {
      expect(Object.keys(frameItem).sort()).toEqual(["hash", "quality", "t"]);
      expect(PDQ_HASH_PATTERN.test(frameItem.hash)).toBe(true);
    }
  });

  it("never carries media or anything the server's media checks would refuse", () => {
    const json = JSON.stringify(
      toVideoHashItem({ frames: [frame(H0, 80, 0), frame(HF, 60, 5)], durationSec: 6 }),
    );
    expect(json).not.toContain("data:");
    expect(json).not.toContain("base64");
    // The server rejects hashes containing ',', '/' or '+' as media smuggling.
    for (const frameItem of [H0, HF, H10, H11]) {
      expect(frameItem).not.toMatch(/[,/+]/);
    }
  });
});

describe("VpdqError", () => {
  it("carries a fixed error code", () => {
    const error = new VpdqError("video_too_long");
    expect(error.code).toBe("video_too_long");
    expect(error.name).toBe("VpdqError");
    expect(error).toBeInstanceOf(VpdqError);
  });
});
