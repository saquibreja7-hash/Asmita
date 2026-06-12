import { describe, expect, it } from "vitest";
import {
  computePdqHash,
  hammingDistance,
  PDQ_HASH_PATTERN,
  type PdqInput,
} from "@/lib/pdq/pdq";

function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): PdqInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

// Deterministic PRNG so test images are stable across runs.
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function texturedImage(width: number, height: number, seed: number): PdqInput {
  const rand = lcg(seed);
  const noise: number[] = [];
  for (let i = 0; i < width * height; i++) noise.push(rand() * 255);
  return makeImage(width, height, (x, y) => {
    const base = noise[y * width + x];
    const gradient = (x / width) * 128 + (y / height) * 64;
    const value = Math.min(255, Math.round(base * 0.5 + gradient));
    return [value, value, value];
  });
}

describe("computePdqHash", () => {
  it("produces a 64-hex-char hash", () => {
    const { hash } = computePdqHash(texturedImage(256, 256, 1));
    expect(hash).toMatch(PDQ_HASH_PATTERN);
  });

  it("is deterministic for identical input", () => {
    const a = computePdqHash(texturedImage(256, 256, 7));
    const b = computePdqHash(texturedImage(256, 256, 7));
    expect(a.hash).toBe(b.hash);
    expect(a.quality).toBe(b.quality);
  });

  it("scores flat images as low quality and textured images higher", () => {
    const flat = computePdqHash(makeImage(128, 128, () => [120, 120, 120]));
    const textured = computePdqHash(texturedImage(128, 128, 3));
    expect(flat.quality).toBe(0);
    expect(textured.quality).toBeGreaterThan(flat.quality);
  });

  it("is robust to resizing (same image at different resolutions matches)", () => {
    // Resolution-independent textured pattern: rich DCT spectrum, unlike a
    // flat gradient whose near-zero coefficients make any perceptual hash
    // numerically unstable.
    const textured = (w: number, h: number) =>
      makeImage(w, h, (x, y) => {
        const u = x / w;
        const v = y / h;
        const value = Math.round(
          128 +
            55 * Math.sin(8 * Math.PI * u) * Math.cos(6 * Math.PI * v) +
            40 * Math.sin(3 * Math.PI * (u + v)) +
            25 * Math.cos(11 * Math.PI * u * v),
        );
        return [value, value, Math.round(value * 0.8)];
      });
    const large = computePdqHash(textured(512, 384));
    const small = computePdqHash(textured(256, 192));
    expect(hammingDistance(large.hash, small.hash)).toBeLessThanOrEqual(31);
  });

  it("distinguishes unrelated images", () => {
    const a = computePdqHash(texturedImage(256, 256, 11));
    const b = computePdqHash(texturedImage(256, 256, 99));
    expect(hammingDistance(a.hash, b.hash)).toBeGreaterThan(31);
  });

  it("rejects malformed input", () => {
    expect(() =>
      computePdqHash({ data: new Uint8ClampedArray(10), width: 100, height: 100 }),
    ).toThrow("pdq_invalid_input");
  });
});

describe("hammingDistance", () => {
  it("is zero for identical hashes", () => {
    const hash = "ab".repeat(32);
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it("counts differing bits", () => {
    const zero = "00".repeat(32);
    const allOnes = "ff".repeat(32);
    expect(hammingDistance(zero, allOnes)).toBe(256);
  });

  it("rejects non-hash input", () => {
    expect(() => hammingDistance("xyz", "00".repeat(32))).toThrow("pdq_invalid_hash");
  });
});
