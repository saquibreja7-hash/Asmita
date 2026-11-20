import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { canvasAlphaRoundTrip, prepareForPdq } from "../src/prepare.ts";
import { gradient, stripes } from "../src/synthetic.ts";

describe("prepareForPdq", () => {
  it("decodes a tiny PNG to RGBA at full size", async () => {
    const input = await prepareForPdq(await stripes());
    expect(input.width).toBe(96);
    expect(input.height).toBe(64);
    expect(input.data.length).toBe(96 * 64 * 4);
  });

  it("decodes JPEG the same way", async () => {
    const jpeg = await sharp(await gradient()).jpeg({ quality: 90 }).toBuffer();
    const input = await prepareForPdq(jpeg);
    expect(input.width).toBe(96);
    expect(input.height).toBe(64);
    expect(input.data.length).toBe(96 * 64 * 4);
  });

  it("applies EXIF orientation", async () => {
    const base = await sharp(await stripes()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const input = await prepareForPdq(base);
    // Orientation 6 rotates 90 degrees: 64 wide, 96 tall.
    expect(input.width).toBe(64);
    expect(input.height).toBe(96);
  });

  it("keeps fully opaque pixels untouched through the canvas round trip", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    canvasAlphaRoundTrip(px);
    expect(Array.from(px)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("emulates premultiply/unpremultiply for semi-transparent pixels", () => {
    const px = new Uint8ClampedArray([200, 0, 0, 128]);
    canvasAlphaRoundTrip(px);
    const pre = Math.round((200 * 128) / 255);
    const back = Math.min(255, Math.round((pre * 255) / 128));
    expect(px[0]).toBe(back);
    expect(px[3]).toBe(128);
  });

  it("zeroes fully transparent pixels", () => {
    const px = new Uint8ClampedArray([200, 100, 50, 0]);
    canvasAlphaRoundTrip(px);
    expect(Array.from(px)).toEqual([0, 0, 0, 0]);
  });
});
