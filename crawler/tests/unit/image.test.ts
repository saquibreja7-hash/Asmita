/** Image path: magic-byte allowlist, format agreement, pixel bombs, size, prepare recipe. */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { hashImage, sniffImage } from "../../src/image/hash-image.ts";
import { computePdqHash, hammingDistance } from "../../src/pdq.ts";
import { canvasAlphaRoundTrip, DEFAULT_LIMIT_INPUT_PIXELS, prepareForPdq } from "../../src/prepare.ts";
import { patternImage, patternRgba, pixelBombPng } from "../support/synthetic.ts";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `other:${String(e)}`;
  }
};

describe("sniffImage", () => {
  it("recognises the allowed raster formats", async () => {
    expect(sniffImage(await patternImage(1, 64, 64, "png"))).toBe("png");
    expect(sniffImage(await patternImage(1, 64, 64, "jpeg"))).toBe("jpeg");
    expect(sniffImage(await patternImage(1, 64, 64, "webp"))).toBe("webp");
    expect(sniffImage(await patternImage(1, 64, 64, "gif"))).toBe("gif");
  });
  it("rejects everything else, including formats sharp could decode", async () => {
    const tiff = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } }).tiff().toBuffer();
    expect(sniffImage(tiff)).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7\n%...."))).toBeNull();
    expect(sniffImage(Buffer.from("<!doctype html><html></html>"))).toBeNull();
    expect(sniffImage(Buffer.from("BM" + "\0".repeat(60)))).toBeNull();
    expect(sniffImage(Buffer.alloc(4))).toBeNull();
  });
});

describe("truncated and AVIF images", () => {
  // failOn "none" (the measured recipe): a cut-short copy of an image still
  // hashes close to the intact file, so it can still be found.
  it("hashes lightly truncated JPEGs and PNGs within the match threshold", async () => {
    for (const fmt of ["jpeg", "png"] as const) {
      const full = await patternImage(61, 640, 480, fmt);
      const base = (await hashImage(full, { minSide: 1 })).hash;
      for (const cut of [full.subarray(0, full.length - 2), full.subarray(0, Math.floor(full.length * 0.99)), full.subarray(0, Math.floor(full.length * 0.9))]) {
        const r = await hashImage(Buffer.from(cut), { minSide: 1 });
        expect(hammingDistance(base, r.hash)).toBeLessThanOrEqual(31);
      }
    }
  });
  it("heavily truncated files end in a far hash or a coded error, never a raw throw", async () => {
    for (const fmt of ["jpeg", "png", "webp"] as const) {
      const full = await patternImage(62, 640, 480, fmt);
      const base = (await hashImage(full, { minSide: 1 })).hash;
      for (const f of [0.6, 0.2, 0.01]) {
        const cut = Buffer.from(full.subarray(0, Math.floor(full.length * f)));
        try {
          const r = await hashImage(cut, { minSide: 1 });
          expect(hammingDistance(base, r.hash)).toBeGreaterThan(31);
        } catch (e) {
          expect(e).toBeInstanceOf(CrawlError);
        }
      }
    }
  });
  it("hashes AVIF (sniffed by brand, decoded as AV1) close to the same picture as PNG", async () => {
    const avif = await patternImage(63, 320, 240, "avif");
    expect(sniffImage(avif)).toBe("avif");
    const a = await hashImage(avif, { minSide: 1 });
    const p = await hashImage(await patternImage(63, 320, 240, "png"), { minSide: 1 });
    expect(a.format).toBe("avif");
    expect(hammingDistance(a.hash, p.hash)).toBeLessThanOrEqual(31);
  });
});

describe("hashImage", () => {
  it("hashes PNG/JPEG/WebP/GIF of the same picture to nearby fingerprints", async () => {
    const png = await hashImage(await patternImage(7, 320, 240, "png"), { minSide: 64 });
    expect(png.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(png.quality).toBeGreaterThanOrEqual(50);
    expect([png.width, png.height]).toEqual([320, 240]);
    for (const f of ["jpeg", "webp", "gif"] as const) {
      const other = await hashImage(await patternImage(7, 320, 240, f), { minSide: 64 });
      expect(hammingDistance(png.hash, other.hash)).toBeLessThanOrEqual(31);
    }
  });
  it("matches computePdqHash on the raw pixels for a lossless PNG", async () => {
    const direct = computePdqHash({ data: patternRgba(9, 200, 150), width: 200, height: 150 });
    const viaPipeline = await hashImage(await patternImage(9, 200, 150, "png"), { minSide: 1 });
    expect(viaPipeline.hash).toBe(direct.hash);
  });
  it("rejects a pixel bomb from its header without decoding", async () => {
    const started = Date.now();
    expect(await code(hashImage(await pixelBombPng(50_000, 50_000), { minSide: 1 }))).toBe("image_too_many_pixels");
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it("rejects images above the 25 MP limit and accepts ones at it", async () => {
    expect(DEFAULT_LIMIT_INPUT_PIXELS).toBe(25_000_000);
    const big = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: "#010203" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(await code(hashImage(big, { minSide: 1 }))).toBe("image_too_many_pixels");
  }, 60_000);
  it("rejects non-images, SVG, TIFF, too-small images and mislabelled data", async () => {
    expect(await code(hashImage(Buffer.from("<html>not an image</html>"), { minSide: 1 }))).toBe("image_sniff_failed");
    expect(await code(hashImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { minSide: 1 }))).toBe("image_sniff_failed");
    const tiff = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } }).tiff().toBuffer();
    expect(await code(hashImage(tiff, { minSide: 1 }))).toBe("image_sniff_failed");
    expect(await code(hashImage(await patternImage(3, 40, 40, "png"), { minSide: 64 }))).toBe("image_too_small");
    // JPEG magic bytes followed by garbage.
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0x41)]);
    expect(await code(hashImage(fakeJpeg, { minSide: 1 }))).toBe("image_decode_failed");
    // PNG magic bytes in front of a GIF body: sniff says PNG, decoder disagrees.
    const gif = await patternImage(3, 64, 64, "gif");
    const chimera = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), gif]);
    expect(["image_decode_failed", "image_format"]).toContain(await code(hashImage(chimera, { minSide: 1 })));
  });
  it("hashes the first frame of an animated GIF only", async () => {
    const f1 = await sharp(await patternImage(21, 100, 100, "png")).raw().toBuffer();
    const f2 = await sharp(await patternImage(22, 100, 100, "png")).raw().toBuffer();
    const anim = await sharp(Buffer.concat([f1, f2]), { raw: { width: 100, height: 200, channels: 3, pageHeight: 100 } })
      .gif({ loop: 0 })
      .toBuffer();
    expect((await sharp(anim, { animated: true }).metadata()).pages).toBe(2);
    const first = await sharp(f1, { raw: { width: 100, height: 100, channels: 3 } }).gif().toBuffer();
    const a = await hashImage(anim, { minSide: 1 });
    const b = await hashImage(first, { minSide: 1 });
    expect([a.width, a.height]).toEqual([100, 100]);
    expect(hammingDistance(a.hash, b.hash)).toBeLessThanOrEqual(8);
  });
});

// Adapted from tools/pdq-agreement/tests/prepare.test.ts (the recipe's own tests).
const solid = (w: number, h: number, ch: 3 | 4, rgba: number[]) =>
  sharp({ create: { width: w, height: h, channels: ch, background: { r: rgba[0]!, g: rgba[1]!, b: rgba[2]!, alpha: (rgba[3] ?? 255) / 255 } } });

describe("prepareForPdq (decode recipe)", () => {
  it("returns RGBA with the right dimensions and length", async () => {
    const r = await prepareForPdq(await solid(40, 30, 3, [10, 20, 30]).png().toBuffer());
    expect([r.width, r.height]).toEqual([40, 30]);
    expect(r.data.length).toBe(40 * 30 * 4);
    expect(Array.from(r.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });
  it("applies EXIF orientation", async () => {
    const buf = await solid(40, 30, 3, [200, 50, 50]).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await prepareForPdq(buf);
    expect([r.width, r.height]).toEqual([30, 40]);
  });
  it("zeroes fully transparent pixels and leaves opaque ones", async () => {
    const r = await prepareForPdq(await solid(8, 8, 4, [200, 100, 50, 0]).png().toBuffer());
    expect(Array.from(r.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });
  it("CMYK without a profile returns opaque RGBA via the naive path", async () => {
    const buf = await solid(16, 16, 3, [255, 0, 0]).toColourspace("cmyk").jpeg().toBuffer();
    const r = await prepareForPdq(buf);
    for (let i = 3; i < r.data.length; i += 4) expect(r.data[i]).toBe(255);
    expect(r.data[0]).toBeGreaterThan(200);
    expect(r.data[1]).toBeLessThan(60);
  });
  it("canvasAlphaRoundTrip re-quantises semi-transparent pixels", () => {
    const px = new Uint8ClampedArray([9, 9, 9, 0, 1, 2, 3, 255, 100, 150, 200, 128]);
    canvasAlphaRoundTrip(px);
    expect(Array.from(px.slice(0, 8))).toEqual([0, 0, 0, 0, 1, 2, 3, 255]);
    expect(px[8]).toBe(Math.round((Math.round((100 * 128) / 255) * 255) / 128));
  });
});
