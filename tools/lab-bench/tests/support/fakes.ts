import type { DetectedFace, FaceLocator } from "../../src/landmarks.ts";
import type { SscdSession } from "../../src/sscd.ts";

/** A face that fits inside the suite's 96x64 synthetic images. */
export const TINY_FACE: DetectedFace = {
  box: { x: 28, y: 14, w: 32, h: 30 },
  leftEye: { x: 36, y: 28 },
  rightEye: { x: 52, y: 28 },
  score: 0.95,
};

/** A deterministic locator: the same invented face(s) for every image. */
export class FakeLocator implements FaceLocator {
  constructor(private readonly faces: DetectedFace[] = [TINY_FACE]) {}

  async detect(): Promise<DetectedFace[]> {
    return this.faces.map((f) => ({ ...f, box: { ...f.box }, leftEye: { ...f.leftEye }, rightEye: { ...f.rightEye } }));
  }
}

/**
 * A fake SSCD session whose embedding summarises its input tensor: genuine
 * pairs (a re-encode of the same image) land close, unrelated images apart.
 */
export function fakeSscdSession(): SscdSession {
  return {
    inputNames: ["images"],
    outputNames: ["embeddings"],
    async run(inputs) {
      const tensor = (Object.values(inputs)[0] as { data: Float32Array }).data;
      let sum = 0;
      let sumsq = 0;
      for (let i = 0; i < tensor.length; i++) {
        sum += tensor[i]!;
        sumsq += tensor[i]! * tensor[i]!;
      }
      const out = new Float32Array(512);
      out[0] = sum / 1e6;
      out[1] = sumsq / 1e6;
      return { embeddings: { data: out } };
    },
  };
}

/**
 * A fake SSCD session for the trace tests. The one above summarises the
 * tensor by sum statistics, so any two images with the same colour palette
 * collide — useless for source ranking. This one bins the tensor's mean
 * over the central half of the image into coarse 1.0-wide bins and emits a
 * one-hot, L2-normalised embedding per bin: same-bin pairs score cosine 1
 * (the trace core's strong band), different-bin pairs 0 (no evidence) — the
 * way the real model separates copies of an image from unrelated images.
 * The central half keeps the bin stable under the transforms that only
 * touch the periphery (a screenshot's frame and status bar, an overlay's
 * caption band), while a re-encode, reframe, mirror or resize cannot move
 * the mean a whole bin.
 */
export function fakeTraceSscdSession(): SscdSession {
  const SIDE = 320; // the pinned model's square input; the tensor is [3, SIDE, SIDE]
  const BINS = 64; // one slot per bin of the central mean, centred at 0
  const LO = SIDE / 4;
  const HI = (3 * SIDE) / 4;
  return {
    inputNames: ["images"],
    outputNames: ["embeddings"],
    async run(inputs) {
      const tensor = (Object.values(inputs)[0] as { data: Float32Array }).data;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < 3; c++) {
        const plane = c * SIDE * SIDE;
        for (let y = LO; y < HI; y++) {
          for (let x = LO; x < HI; x++) {
            sum += tensor[plane + y * SIDE + x]!;
            n++;
          }
        }
      }
      const bin = Math.max(0, Math.min(BINS - 1, Math.round(sum / n) + BINS / 2));
      const out = new Float32Array(512);
      out[bin] = 1;
      return { embeddings: { data: out } };
    },
  };
}
