/**
 * SSCD preprocessing (WP28): image bytes -> the model's input tensor.
 *
 * The model is `sscd_disc_mixup` exported to ONNX (see
 * asmita/docs/adr/008-sscd-second-layer.md for the licence and the pinned
 * artifact): input `images` float32 NCHW [1, 3, 320, 320], output
 * `embeddings` float32 [1, 512], L2-normalised. The preprocessing follows
 * the SSCD repo's square-tensor recipe — "Copy detection using square
 * tensors benefits from directly resizing the image to the target tensor
 * size. This skews the image, and does not preserve aspect ratio":
 * convert to RGB, resize straight to 320x320, scale to [0,1], normalise
 * per channel with the ImageNet mean/std (RGB order).
 *
 * The decode half runs the exact same rules as PDQ hashing
 * (hash-image.ts): magic-byte allowlist, sharp format agreement, pixel cap,
 * minimum side, truncation mapping — an attacker image gets no second,
 * laxer path into a model. Everything stays in memory; nothing is written
 * to disk.
 */
import sharp from "sharp";
import { CrawlError } from "../errors.ts";
import { prepareImage } from "./hash-image.ts";

/** The pinned export's fixed input size (sscd_disc_mixup ONNX, 320x320). */
export const SSCD_INPUT_SIZE = 320;
/** ImageNet channel statistics the SSCD repo normalises with (RGB order). */
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/**
 * Decode under every whole-image rule and shrink to the model's square
 * input. Returns 320*320*3 raw sRGB bytes (no alpha; the model wants RGB).
 */
export async function prepareSscdInput(bytes: Buffer, opts: { minSide: number }): Promise<Uint8Array> {
  const { input } = await prepareImage(bytes, opts);
  const { data } = await sharp(input.data, { raw: { width: input.width, height: input.height, channels: 4 } })
    .resize(SSCD_INPUT_SIZE, SSCD_INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (data.length !== SSCD_INPUT_SIZE * SSCD_INPUT_SIZE * 3) throw new CrawlError("sscd_inference_failed");
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * HWC interleaved RGB bytes -> NCHW float32 tensor, scaled to [0,1] and
 * normalised per channel. Pure, so a test can pin every value.
 */
export function buildSscdTensor(rgb: Uint8Array, size = SSCD_INPUT_SIZE): Float32Array {
  const pixels = size * size;
  if (rgb.length !== pixels * 3) throw new CrawlError("sscd_inference_failed");
  const out = new Float32Array(3 * pixels);
  for (let c = 0; c < 3; c++) {
    const mean = MEAN[c]!;
    const std = STD[c]!;
    const plane = out.subarray(c * pixels, (c + 1) * pixels);
    for (let i = 0; i < pixels; i++) {
      plane[i] = (rgb[i * 3 + c]! / 255 - mean) / std;
    }
  }
  return out;
}

/**
 * Round a vector for the wire (1e-6): the vectors are L2-normalised, so the
 * rounding moves any cosine by under 1e-5, and payloads shrink ~40%.
 */
export function roundVector(vector: readonly number[]): number[] {
  return vector.map((v) => Math.round(v * 1_000_000) / 1_000_000);
}
