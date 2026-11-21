/*
 * SSCD embedding input for the trace tool (experiment E3).
 *
 * A faithful port of the tensor half of crawler/src/image/sscd-model.ts and
 * tools/lab-bench/src/sscd.ts (same model, same recipe — keep the three in
 * step): HWC interleaved RGB bytes -> NCHW float32 tensor, scaled to [0, 1]
 * and normalised per channel with the ImageNet mean/std, for Meta's
 * sscd_disc_mixup ONNX export (input `images` float32 [1, 3, 320, 320],
 * output `embeddings` float32 [1, 512], L2-normalised, so cosine is a plain
 * dot product).
 *
 * Pure RGBA in (the canvas draw in the browser and sharp's resize in the
 * lab-bench harness both produce the 320x320 square first — the SSCD repo's
 * square-tensor recipe, which skews aspect on purpose), tensor out. Pinned by
 * unit tests against hand-computed values.
 */

import type { Rgba } from "./geometry";

/** The pinned export's fixed input size (sscd_disc_mixup ONNX, 320x320). */
export const SSCD_INPUT_SIZE = 320;
/** The export's embedding width (L2-normalised 512-dim). */
export const SSCD_EMBED_DIM = 512;
/** ImageNet channel statistics the SSCD repo normalises with (RGB order). */
export const MEAN = [0.485, 0.456, 0.406] as const;
export const STD = [0.229, 0.224, 0.225] as const;

/**
 * HWC interleaved RGB bytes -> NCHW float32 tensor, scaled to [0,1] and
 * normalised per channel. The input must already be size x size RGBA.
 */
export function buildSscdTensor(rgba: Rgba, size = SSCD_INPUT_SIZE): Float32Array {
  const pixels = size * size;
  if (rgba.width !== size || rgba.height !== size) throw new Error("sscd: input is not square at model size");
  if (rgba.data.length !== pixels * 4) throw new Error("sscd: bad rgba length");
  const out = new Float32Array(3 * pixels);
  for (let c = 0; c < 3; c++) {
    const mean = MEAN[c]!;
    const std = STD[c]!;
    const plane = out.subarray(c * pixels, (c + 1) * pixels);
    for (let i = 0; i < pixels; i++) {
      plane[i] = (rgba.data[i * 4 + c]! / 255 - mean) / std;
    }
  }
  return out;
}

/** Cosine of two L2-normalised vectors: a plain dot product. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i]! * b[i]!;
  return s;
}
