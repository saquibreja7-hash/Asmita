/**
 * Image bytes -> PDQ fingerprint, in memory only.
 *
 * Order matters: the magic-byte allowlist runs before sharp sees a single
 * byte, because this libvips build also has SVG, PDF, TIFF, HEIF and other
 * loaders that sniff input on their own. sharp's own format detection must
 * then agree with ours. Nothing here writes to disk: no toFile(), no temp
 * files, the decoded pixels and the input Buffer go out of scope on return.
 */
import sharp, { type Metadata } from "sharp";
import { CrawlError } from "../errors.ts";
import { computePdqHash } from "../pdq.ts";
import { DEFAULT_LIMIT_INPUT_PIXELS, prepareForPdq } from "../prepare.ts";

/** Same tolerance as the prepareForPdq recipe: a cut-short copy still hashes. */
const FAIL_ON = "none" as const;

// libvips keeps an operation cache in memory; we never re-use results.
sharp.cache(false);

export type ImageFormat = "jpeg" | "png" | "gif" | "webp" | "avif";

/** Identify an allowed raster format from its leading bytes, or null. */
export function sniffImage(buf: Buffer): ImageFormat | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  const ascii6 = buf.toString("latin1", 0, 6);
  if (ascii6 === "GIF87a" || ascii6 === "GIF89a") return "gif";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

/** sharp's metadata().format names for each sniffed format. */
const SHARP_FORMAT: Record<ImageFormat, readonly string[]> = {
  jpeg: ["jpeg"],
  png: ["png"],
  gif: ["gif"],
  webp: ["webp"],
  avif: ["heif", "avif"],
};

export type HashOptions = {
  minSide: number;
  limitInputPixels?: number;
};

export type HashResult = { hash: string; quality: number; width: number; height: number; format: ImageFormat };

export async function hashImage(bytes: Buffer, opts: HashOptions): Promise<HashResult> {
  const format = sniffImage(bytes);
  if (!format) throw new CrawlError("image_sniff_failed");
  const limitInputPixels = opts.limitInputPixels ?? DEFAULT_LIMIT_INPUT_PIXELS;

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { failOn: FAIL_ON, limitInputPixels, animated: false }).metadata();
  } catch (err) {
    // sharp checks the header against limitInputPixels before decoding.
    if (isPixelLimit(err)) throw new CrawlError("image_too_many_pixels");
    throw new CrawlError("image_decode_failed");
  }
  if (!meta.format || !SHARP_FORMAT[format].includes(meta.format)) throw new CrawlError("image_format");
  // An "ftypavif" brand must really be AV1; HEIC (HEVC) is not on the allowlist.
  if (format === "avif" && meta.compression !== "av1") throw new CrawlError("image_format");
  const w = meta.autoOrient?.width ?? meta.width;
  const h = meta.autoOrient?.height ?? meta.height;
  if (!w || !h) throw new CrawlError("image_decode_failed");
  // Check the pixel count from the header ourselves too, so the error code is
  // exact even if a sharp version words its limit error differently.
  if (w * h > limitInputPixels) throw new CrawlError("image_too_many_pixels");
  if (w < opts.minSide || h < opts.minSide) throw new CrawlError("image_too_small");

  let input;
  try {
    input = await prepareForPdq(bytes, { limitInputPixels });
  } catch (err) {
    if (isPixelLimit(err)) throw new CrawlError("image_too_many_pixels");
    if (isTruncated(err)) throw new CrawlError("image_truncated");
    throw new CrawlError("image_decode_failed");
  }
  const { hash, quality } = computePdqHash(input);
  return { hash, quality, width: input.width, height: input.height, format };
}

function isPixelLimit(err: unknown): boolean {
  return err instanceof Error && /pixel limit/i.test(err.message);
}

/** libjpeg "premature end", libspng read errors, libwebp/libheif truncation. */
function isTruncated(err: unknown): boolean {
  return err instanceof Error && /premature end|truncat|read error|unexpected end|not enough data/i.test(err.message);
}
