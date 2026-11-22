import { describe, expect, it } from "vitest";
import {
  makeProtectSeed,
  PROTECT_EPSILON,
  PROTECT_MAX_DELTA,
  protectPixels,
} from "@/lib/lab/protect/perturbation";

// The photo-protection layer (docs/lab/beta-spec.md WP91). The WP's one
// required unit test is the bound: after protection, no pixel channel may
// have moved by more than epsilon (8/255, i.e. 8 in 8-bit units). The
// cases below pin the bound, the alpha rule, clamping, determinism and the
// validation — all against the exact module the page runs, in memory, with
// invented pixel data only.

/** RGBA data for `pixels` pixels, channels cycling through edge and mid values. */
function rgba(pixels: number): Uint8ClampedArray {
  const levels = [0, 1, 63, 127, 128, 190, 254, 255];
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      data[i + c] = levels[(i + c) % levels.length]!;
    }
  }
  return data;
}

describe("photo protection: the perturbation bound", () => {
  it("moves no colour channel by more than epsilon (8/255 = 8 in 8-bit units)", () => {
    const original = rgba(5000);
    const source = new Uint8ClampedArray(original);
    protectPixels(original, 123456);
    let maxChange = 0;
    for (let i = 0; i < original.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const change = Math.abs(original[i + c]! - source[i + c]!);
        maxChange = Math.max(maxChange, change);
        expect(change).toBeLessThanOrEqual(PROTECT_MAX_DELTA);
        expect(change).toBeLessThanOrEqual(PROTECT_EPSILON * 255);
      }
    }
    // The layer is real noise, not a no-op: on mid-valued pixels the full
    // ±8 span is used somewhere in a large image.
    expect(maxChange).toBe(PROTECT_MAX_DELTA);
  });

  it("keeps every channel inside [0, 255] and leaves alpha untouched", () => {
    const original = rgba(2000);
    const alpha = new Uint8ClampedArray(original.filter((_, i) => i % 4 === 3));
    protectPixels(original, 99);
    for (let i = 0; i < original.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        expect(original[i + c]!).toBeGreaterThanOrEqual(0);
        expect(original[i + c]!).toBeLessThanOrEqual(255);
      }
      expect(original[i + 3]!).toBe(alpha[i / 4]!);
    }
  });

  it("changes almost every pixel: the noise is spread, not concentrated", () => {
    const data = new Uint8ClampedArray(4000 * 4).fill(128, 0, 4000 * 4);
    const source = new Uint8ClampedArray(data);
    protectPixels(data, 424242);
    let untouched = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === source[i] && data[i + 1] === source[i + 1] && data[i + 2] === source[i + 2]) untouched++;
    }
    // One pixel in 17^3 escapes by chance on flat data; 4000 pixels leave
    // that far below 2%.
    expect(untouched).toBeLessThan(80);
  });

  it("is deterministic per seed and different across seeds", () => {
    const a1 = rgba(500);
    const a2 = new Uint8ClampedArray(a1);
    const b = rgba(500);
    protectPixels(a1, 7);
    protectPixels(a2, 7);
    protectPixels(b, 8);
    expect(Array.from(a1)).toEqual(Array.from(a2));
    expect(Array.from(a1)).not.toEqual(Array.from(b));
  });

  it("clamps at the edges without ever jumping more than epsilon", () => {
    // Every channel pinned at an edge value: 0 can only go up, 255 only
    // down, and by at most 8 either way.
    const zeros = new Uint8ClampedArray(64 * 4); // all zero
    const maxes = new Uint8ClampedArray(64 * 4).fill(255);
    protectPixels(zeros, 1);
    protectPixels(maxes, 1);
    for (let i = 0; i < 64 * 4; i += 4) {
      expect(zeros[i]!).toBeLessThanOrEqual(PROTECT_MAX_DELTA);
      expect(maxes[i]!).toBeGreaterThanOrEqual(255 - PROTECT_MAX_DELTA);
    }
  });

  it("exports the spec's epsilon as 8/255 and its 8-bit form as 8", () => {
    expect(PROTECT_EPSILON).toBe(8 / 255);
    expect(PROTECT_MAX_DELTA).toBe(8);
    expect(PROTECT_MAX_DELTA).toBe(Math.floor(PROTECT_EPSILON * 255));
  });

  it("draws per-run seeds in the uint32 range", () => {
    for (let i = 0; i < 50; i++) {
      const seed = makeProtectSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("refuses data that is not non-empty RGBA and seeds that are not uint32", () => {
    expect(() => protectPixels(new Uint8ClampedArray(0), 1)).toThrow(TypeError);
    expect(() => protectPixels(new Uint8ClampedArray(6), 1)).toThrow(TypeError); // not RGBA
    expect(() => protectPixels(rgba(4), Number.NaN)).toThrow(TypeError);
    expect(() => protectPixels(rgba(4), 1.5)).toThrow(TypeError);
    expect(() => protectPixels(rgba(4), -1)).toThrow(TypeError);
    expect(() => protectPixels(rgba(4), 0x1_0000_0000)).toThrow(TypeError);
  });
});
