/*
 * Pure pixel geometry for the trace tool (experiment E3, docs/lab/charter.md).
 *
 * Everything here works on plain RGBA buffers (the shape of an ImageData: a
 * Uint8ClampedArray of width*height*4 bytes) so the same code runs in the
 * browser (canvas decode) and in Node under the lab-bench harness, and every
 * function is pinned by unit tests. No DOM, no Node APIs, no imports.
 *
 * The region rules mirror the E1 harness (tools/lab-bench/src/matching.ts):
 * the face crop is the located box plus a 30% margin, the background masks
 * the face box plus a 15% margin with flat grey 128 — so E3's region scores
 * are the same regions E1 measured, not a second set of choices.
 */

export type Rgba = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

/** An axis-aligned pixel box. */
export type Box = { x: number; y: number; w: number; h: number };

/** What the trace tool needs from a face: a box and one point per eye. */
export type FaceLandmarks = {
  box: Box;
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
};

/** Face-crop margin as a fraction of the face box sides (E1: 0.3). */
export const FACE_CROP_MARGIN = 0.3;
/** Background-mask margin as a fraction of the face box sides (E1: 0.15). */
export const BACKGROUND_MASK_MARGIN = 0.15;
/** The flat grey the background method masks the face with (E1: 128). */
export const MASK_GREY = 128;

/** The working-copy cap: images are decoded (never upscaled) to this long edge. */
export const WORKING_LONG_EDGE = 2048;

export function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Clamp a box to the image, floored at 0 sides (an unusable crop reads as empty). */
export function clampBox(box: Box, width: number, height: number): Box {
  const x = clampInt(Math.round(box.x), 0, width);
  const y = clampInt(Math.round(box.y), 0, height);
  const w = clampInt(Math.round(box.w), 0, width - x);
  const h = clampInt(Math.round(box.h), 0, height - y);
  return { x, y, w, h };
}

/** A face box expanded by `margin` of its own sides and clamped to the image. */
export function expandFaceBox(face: { box: Box }, width: number, height: number, margin: number): Box {
  const mx = face.box.w * margin;
  const my = face.box.h * margin;
  return clampBox(
    { x: face.box.x - mx, y: face.box.y - my, w: face.box.w + 2 * mx, h: face.box.h + 2 * my },
    width,
    height,
  );
}

/** The face-crop region (E1's faceCrop): box + 30% margin. */
export function faceCropBox(face: FaceLandmarks, width: number, height: number): Box {
  return expandFaceBox(face, width, height, FACE_CROP_MARGIN);
}

/** The masked-out region (E1's backgroundMasked): box + 15% margin. */
export function backgroundMaskBox(face: FaceLandmarks, width: number, height: number): Box {
  return expandFaceBox(face, width, height, BACKGROUND_MASK_MARGIN);
}

/** Copy a rectangular region out of an image. */
export function cropRgba(img: Rgba, box: Box): Rgba {
  const { x, y, w, h } = clampBox(box, img.width, img.height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.width + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}

/** A copy of the image with `box` painted flat grey (the background method's mask). */
export function withBoxMasked(img: Rgba, box: Box, grey = MASK_GREY): Rgba {
  const out = new Uint8ClampedArray(img.data);
  const { x, y, w, h } = clampBox(box, img.width, img.height);
  for (let row = 0; row < h; row++) {
    let p = ((y + row) * img.width + x) * 4;
    for (let col = 0; col < w; col++) {
      out[p] = grey;
      out[p + 1] = grey;
      out[p + 2] = grey;
      out[p + 3] = 255;
      p += 4;
    }
  }
  return { data: out, width: img.width, height: img.height };
}

/** Nearest-neighbour resize (the resampler PDQ itself uses internally). */
export function resizeRgbaNearest(img: Rgba, width: number, height: number): Rgba {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(img.height - 1, Math.trunc((y * img.height) / height));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(img.width - 1, Math.trunc((x * img.width) / width));
      const src = (srcY * img.width + srcX) * 4;
      const dst = (y * width + x) * 4;
      out[dst] = img.data[src];
      out[dst + 1] = img.data[src + 1];
      out[dst + 2] = img.data[src + 2];
      out[dst + 3] = img.data[src + 3];
    }
  }
  return { data: out, width, height };
}

/** Fit-to-width/height working-copy dimensions for a decoded image (never upscale). */
export function workingSize(width: number, height: number, longEdge = WORKING_LONG_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= longEdge || longest === 0) return { width, height };
  const scale = longEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The similarity transform (uniform scale + rotation + translation, the
 * E1 face-swap alignment) that maps one eye pair onto the other:
 * T(p) = toLeft + s * R(angle) * (p - fromLeft). Both eye anchors are kept:
 * the inverse (used for sampling) needs the source anchor too.
 * Null when the eye pair is degenerate (no measurable eye distance).
 */
export type SimilarityTransform = { s: number; angle: number; fx: number; fy: number; tx: number; ty: number };

export function similarityFromEyes(
  from: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number } },
  to: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number } },
): SimilarityTransform | null {
  const fdx = from.rightEye.x - from.leftEye.x;
  const fdy = from.rightEye.y - from.leftEye.y;
  const tdx = to.rightEye.x - to.leftEye.x;
  const tdy = to.rightEye.y - to.leftEye.y;
  const fLen = Math.hypot(fdx, fdy);
  const tLen = Math.hypot(tdx, tdy);
  if (fLen < 1e-6 || tLen < 1e-6) return null;
  const s = tLen / fLen;
  const angle = Math.atan2(tdy, tdx) - Math.atan2(fdy, fdx);
  return { s, angle, fx: from.leftEye.x, fy: from.leftEye.y, tx: to.leftEye.x, ty: to.leftEye.y };
}

/**
 * Resample `img` through a similarity transform into a width x height canvas,
 * nearest-neighbour, sampling the transform's inverse (every output pixel
 * exactly once, no holes): out(q) = img(T^-1(q)) with
 * T^-1(q) = fromLeft + (1/s) * R(-angle) * (q - toLeft).
 */
export function applySimilarity(img: Rgba, t: SimilarityTransform, width: number, height: number): Rgba {
  const out = new Uint8ClampedArray(width * height * 4);
  const cos = Math.cos(t.angle);
  const sin = Math.sin(t.angle);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - t.tx;
      const dy = y - t.ty;
      const ux = dx / t.s;
      const uy = dy / t.s;
      // R(-angle) applied to (ux, uy):
      const rx = ux * cos + uy * sin;
      const ry = -ux * sin + uy * cos;
      const px = Math.trunc(rx + t.fx);
      const py = Math.trunc(ry + t.fy);
      const dst = (y * width + x) * 4;
      out[dst + 3] = 255;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const src = (py * img.width + px) * 4;
      out[dst] = img.data[src];
      out[dst + 1] = img.data[src + 1];
      out[dst + 2] = img.data[src + 2];
    }
  }
  return { data: out, width, height };
}

/** Rec.601 luma plane (the same luma PDQ hashes with), as float32. */
export function lumaPlane(img: Rgba): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
  }
  return out;
}

/** Exact pixel equality (same dimensions, same bytes). */
export function pixelsEqual(a: Rgba, b: Rgba): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  const da = a.data as ArrayLike<number>;
  const db = b.data as ArrayLike<number>;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  return true;
}
