import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { canvasAlphaRoundTrip, prepareForPdq, DEFAULT_LIMIT_INPUT_PIXELS } from "../src/prepare";

const solid = (w: number, h: number, ch: 3 | 4, rgba: number[]) =>
  sharp({ create: { width: w, height: h, channels: ch, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: (rgba[3] ?? 255) / 255 } } });

describe("prepareForPdq", () => {
  it("returns RGBA with the right dimensions and length", async () => {
    const buf = await solid(40, 30, 3, [10, 20, 30]).png().toBuffer();
    const r = await prepareForPdq(buf);
    expect([r.width, r.height]).toEqual([40, 30]);
    expect(r.data.length).toBe(40 * 30 * 4);
    expect(Array.from(r.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it("applies EXIF orientation", async () => {
    // 40x30 landscape tagged orientation 6 (rotate 90 CW) -> 30x40 portrait
    const buf = await solid(40, 30, 3, [200, 50, 50]).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await prepareForPdq(buf);
    expect([r.width, r.height]).toEqual([30, 40]);
  });

  it("zeroes fully transparent pixels and leaves opaque ones", async () => {
    const buf = await solid(8, 8, 4, [200, 100, 50, 0]).png().toBuffer();
    const r = await prepareForPdq(buf);
    expect(Array.from(r.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    const opaque = await prepareForPdq(await solid(8, 8, 4, [200, 100, 50, 255]).png().toBuffer());
    expect(Array.from(opaque.data.slice(0, 4))).toEqual([200, 100, 50, 255]);
  });

  it("CMYK without a profile returns opaque RGBA via the naive path", async () => {
    const buf = await solid(16, 16, 3, [255, 0, 0]).toColourspace("cmyk").jpeg().toBuffer();
    const r = await prepareForPdq(buf);
    expect(r.data.length).toBe(16 * 16 * 4);
    for (let i = 3; i < r.data.length; i += 4) expect(r.data[i]).toBe(255);
    expect(r.data[0]).toBeGreaterThan(200); // red stays red
    expect(r.data[1]).toBeLessThan(60);
  });

  it("rejects inputs above the pixel limit with a clear error", async () => {
    expect(DEFAULT_LIMIT_INPUT_PIXELS).toBe(25_000_000);
    const big = await solid(6000, 5000, 3, [1, 2, 3]).png({ compressionLevel: 9 }).toBuffer(); // 30 MP
    await expect(prepareForPdq(big)).rejects.toThrow(/pixel limit/i);
    // an explicit higher limit would accept it, proving the default is what rejected it
    await expect(prepareForPdq(big, { limitInputPixels: 40_000_000 })).resolves.toBeDefined();
  }, 60_000);
});

describe("canvasAlphaRoundTrip", () => {
  it("zeroes transparent, keeps opaque, re-quantises semi-transparent", () => {
    const px = new Uint8ClampedArray([9, 9, 9, 0, 1, 2, 3, 255, 100, 150, 200, 128]);
    canvasAlphaRoundTrip(px);
    expect(Array.from(px.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(px.slice(4, 8))).toEqual([1, 2, 3, 255]);
    const a = 128;
    expect(px[8]).toBe(Math.round((Math.round((100 * a) / 255) * 255) / a));
    expect(px[11]).toBe(128);
  });
});

describe("single source of truth", () => {
  it("the harness measures the crawler's own module, not a copy", async () => {
    const harness = await import("../src/prepare");
    const crawler = await import("../../../crawler/src/prepare.ts");
    expect(harness.prepareForPdq).toBe(crawler.prepareForPdq);
    expect(harness.canvasAlphaRoundTrip).toBe(crawler.canvasAlphaRoundTrip);
    expect(harness.FAIL_ON).toBe(crawler.FAIL_ON);
    expect(harness.FAIL_ON).toBe("none");
  });
});
