/**
 * The preprocessing half of the SSCD child (WP28): the square-tensor
 * recipe (resize straight to 320x320, ImageNet normalisation, NCHW) and
 * the wire rounding. Pure functions, pinned value by value; the inference
 * itself is exercised by scripts/eval-sscd.ts against the real weights.
 */
import { describe, expect, it } from "vitest";
import { buildSscdTensor, roundVector, SSCD_INPUT_SIZE } from "../../src/image/sscd-model.ts";

describe("buildSscdTensor (WP28)", () => {
  it("builds NCHW planes with the ImageNet normalisation, value by value", () => {
    // A 2x2 image would be too small for the model's fixed 320x320 input;
    // the tensor builder is pure, so pin the arithmetic on a small grid
    // with the size passed explicitly.
    const size = 2;
    const rgb = new Uint8Array([
      0, 128, 255, 10, 20, 30,
      200, 200, 200, 255, 0, 0,
    ]);
    const t = buildSscdTensor(rgb, size);
    expect(t.length).toBe(3 * size * size);
    const px = (i: number, c: number) => (rgb[i * 3 + c]! / 255 - [0.485, 0.456, 0.406][c]) / [0.229, 0.224, 0.225][c];
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < size * size; i++) {
        expect(t[c * size * size + i]).toBeCloseTo(px(i, c), 6);
      }
    }
  });

  it("refuses a buffer that is not exactly size*size*3", () => {
    expect(() => buildSscdTensor(new Uint8Array(3), SSCD_INPUT_SIZE)).toThrow();
    expect(() => buildSscdTensor(new Uint8Array(SSCD_INPUT_SIZE * SSCD_INPUT_SIZE * 3 + 1))).toThrow();
  });

  it("rounds vectors to 1e-6 for the wire without moving cosine meaningfully", () => {
    const v = [0.123456789, -0.987654321, 0.5];
    expect(roundVector(v)).toEqual([0.123457, -0.987654, 0.5]);
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
    const n = Math.sqrt(dot(v, v));
    const unit = v.map((x) => x / n);
    const rounded = roundVector(unit);
    expect(Math.abs(dot(unit, rounded) - 1)).toBeLessThan(1e-5);
  });
});
