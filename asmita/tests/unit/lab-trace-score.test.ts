/*
 * The trace core's pixel-and-signal tests (E3, WP76): geometry, the SSCD
 * tensor, the region split, and traceSignals itself. Everything runs on
 * tiny synthetic images built in memory — no fixtures, no faces, no models.
 */
import { describe, expect, it } from "vitest";
import {
  applySimilarity,
  backgroundMaskBox,
  clampBox,
  cropRgba,
  faceCropBox,
  lumaPlane,
  pixelsEqual,
  resizeRgbaNearest,
  similarityFromEyes,
  withBoxMasked,
  workingSize,
  MASK_GREY,
  type FaceLandmarks,
  type Rgba,
} from "@/lib/lab/trace/geometry";
import { buildSscdTensor, cosine } from "@/lib/lab/trace/sscd";
import {
  MIN_FACE_CROP_SIDE,
  regionPdq,
  tileComparison,
  traceSignals,
  TRACE_TOOL_VERSION,
  type TraceInput,
} from "@/lib/lab/trace/score";

/** A textured synthetic image: deterministic sin-based patterns, never flat. */
function richImage(width: number, height: number, seed: number): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const r = 128 + 120 * Math.sin((x + seed * 37) / 9.1) * Math.cos((y + seed * 11) / 7.3);
      const g = 128 + 120 * Math.sin((y * 1.7 + seed * 53) / 11.0);
      const b = 128 + 120 * Math.cos((x * 0.9 + y * 1.3 + seed * 29) / 13.0);
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

/** A flat, untextured image (PDQ quality floor must reject these). */
function flatImage(width: number, height: number, fill: [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function solidImage(width: number, height: number, fill: [number, number, number], box?: { x: number; y: number; w: number; h: number }, boxFill?: [number, number, number]): Rgba {
  const img = flatImage(width, height, fill);
  if (box && boxFill) {
    for (let y = box.y; y < box.y + box.h && y < height; y++) {
      for (let x = box.x; x < box.x + box.w && x < width; x++) {
        const p = (y * width + x) * 4;
        img.data[p] = boxFill[0];
        img.data[p + 1] = boxFill[1];
        img.data[p + 2] = boxFill[2];
      }
    }
  }
  return img;
}

const faceAt = (x: number, y: number, w: number, h: number): FaceLandmarks => ({
  box: { x, y, w, h },
  leftEye: { x: x + w * 0.3, y: y + h * 0.4 },
  rightEye: { x: x + w * 0.7, y: y + h * 0.4 },
});

describe("trace geometry", () => {
  it("caps the working copy at the long edge and never upscales", () => {
    expect(workingSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(workingSize(1600, 1200)).toEqual({ width: 1600, height: 1200 });
    expect(workingSize(300, 500)).toEqual({ width: 300, height: 500 });
  });

  it("clamps boxes to the image", () => {
    expect(clampBox({ x: -10, y: -5, w: 100, h: 50 }, 80, 60)).toEqual({ x: 0, y: 0, w: 80, h: 50 });
    expect(clampBox({ x: 60, y: 50, w: 40, h: 20 }, 80, 60)).toEqual({ x: 60, y: 50, w: 20, h: 10 });
  });

  it("expands the face crop by 30% and the mask by 15%", () => {
    const face = faceAt(100, 100, 100, 100);
    expect(faceCropBox(face, 400, 400)).toEqual({ x: 70, y: 70, w: 160, h: 160 });
    expect(backgroundMaskBox(face, 400, 400)).toEqual({ x: 85, y: 85, w: 130, h: 130 });
  });

  it("crops exact pixels", () => {
    const img = solidImage(4, 4, [10, 20, 30], { x: 1, y: 1, w: 2, h: 2 }, [200, 210, 220]);
    const crop = cropRgba(img, { x: 1, y: 1, w: 1, h: 2 });
    expect(crop.width).toBe(1);
    expect(crop.height).toBe(2);
    expect(Array.from(crop.data.subarray(0, 4))).toEqual([200, 210, 220, 255]);
  });

  it("masks only the box, leaving the rest untouched", () => {
    const img = solidImage(10, 10, [1, 2, 3], { x: 4, y: 4, w: 2, h: 2 }, [250, 250, 250]);
    const masked = withBoxMasked(img, { x: 4, y: 4, w: 2, h: 2 });
    const at = (img2: Rgba, x: number, y: number) => Array.from(img2.data.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 4));
    expect(at(masked, 4, 4)).toEqual([MASK_GREY, MASK_GREY, MASK_GREY, 255]);
    expect(at(masked, 5, 5)).toEqual([MASK_GREY, MASK_GREY, MASK_GREY, 255]);
    expect(at(masked, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(at(masked, 9, 9)).toEqual([1, 2, 3, 255]);
    expect(at(img, 4, 4)).toEqual([250, 250, 250, 255]); // the source is untouched
  });

  it("resizes nearest-neighbour", () => {
    const img = solidImage(2, 2, [0, 0, 0], { x: 0, y: 0, w: 1, h: 1 }, [255, 255, 255]);
    const out = resizeRgbaNearest(img, 4, 4);
    const px = (x: number, y: number) => out.data[(y * 4 + x) * 4];
    expect(px(0, 0)).toBe(255);
    expect(px(3, 3)).toBe(0);
    expect(px(2, 2)).toBe(0);
  });

  it("builds the eye similarity transform and samples its inverse", () => {
    const source = solidImage(4, 4, [90, 90, 90], { x: 0, y: 0, w: 1, h: 1 }, [255, 0, 0]);
    // Identity transform: the image comes back unchanged.
    const eyes = { leftEye: { x: 0, y: 0 }, rightEye: { x: 2, y: 0 } };
    const identity = similarityFromEyes(eyes, eyes)!;
    const same = applySimilarity(source, identity, 4, 4);
    expect(pixelsEqual(same, source)).toBe(true);
    // Scale by 2 about the origin: T(p) = 2p, so output (1,1) samples the
    // source's red corner (0.5,0.5 -> pixel (0,0)).
    const wide = { leftEye: { x: 0, y: 0 }, rightEye: { x: 4, y: 0 } };
    const t = similarityFromEyes(eyes, wide)!;
    expect(t.s).toBeCloseTo(2, 5);
    expect(t.angle).toBeCloseTo(0, 5);
    const scaled = applySimilarity(source, t, 4, 4);
    const px = (x: number, y: number) => Array.from(scaled.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 3));
    expect(px(1, 1)).toEqual([255, 0, 0]);
    expect(px(3, 3)).toEqual([90, 90, 90]);
  });

  it("rejects degenerate eye pairs and blackens out-of-bounds samples", () => {
    const degenerate = similarityFromEyes(faceAt(0, 0, 0, 0), faceAt(10, 10, 10, 10));
    expect(degenerate).toBeNull(); // both eye pairs collapse to a point
    const t = similarityFromEyes(faceAt(0, 0, 100, 100), faceAt(390, 390, 100, 100))!;
    const source = solidImage(4, 4, [7, 8, 9]);
    const moved = applySimilarity(source, t, 4, 4);
    // Every output pixel samples far outside the 4x4 source: black, opaque.
    expect(Array.from(moved.data.subarray(0, 4))).toEqual([0, 0, 0, 255]);
  });

  it("compares pixels exactly and computes luma", () => {
    const a = richImage(16, 16, 1);
    const b = richImage(16, 16, 1);
    expect(pixelsEqual(a, b)).toBe(true);
    const c = richImage(16, 16, 2);
    expect(pixelsEqual(a, c)).toBe(false);
    const white = flatImage(1, 1, [255, 255, 255]);
    expect(lumaPlane(white)[0]).toBeCloseTo(255, 4);
    const mid = flatImage(1, 1, [0, 255, 0]);
    expect(lumaPlane(mid)[0]).toBeCloseTo(0.587 * 255, 4);
  });
});

describe("trace sscd input", () => {
  it("builds the NCHW tensor with the ImageNet normalisation", () => {
    const img = flatImage(2, 2, [255, 0, 128]);
    const t = buildSscdTensor(img, 2);
    expect(t.length).toBe(12);
    // R plane (first 4), then G, then B — HWC input becomes NCHW planes.
    expect(t[0]).toBeCloseTo((255 / 255 - 0.485) / 0.229, 5);
    expect(t[4]).toBeCloseTo((0 / 255 - 0.456) / 0.224, 5);
    expect(t[8]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
    // Every plane repeats its channel's value across the 2x2 image.
    expect(t[1]).toBeCloseTo(t[0]!, 6);
    expect(t[3]).toBeCloseTo(t[0]!, 6);
  });

  it("rejects non-square-at-size input", () => {
    expect(() => buildSscdTensor(flatImage(3, 3, [0, 0, 0]), 2)).toThrow();
  });

  it("dots L2-normalised vectors", () => {
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    expect(cosine([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1, 6);
    expect(cosine([0.6, 0.8], [-0.6, -0.8])).toBeCloseTo(-1, 6);
  });
});

describe("trace region scoring", () => {
  it("hashes textured images with usable quality and pins identical distance to 0", () => {
    const a = richImage(256, 256, 3);
    const score = regionPdq(a, richImage(256, 256, 3));
    expect(score).not.toBeNull();
    expect(score!.distance).toBe(0);
    // The synthetic patterns must clear the quality floor for the tests
    // (and for the e2e spec's canvas-drawn equivalents) to be meaningful.
    expect(score!.qualityA).toBeGreaterThanOrEqual(25);
  });

  it("scores flat images as flat (quality below the floor)", () => {
    const score = regionPdq(flatImage(64, 64, [120, 30, 200]), flatImage(64, 64, [120, 30, 200]));
    expect(score!.distance).toBe(0);
    expect(score!.qualityA).toBeLessThan(25);
  });

  it("splits the face and background regions (E1's margins, E1's grey)", () => {
    const W = 512;
    // The suspect: the original with the face area overwritten (a morph).
    const original = richImage(W, W, 5);
    const suspect = { ...original, data: new Uint8ClampedArray(original.data) };
    const face = faceAt(200, 200, 96, 96);
    for (let y = face.box.y; y < face.box.y + face.box.h; y++) {
      for (let x = face.box.x; x < face.box.x + face.box.w; x++) {
        const p = (y * W + x) * 4;
        suspect.data[p] = (x * 7 + y * 3) % 256;
        suspect.data[p + 1] = (x * 2 + y * 11) % 256;
        suspect.data[p + 2] = (x * 13 + y * 5) % 256;
      }
    }
    const signals = traceSignals({
      suspect,
      original,
      suspectFace: face,
      originalFace: face,
      suspectSscd: null,
      originalSscd: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    // The untouched background matches exactly; the swapped face does not.
    expect(signals.background!.distance).toBeLessThanOrEqual(signals.face!.distance);
    expect(signals.background!.distance).toBeLessThanOrEqual(24);
    expect(signals.face!.distance).toBeGreaterThan(24);
    expect(signals.tiles.aligned).toBe(true);
    expect(signals.tiles.agreement).toBeGreaterThan(0.8);
  });

  it("skips region scores when the face crop is too small", () => {
    const img = richImage(64, 64, 7);
    const tiny = faceAt(0, 0, MIN_FACE_CROP_SIDE - 20, MIN_FACE_CROP_SIDE - 20);
    const signals = traceSignals({
      suspect: img,
      original: { ...img },
      suspectFace: tiny,
      originalFace: tiny,
      suspectSscd: null,
      originalSscd: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    expect(signals.face).toBeNull();
    expect(signals.background).toBeNull();
  });

  it("reports the honest notes for every degraded mode", () => {
    const img = richImage(64, 64, 9);
    const base = {
      suspect: img,
      suspectSscd: null,
      originalSscd: null,
    } as const;
    const noFaces = traceSignals({
      ...base,
      original: { ...img },
      suspectFace: null,
      originalFace: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    expect(noFaces.notes).toContain("no_face_in_pair");
    expect(noFaces.notes).toContain("sscd_model_not_configured");

    const locatorDown = traceSignals({
      ...base,
      original: { ...img },
      suspectFace: null,
      originalFace: null,
      sscdConfigured: false,
      landmarksConfigured: false,
    } satisfies TraceInput);
    expect(locatorDown.notes).toContain("landmarks_unavailable");

    const sscdFailed = traceSignals({
      ...base,
      original: { ...img },
      suspectFace: null,
      originalFace: null,
      sscdConfigured: true,
      landmarksConfigured: false,
    } satisfies TraceInput);
    expect(sscdFailed.notes).toContain("sscd_inference_failed");

    const flat = traceSignals({
      ...base,
      original: flatImage(64, 64, [10, 20, 30]),
      suspect: flatImage(64, 64, [10, 20, 30]),
      suspectFace: null,
      originalFace: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    expect(flat.notes).toContain("low_image_quality");
  });

  it("marks byte-identical images", () => {
    const img = richImage(64, 64, 11);
    const signals = traceSignals({
      suspect: img,
      original: { ...img },
      suspectFace: null,
      originalFace: null,
      suspectSscd: null,
      originalSscd: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    expect(signals.notes).toContain("identical_pixels");
    expect(signals.tiles.agreement).toBe(1);
  });

  it("uses the SSCD cosine when embeddings are present", () => {
    const img = richImage(64, 64, 13);
    const vec = [1, 0, 0];
    const signals = traceSignals({
      suspect: img,
      original: { ...img },
      suspectFace: null,
      originalFace: null,
      suspectSscd: vec,
      originalSscd: vec,
      sscdConfigured: true,
      landmarksConfigured: true,
    } satisfies TraceInput);
    expect(signals.sscd).toEqual({ cosine: 1 });
  });

  it("compares tiles with tolerance and full agreement for identical images", () => {
    const img = richImage(128, 128, 15);
    const identical = tileComparison(img, { ...img }, false);
    expect(identical.agreement).toBe(1);
    expect(identical.heat.every((v) => v === 1)).toBe(true);
    const other = tileComparison(img, richImage(128, 128, 16), false);
    expect(other.agreement).toBeLessThan(0.2);
  });

  it("carries a tool version", () => {
    expect(TRACE_TOOL_VERSION).toMatch(/^trace-\d+\.\d+\.\d+$/);
  });
});
