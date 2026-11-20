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
