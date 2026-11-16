/**
 * SWAPPABLE MODULE: image bytes -> PdqInput.
 *
 * Originally copied from tools/pdq-agreement/src/prepare.ts (commit 876ad33,
 * measured with sharp 0.34.5: 74 synthetic images, max distance 10, p95 0,
 * 71 exact). The harness now imports THIS module instead of a copy; re-run on
 * 2026-11-16 with this package's sharp 0.35.5 / libvips 8.18.7 it measured
 * max 14 (CMYK JPEG without a profile), p95 2, 70 exact
 * (tools/pdq-agreement/REPORT.md). Only the imports changed (PdqInput path; SharpOptions as a named type import
 * because this TypeScript/sharp pair does not expose the sharp namespace).
 * Keep this file a faithful copy so it can be replaced wholesale when the
 * recipe is re-measured; crawler-specific policy (format allowlist, size
 * checks, error mapping) lives in src/image/hash-image.ts, not here.
 *
 * failOn is "none", exactly as in the harness, so truncated files still hash.
 * Measured 2026-11-16 on synthetic 640x480 images: a JPEG or PNG cut to 99%
 * of its bytes stays within distance 10 of the intact file, one cut to 90%
 * within 28, so a cut-short copy of a survivor's image on a site can still
 * match. Heavier truncation drifts to 60+ (no match); truncated WebP and a
 * JPEG with almost no data fail to decode. Chromium's createImageBitmap (the
 * survivor path) rejects truncated files outright; that matters for same-file
 * agreement, not for finding copies. If stricter behaviour is ever wanted, add
 * a policy check in src/image/hash-image.ts rather than editing this recipe.
 * The decoder is still bounded by limitInputPixels (pixel bombs) and by the
 * byte cap applied before this module ever sees the buffer.
 */
/**
 * Server-side pixel preparation for PDQ, mirroring the browser path in
 * asmita/src/app/(auth)/submit/SubmitForm.tsx (hashImageFile):
 *
 *   createImageBitmap(file)            -> decode, EXIF orientation applied
 *                                         (imageOrientation default "from-image"),
 *                                         colour-managed to sRGB
 *   canvas at full bitmap size, imageSmoothingEnabled=false, drawImage(0,0)
 *                                      -> NO resize (1:1), premultiplied RGBA backing store
 *   getImageData                       -> un-premultiplied 8-bit RGBA
 *   computePdqHash(imageData)          -> pdq.ts does its own 512x512 nearest downsample
 *
 * Mirrored here with sharp:
 *   - .rotate()                : apply EXIF orientation (and strip the tag)
 *   - .toColourspace("srgb")   : CMYK / greyscale / ICC -> 3-channel sRGB
 *   - .ensureAlpha()           : RGBA, 4 bytes per pixel like ImageData
 *   - NO .resize()             : full resolution, pdq.ts downsamples itself
 *   - canvas alpha round trip  : canvas stores premultiplied pixels, so a
 *                                semi-transparent pixel comes back as
 *                                round(round(c*a/255)*255/a); fully
 *                                transparent pixels come back as 0,0,0,0.
 *
 * Known remaining differences (cannot be removed from Node): Chromium's JPEG
 * and WebP decoders use their own IDCT / chroma upsampling variants, and
 * Chromium applies ICC colour management with Skia rather than lcms.
 */
import sharp, { type SharpOptions } from "sharp";
import type { PdqInput } from "./pdq.ts";

export const DEFAULT_LIMIT_INPUT_PIXELS = 25_000_000;

/** sharp failOn level of the recipe; the agreement harness reports and pins it. */
export const FAIL_ON = "none" as const;

export type PrepareOptions = {
  /** Reject absurdly large inputs (decompression-bomb guard). Default 25 MP (the crawler's cap). */
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
 * default lcms CMYK profile (44-bit PDQ disagreement measured). So read the
 * raw 4-channel data and convert naively. CMYK WITH an embedded profile goes
 * through the normal sRGB path (Chromium colour-manages those; measured 10).
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
