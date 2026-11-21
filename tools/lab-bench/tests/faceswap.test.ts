import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ellipseMask, swapGeometry, swapFace, FACESWAP_MARGIN } from "../src/faceswap.ts";
import type { DetectedFace } from "../src/landmarks.ts";

const face = (over: Partial<DetectedFace>): DetectedFace => ({
  box: { x: 40, y: 40, w: 20, h: 20 },
  leftEye: { x: 45, y: 50 },
  rightEye: { x: 55, y: 50 },
  score: 0.9,
  ...over,
});

describe("swapGeometry", () => {
  it("aligns eyes exactly with no rotation (pinned numbers)", () => {
    const g = swapGeometry(
      { width: 100, height: 100 },
      face({}),
      { width: 80, height: 60 },
      face({ box: { x: 30, y: 20, w: 16, h: 24 }, leftEye: { x: 34, y: 30 }, rightEye: { x: 42, y: 30 } }),
    );
    // Scale = target eye distance (10) / source eye distance (8) = 1.25.
    expect(g.scale).toBe(1.25);
    expect(g.rotateDeg).toBe(0);
    // The window is the mapped face box (20x30) plus 35% margin each side:
    // 34x51, clipped to the rotated, scaled source (100x75).
    expect(g.window).toEqual({ left: 31, top: 15, width: 34, height: 51 });
    // The eye midpoint maps onto the target's: delta (2.5, 12.5) from the
    // rounded window origin (31, 15) -> patch position (34, 28).
    expect(g.patchPos).toEqual({ x: 34, y: 28 });
  });

  it("rotates the source eye line onto the target's (pinned numbers)", () => {
    const g = swapGeometry(
      { width: 100, height: 100 },
      face({ leftEye: { x: 50, y: 45 }, rightEye: { x: 50, y: 55 } }),
      { width: 80, height: 60 },
      face({ box: { x: 30, y: 20, w: 16, h: 24 }, leftEye: { x: 34, y: 30 }, rightEye: { x: 42, y: 30 } }),
    );
    expect(g.rotateDeg).toBe(90);
    // 80x60 rotated by 90 degrees becomes 60x80; scaled by 1.25 -> 75x100.
    expect(g.window).toEqual({ left: 18, top: 22, width: 34, height: 51 });
    // delta (12.5, 2.5) from the window origin (18, 22): cos(90 deg) is not
    // exactly zero in floating point, so the midpoint lands a hair under
    // 30.5 and rounds to 30, not 31.
    expect(g.patchPos).toEqual({ x: 30, y: 25 });
  });

  it("clips the window to the rotated, scaled source", () => {
    const g = swapGeometry(
      { width: 100, height: 100 },
      face({}),
      { width: 20, height: 20 },
      face({ box: { x: 2, y: 2, w: 16, h: 16 }, leftEye: { x: 6, y: 10 }, rightEye: { x: 14, y: 10 } }),
    );
    // The whole (scaled) source is smaller than the unclipped window.
    expect(g.window.width).toBeLessThanOrEqual(20 * g.scale);
    expect(g.window.height).toBeLessThanOrEqual(20 * g.scale);
    expect(g.window.left).toBe(0);
    expect(g.window.top).toBe(0);
  });

  it("throws on degenerate eye distance", () => {
    expect(() =>
      swapGeometry({ width: 10, height: 10 }, face({}), { width: 10, height: 10 }, face({ leftEye: { x: 45, y: 50 }, rightEye: { x: 45, y: 50 } })),
    ).toThrow();
  });

  it("uses the documented margin", () => {
    expect(FACESWAP_MARGIN).toBe(0.35);
  });
});

describe("ellipseMask", () => {
  it("is opaque at the centre and transparent at the corners", async () => {
    const mask = await ellipseMask(40, 40, 20, 20, 15, 15);
    const { data, info } = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
    expect(px(20, 20)).toBe(255);
    expect(px(0, 0)).toBe(0);
    expect(px(39, 39)).toBe(0);
  });
});

describe("swapFace", () => {
  it("lands the source's eye-midpoint content on the target's eye midpoint, through rotation", async () => {
    // Target: solid red, eye line vertical (rotates the source by 90 deg).
    const target = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    // Source: solid blue with a white square centred on the eye midpoint.
    const white = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
      <rect width="60" height="60" fill="rgb(20,20,200)"/>
      <rect x="26" y="25" width="10" height="10" fill="white"/></svg>`;
    const source = await sharp(Buffer.from(white)).png().toBuffer();
    const targetFace = face({ box: { x: 22, y: 15, w: 16, h: 20 }, leftEye: { x: 30, y: 20 }, rightEye: { x: 30, y: 30 } });
    const sourceFace = face({ box: { x: 24, y: 22, w: 14, h: 16 }, leftEye: { x: 28, y: 30 }, rightEye: { x: 34, y: 30 } });

    const out = await swapFace(target, source, targetFace, sourceFace);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(60);
    expect(meta.height).toBe(60);

    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [raw.data[(y * raw.info.width + x) * 3], raw.data[(y * raw.info.width + x) * 3 + 1], raw.data[(y * raw.info.width + x) * 3 + 2]];
    // The target eye midpoint (30, 25) must now be the source's eye-midpoint
    // content (white), possibly colour-shifted toward the target's face mean.
    // Red alone would mean the rotation or the patch position is wrong.
    const [r, g, b] = px(30, 25);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeGreaterThan(120);
    expect(b).toBeGreaterThan(120);
    // The corner outside the patch stays the target's red.
    const [cr, cg, cb] = px(4, 4);
    expect(cr).toBeGreaterThan(200);
    expect(cg).toBeLessThan(80);
    expect(cb).toBeLessThan(80);
  });

  it("is deterministic", async () => {
    const target = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 10, g: 100, b: 200 } } }).png().toBuffer();
    const source = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 200, g: 120, b: 30 } } }).png().toBuffer();
    const targetFace = face({ box: { x: 15, y: 15, w: 20, h: 20 }, leftEye: { x: 20, y: 25 }, rightEye: { x: 30, y: 25 } });
    const sourceFace = face({ box: { x: 15, y: 15, w: 20, h: 20 }, leftEye: { x: 20, y: 25 }, rightEye: { x: 30, y: 25 } });
    const a = await swapFace(target, source, targetFace, sourceFace);
    const b = await swapFace(target, source, targetFace, sourceFace);
    expect(a.equals(b)).toBe(true);
  });
});
