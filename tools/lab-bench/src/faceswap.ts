/**
 * The E1 face-swap composite (the "morph" generator): paste one portrait's
 * face onto another portrait, landmark-aligned, with a feathered blend —
 * CPU only, deterministic, OpenCV-free.
 *
 * Alignment is exact on the eyes: the source image is rotated so its eye line
 * matches the target's, scaled so the eye distances match, and positioned so
 * the eye midpoints coincide. "Seamless blending" here means the OpenCV-free
 * approximation: a colour-matched patch (mean-shifted toward the target
 * face's colour) composited through a Gaussian-feathered elliptical mask.
 * The seam sits inside skin tones, which is what makes a low-tech composite
 * hard to spot and hard to hash.
 */
import sharp from "sharp";
import type { DetectedFace } from "./landmarks.ts";
import { jpegNearLossless } from "./transforms.ts";

/** Patch margin around the face box, as a fraction of the box sides. */
export const FACESWAP_MARGIN = 0.35;
/** Mask ellipse radii as a fraction of the mapped face box halves. */
export const FACESWAP_MASK = 0.9;
/** Feather blur, as a fraction of the smaller patch side (min 2 px). */
export const FACESWAP_FEATHER = 0.06;
/** Colour-match shift cap per channel (mean matching, clamped). */
export const FACESWAP_COLOR_CAP = 40;

type Pt = { x: number; y: number };

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

/** Rotate a vector by a visual-clockwise angle (y-down frame, sharp's rotate). */
function rot(v: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function angleDeg(v: Pt): number {
  return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

/** EXIF-upright lossless normalisation: the locator works in this frame too. */
async function upright(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", animated: false }).rotate().png().toBuffer();
}

export type SwapGeometry = {
  /** Degrees to rotate the source so its eye line matches the target's. */
  rotateDeg: number;
  /** Scale so the source eye distance matches the target's. */
  scale: number;
  /** The patch window to extract from the rotated, scaled source. */
  window: { left: number; top: number; width: number; height: number };
  /** Where the patch lands on the (upright) target image. */
  patchPos: { x: number; y: number };
};

/**
 * The pure geometry of a swap, so tests can pin every number. All inputs
 * must be in the upright frame (EXIF orientation applied), which is what both
 * the locator and the swap pipeline work in.
 */
export function swapGeometry(
  targetMeta: { width: number; height: number },
  targetFace: DetectedFace,
  sourceMeta: { width: number; height: number },
  sourceFace: DetectedFace,
): SwapGeometry {
  const ms: Pt = { x: (sourceFace.leftEye.x + sourceFace.rightEye.x) / 2, y: (sourceFace.leftEye.y + sourceFace.rightEye.y) / 2 };
  const mt: Pt = { x: (targetFace.leftEye.x + targetFace.rightEye.x) / 2, y: (targetFace.leftEye.y + targetFace.rightEye.y) / 2 };
  const ds = Math.hypot(sourceFace.rightEye.x - sourceFace.leftEye.x, sourceFace.rightEye.y - sourceFace.leftEye.y);
  const dt = Math.hypot(targetFace.rightEye.x - targetFace.leftEye.x, targetFace.rightEye.y - targetFace.leftEye.y);
  if (ds <= 0 || dt <= 0) throw new Error("faceswap: degenerate eye distance");
  const rotateDeg = angleDeg(sub(targetFace.rightEye, targetFace.leftEye)) - angleDeg(sub(sourceFace.rightEye, sourceFace.leftEye));
  const scale = dt / ds;

  // After sharp.rotate the canvas grows to fit; every source point moves to
  // c_r + rot(p - c) with c the original center and c_r the rotated canvas
  // center. Then the resize scales every coordinate by `scale`.
  const c: Pt = { x: sourceMeta.width / 2, y: sourceMeta.height / 2 };
  const r = (rotateDeg * Math.PI) / 180;
  const rw = Math.abs(sourceMeta.width * Math.cos(r)) + Math.abs(sourceMeta.height * Math.sin(r));
  const rh = Math.abs(sourceMeta.width * Math.sin(r)) + Math.abs(sourceMeta.height * Math.cos(r));
  const cr: Pt = { x: rw / 2, y: rh / 2 };
  const sb: Pt = { x: sourceFace.box.x + sourceFace.box.w / 2, y: sourceFace.box.y + sourceFace.box.h / 2 };
  const mRS = mul(add(cr, rot(sub(ms, c), rotateDeg)), scale);
  const bRS = mul(add(cr, rot(sub(sb, c), rotateDeg)), scale);
  const bw = sourceFace.box.w * scale;
  const bh = sourceFace.box.h * scale;

  // The window is the mapped face box plus margin, clipped to the source.
  const width = Math.min(bw * (1 + 2 * FACESWAP_MARGIN), rw * scale);
  const height = Math.min(bh * (1 + 2 * FACESWAP_MARGIN), rh * scale);
  const left = Math.max(0, Math.min(bRS.x - width / 2, rw * scale - width));
  const top = Math.max(0, Math.min(bRS.y - height / 2, rh * scale - height));

  // Translation so the eye midpoints coincide on the target. The window
  // origin is rounded for extraction, so the patch position carries the same
  // rounding to keep the eyes aligned.
  const originX = Math.round(left);
  const originY = Math.round(top);
  const delta = sub(mt, mRS);
  return {
    rotateDeg,
    scale,
    window: { left: originX, top: originY, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) },
    patchPos: { x: Math.max(0, Math.round(originX + delta.x)), y: Math.max(0, Math.round(originY + delta.y)) },
  };
}

async function meanColor(buffer: Buffer, region?: { left: number; top: number; width: number; height: number }): Promise<[number, number, number]> {
  let img = sharp(buffer, { failOn: "none", animated: false }).ensureAlpha();
  if (region) img = img.extract(region);
  const stats = await img.stats();
  return stats.channels.slice(0, 3).map((s) => s.mean) as [number, number, number];
}

async function shiftColors(buffer: Buffer, shift: [number, number, number]): Promise<Buffer> {
  const { data, info } = await sharp(buffer, { failOn: "none", animated: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const stride = info.channels;
  for (let i = 0; i < info.width * info.height; i++) {
    for (let k = 0; k < 3; k++) {
      const v = data[i * stride + k]! + shift[k]!;
      data[i * stride + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: stride as 4 } }).png().toBuffer();
}

/** A feathered elliptical mask (opaque where the patch shows through). */
export async function ellipseMask(width: number, height: number, cx: number, cy: number, rx: number, ry: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`;
  const sigma = Math.max(2, Math.min(width, height) * FACESWAP_FEATHER);
  return sharp(Buffer.from(svg)).blur(sigma).ensureAlpha().png().toBuffer();
}

/**
 * Composite source's face onto target, aligned on the eyes. Returns a JPEG
 * (quality 92 — the composite itself is the alteration; the WhatsApp
 * transform stacks compression on top as its own row).
 */
export async function swapFace(target: Buffer, source: Buffer, targetFace: DetectedFace, sourceFace: DetectedFace): Promise<Buffer> {
  const targetUp = await upright(target);
  const sourceUp = await upright(source);
  const targetMeta = await sharp(targetUp).metadata();
  const sourceMeta = await sharp(sourceUp).metadata();
  if (!targetMeta.width || !targetMeta.height || !sourceMeta.width || !sourceMeta.height) throw new Error("faceswap: unreadable image");
  const g = swapGeometry({ width: targetMeta.width, height: targetMeta.height }, targetFace, { width: sourceMeta.width, height: sourceMeta.height }, sourceFace);

  // Rotate onto the target's eye line, scale to its eye distance, extract.
  const rotated = await sharp(sourceUp).rotate(g.rotateDeg, { background: { r: 0, g: 0, b: 0 } }).png().toBuffer();
  const rotatedMeta = await sharp(rotated).metadata();
  const scaled = await sharp(rotated)
    .resize({
      width: Math.max(1, Math.round((rotatedMeta.width ?? 1) * g.scale)),
      height: Math.max(1, Math.round((rotatedMeta.height ?? 1) * g.scale)),
      kernel: "cubic",
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const patch = await sharp(scaled).extract(g.window).png().toBuffer();

  // Colour match: shift the patch toward the target face's mean colour.
  const patchMean = await meanColor(patch);
  const targetFaceRegion = {
    left: Math.max(0, Math.round(targetFace.box.x)),
    top: Math.max(0, Math.round(targetFace.box.y)),
    width: Math.max(1, Math.round(targetFace.box.w)),
    height: Math.max(1, Math.round(targetFace.box.h)),
  };
  const targetMean = await meanColor(targetUp, targetFaceRegion);
  const shift: [number, number, number] = [
    Math.max(-FACESWAP_COLOR_CAP, Math.min(FACESWAP_COLOR_CAP, targetMean[0] - patchMean[0])),
    Math.max(-FACESWAP_COLOR_CAP, Math.min(FACESWAP_COLOR_CAP, targetMean[1] - patchMean[1])),
    Math.max(-FACESWAP_COLOR_CAP, Math.min(FACESWAP_COLOR_CAP, targetMean[2] - patchMean[2])),
  ];
  const shifted = shift.some((v) => v !== 0) ? await shiftColors(patch, shift) : patch;

  // Feathered elliptical mask over the mapped face box, premultiplied in.
  const mask = await ellipseMask(
    g.window.width,
    g.window.height,
    g.window.width / 2,
    g.window.height / 2,
    (sourceFace.box.w * g.scale / 2) * FACESWAP_MASK,
    (sourceFace.box.h * g.scale / 2) * FACESWAP_MASK,
  );
  const masked = await sharp(shifted).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

  const out = await sharp(targetUp)
    .ensureAlpha()
    .composite([{ input: masked, left: g.patchPos.x, top: g.patchPos.y }])
    .png()
    .toBuffer();
  return jpegNearLossless(out);
}
