import sharp from "sharp";
import { computePdqHash, type PdqResult } from "../../../asmita/src/lib/pdq/pdq";
import { prepareForPdq } from "./prepare";

/**
 * "baseline": what a crawler author would write first. Auto-orient, force RGBA,
 * raw pixels, no colourspace handling and no canvas-alpha emulation.
 */
export async function nodeBaselineHash(buf: Buffer): Promise<PdqResult & { width: number; height: number }> {
  const { data, info } = await sharp(buf, { failOn: "none" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = computePdqHash({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height });
  return { ...r, width: info.width, height: info.height };
}

/** "prepared": the documented recipe in prepare.ts. */
export async function nodePreparedHash(buf: Buffer): Promise<PdqResult & { width: number; height: number }> {
  const input = await prepareForPdq(buf);
  return { ...computePdqHash(input), width: input.width, height: input.height };
}
