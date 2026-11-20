/**
 * Message protocol between the fingerprinting UI and the hashing Web Worker
 * (web audit WP42): image and video PDQ hashing runs off the page's main
 * thread, so a 12-megapixel photo no longer freezes the page on a cheap
 * phone.
 *
 * The media rule is unchanged: nothing leaves her device. The main thread
 * hands the worker a File (her chosen image, decoded inside the worker,
 * WP42 P1) or an ImageBitmap (one video frame, transferred, WP42 P2); the
 * worker answers with the 64-hex PDQ hash and its quality - never pixels,
 * media bytes, a data: URL or raw error text.
 *
 * This module is the worker's message handler and is deliberately free of
 * DOM calls, so the unit tests can drive it with raw pixels (the Meta
 * reference vectors) in Node and pin that it returns bit-identical hashes to
 * the direct function (tests/unit/hash-worker.test.ts). The `pixels` request
 * kind is that testable core: it is the inner step both other kinds reduce
 * to once the bitmap is on the worker's canvas.
 */

import { computePdqHash, type PdqInput, type PdqResult } from "./pdq";

/** Fixed reply codes; never an Error message or stack (they can carry data). */
export type HashWorkerErrorCode =
  | "decode_failed" // the file could not be decoded into pixels
  | "hash_failed" // the pixels were read but PDQ refused them
  | "bad_request"; // a message this handler must refuse to act on

export type HashRequest =
  | { id: number; kind: "file"; file: File }
  | { id: number; kind: "bitmap"; bitmap: ImageBitmap }
  | { id: number; kind: "pixels"; input: PdqInput };

export type HashResponse =
  | { id: number; ok: true; hash: string; quality: number }
  | { id: number; ok: false; code: HashWorkerErrorCode };

/**
 * The DOM-capable steps the worker entry supplies (and the unit tests stub):
 * decoding her chosen file, and reading a bitmap's pixels.
 */
export type HashWorkerContext = {
  /** Decode her chosen file into a bitmap (createImageBitmap). */
  decodeFile(file: File): Promise<ImageBitmap>;
  /** Read a bitmap's pixels into an RGBA buffer (OffscreenCanvas). */
  bitmapToPixels(bitmap: ImageBitmap): PdqInput;
};

/** The pure step every request kind ends in: PDQ over raw pixels. */
export function hashPixels(id: number, input: PdqInput): HashResponse {
  try {
    const { hash, quality }: PdqResult = computePdqHash(input);
    return { id, ok: true, hash, quality };
  } catch {
    return { id, ok: false, code: "hash_failed" };
  }
}

/**
 * Handles one message. Returns the reply to post back, or null when the
 * message is unanswerable (no usable id to key a reply to). Every
 * ImageBitmap it touched is closed before returning: a transferred bitmap is
 * the worker's to free, and one decoded here must not outlive the request.
 */
export async function handleHashRequest(
  request: unknown,
  ctx: HashWorkerContext,
): Promise<HashResponse | null> {
  if (typeof request !== "object" || request === null) return null;
  const { id, kind } = request as { id?: unknown; kind?: unknown };
  if (typeof id !== "number" || !Number.isInteger(id) || id < 0) return null;

  if (kind === "pixels") {
    return hashPixels(id, (request as { input: PdqInput }).input);
  }

  if (kind === "file") {
    const file = (request as { file?: unknown }).file;
    if (typeof file !== "object" || file === null) return { id, ok: false, code: "bad_request" };
    let bitmap: ImageBitmap;
    try {
      bitmap = await ctx.decodeFile(file as File);
    } catch {
      return { id, ok: false, code: "decode_failed" };
    }
    try {
      return hashPixels(id, ctx.bitmapToPixels(bitmap));
    } catch {
      return { id, ok: false, code: "hash_failed" };
    } finally {
      bitmap.close();
    }
  }

  if (kind === "bitmap") {
    const bitmap = (request as { bitmap?: unknown }).bitmap;
    if (typeof bitmap !== "object" || bitmap === null) return { id, ok: false, code: "bad_request" };
    try {
      // Ownership moved with the transfer: read the pixels, then free it.
      return hashPixels(id, ctx.bitmapToPixels(bitmap as ImageBitmap));
    } catch {
      return { id, ok: false, code: "hash_failed" };
    } finally {
      (bitmap as ImageBitmap).close();
    }
  }

  return { id, ok: false, code: "bad_request" };
}
