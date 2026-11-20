import { describe, expect, it } from "vitest";
import { hashWithPipeline, hammingDistance, PDQ_MATCH_THRESHOLD } from "../src/measure.ts";
import { PDQ_HASH_PATTERN } from "../../../asmita/src/lib/pdq/pdq.ts";
import { encode, photo, noise, fromRaw } from "../src/images.ts";
import { jpegQuality } from "../src/alter.ts";

/**
 * End-to-end sanity through the PRODUCTION pipeline (crawler's prepare.ts +
 * our pdq.ts, imported): a mild recompression of the same pixels must land
 * well inside the match threshold, and unrelated images must sit far outside
 * it. This pins the harness plumbing (decode -> prepare -> hash -> distance),
 * not PDQ itself.
 */
describe("the production pipeline through this harness", () => {
  it("hashes with the 64-hex PDQ format and a 0..100 quality", async () => {
    const img = await encode(fromRaw(photo(400, 300, 42)), "jpeg");
    const h = await hashWithPipeline(img);
    expect(h.hash).toMatch(PDQ_HASH_PATTERN);
    expect(Number.isInteger(h.quality)).toBe(true);
    expect(h.quality).toBeGreaterThanOrEqual(0);
    expect(h.quality).toBeLessThanOrEqual(100);
    expect(`${h.width}x${h.height}`).toBe("400x300");
  });

  it("catches a jpeg-quality-90 copy of the same image well inside the threshold", async () => {
    const original = await encode(fromRaw(photo(400, 300, 42)), "jpeg");
    const copy = await jpegQuality(original, 90);
    const a = await hashWithPipeline(original);
    const b = await hashWithPipeline(copy);
    const d = hammingDistance(a.hash, b.hash);
    expect(d).toBeLessThanOrEqual(20);
    expect(d).toBeLessThanOrEqual(PDQ_MATCH_THRESHOLD);
  });

  it("keeps unrelated images far outside the threshold", async () => {
    const a = await hashWithPipeline(await encode(fromRaw(photo(400, 300, 42)), "jpeg"));
    const b = await hashWithPipeline(await encode(fromRaw(noise(400, 300, 777)), "jpeg"));
    const c = await hashWithPipeline(await encode(fromRaw(noise(400, 300, 12345)), "jpeg"));
    expect(hammingDistance(a.hash, b.hash)).toBeGreaterThan(40);
    expect(hammingDistance(b.hash, c.hash)).toBeGreaterThan(40);
  });
});
