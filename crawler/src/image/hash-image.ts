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
import type { PdqInput } from "../pdq.ts";
import { DEFAULT_LIMIT_INPUT_PIXELS, prepareForPdq } from "../prepare.ts";
import { spriteGrid } from "./sprite.ts";

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

/** One tile of a preview sprite sheet (video-fingerprints spec WP21). */
export type SpriteTile = { hash: string; quality: number };

export type SpriteResult = { tiles: SpriteTile[]; width: number; height: number; format: ImageFormat };

/**
 * The shared decode path of hashImage and hashSpriteImage: sniff, cap and
 * prepare the pixels once. Every format, pixel and size rule of a whole
 * image applies before any tile is cut.
 */
async function prepareImage(bytes: Buffer, opts: HashOptions): Promise<{ input: PdqInput; format: ImageFormat }> {
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
  return { input, format };
}

export async function hashImage(bytes: Buffer, opts: HashOptions): Promise<HashResult> {
  const { input, format } = await prepareImage(bytes, opts);
  const { hash, quality } = computePdqHash(input);
  return { hash, quality, width: input.width, height: input.height, format };
}

/**
 * A preview sprite sheet (video-fingerprints spec WP21): decode once under
 * every whole-image rule, cut the grid spriteGrid picks, and hash each
 * tile like the standalone thumbnail it is — so any tile that is a
 * survivor video's frame matches it. One image, at most MAX_SPRITE_TILES
 * hashes, no bytes beyond this buffer; runs in the decoder child like
 * every decode. A grid of 1x1 (a misnamed single image) answers with the
 * whole image's one hash, exactly hashImage's result.
 */
export async function hashSpriteImage(bytes: Buffer, opts: HashOptions): Promise<SpriteResult> {
  const { input, format } = await prepareImage(bytes, opts);
  const { cols, rows } = spriteGrid(input.width, input.height, opts.minSide);
  const tw = Math.floor(input.width / cols);
  const th = Math.floor(input.height / rows);
  const tiles: SpriteTile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Copy the tile out of the decoded pixels (the row stride is the
      // whole image's); the copy is the tile's only footprint in memory.
      const tile = new Uint8ClampedArray(tw * th * 4);
      for (let y = 0; y < th; y++) {
        const src = ((r * th + y) * input.width + c * tw) * 4;
        tile.set(input.data.subarray(src, src + tw * 4), y * tw * 4);
      }
      try {
        const { hash, quality } = computePdqHash({ data: tile, width: tw, height: th });
        tiles.push({ hash, quality });
      } catch {
        // A tile below PDQ's own minimum dimension (only possible with a
        // configured MIN_IMAGE_SIDE below it): drop the tile, keep the rest.
      }
    }
  }
  return { tiles, width: input.width, height: input.height, format };
}

function isPixelLimit(err: unknown): boolean {
  return err instanceof Error && /pixel limit/i.test(err.message);
}

/** libjpeg "premature end", libspng read errors, libwebp/libheif truncation. */
function isTruncated(err: unknown): boolean {
  return err instanceof Error && /premature end|truncat|read error|unexpected end|not enough data/i.test(err.message);
}
