/**
 * SWAPPABLE MODULE: image bytes -> PdqInput.
 *
 * A faithful copy of crawler/src/prepare.ts (itself copied from
 * tools/pdq-agreement/src/prepare.ts, commit 876ad33, and re-measured there:
 * 74 synthetic images, max distance 14, p95 2, 70 exact matches against
 * browser-computed hashes). Keep this file a faithful copy of the crawler's
 * recipe so hashes produced here are the hashes the crawler and the survivor's
 * browser would produce; only the import path of the PdqInput type differs.
 *
 *   sharp(failOn: "none", limitInputPixels 25 MP, animated: false)
 *     -> .rotate()                    (EXIF orientation)
 *     -> .toColourspace("srgb")      (CMYK / greyscale / ICC -> 3-channel sRGB)
 *     -> .ensureAlpha()              (RGBA, 4 bytes per pixel like ImageData)
 *     -> .raw()                      (no resize; pdq.ts downsamples itself)
 *     -> canvas alpha round trip     (premultiply + unpremultiply, as canvas)
 *
 * CMYK JPEGs without an ICC profile are converted with the naive formula
 * (R = (1-C)(1-K)), matching Chromium, because sharp's default lcms profile
 * disagrees with it (44-bit PDQ difference measured in the crawler harness).
 */
import sharp, { type SharpOptions } from "sharp";
import type { PdqInput } from "./pdq.ts";

export const DEFAULT_LIMIT_INPUT_PIXELS = 25_000_000;

/** sharp failOn level of the recipe; tolerant like the crawler's. */
export const FAIL_ON = "none" as const;

export type PrepareOptions = {
  /** Reject absurdly large inputs (decompression-bomb guard). Default 25 MP. */
  limitInputPixels?: number;
  /** Emulate the canvas premultiply/unpremultiply round trip. Default true. */
  emulateCanvasAlpha?: boolean;
};

export async function prepareForPdq(buffer: Buffer, opts: PrepareOptions = {}): Promise<PdqInput> {
  const sharpOpts = {
    failOn: FAIL_ON,
    limitInputPixels: opts.limitInputPixels ?? DEFAULT_LIMIT_INPUT_PIXELS,
    animated: false, // first frame only, like createImageBitmap
  };
  const meta = await sharp(buffer, sharpOpts).metadata();

  if (meta.space === "cmyk" && !meta.hasProfile) return prepareCmyk(buffer, sharpOpts);

  const { data, info } = await sharp(buffer, sharpOpts)
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) throw new Error(`expected RGBA, got ${info.channels} channels`);
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  if (opts.emulateCanvasAlpha ?? true) canvasAlphaRoundTrip(px);
  return { data: px, width: info.width, height: info.height };
}

/**
 * CMYK JPEGs WITHOUT an embedded ICC profile: Chromium converts with the naive
 * formula R = (1-C)(1-K), whereas sharp's toColourspace("srgb") applies a
 * default lcms CMYK profile. Read the raw 4-channel data and convert naively.
 */
async function prepareCmyk(buffer: Buffer, sharpOpts: SharpOptions): Promise<PdqInput> {
  const { data, info } = await sharp(buffer, sharpOpts)
    .rotate()
    .toColourspace("cmyk")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`expected CMYK, got ${info.channels} channels`);
  const n = info.width * info.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const notK = 255 - data[i * 4 + 3];
    out[i * 4] = Math.round(((255 - data[i * 4]) * notK) / 255);
    out[i * 4 + 1] = Math.round(((255 - data[i * 4 + 1]) * notK) / 255);
    out[i * 4 + 2] = Math.round(((255 - data[i * 4 + 2]) * notK) / 255);
    out[i * 4 + 3] = 255;
  }
  return { data: out, width: info.width, height: info.height };
}

/** In-place emulation of canvas premultiplied storage followed by getImageData. */
export function canvasAlphaRoundTrip(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 255) continue;
    if (a === 0) { px[i] = px[i + 1] = px[i + 2] = 0; continue; }
    for (let k = 0; k < 3; k++) {
      const pre = Math.round((px[i + k] * a) / 255);
      px[i + k] = Math.min(255, Math.round((pre * 255) / a));
    }
  }
}
