import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { crop, mirror, overlay, resize, screenshot, whatsapp, WHATSAPP } from "../src/transforms.ts";
import { gradient, shape, stripes } from "../src/synthetic.ts";

const meta = async (buf: Buffer) => sharp(buf, { failOn: "none" }).metadata();

/** 3-channel raw pixels, so tests index with a fixed stride of 3. */
const raw3 = async (buf: Buffer) => sharp(buf, { failOn: "none" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

describe("crop", () => {
  it("keeps the documented 90% x 90% window at the documented offset", async () => {
    const out = await crop(await stripes(100, 80));
    const m = await meta(out);
    expect(m.width).toBe(90);
    expect(m.height).toBe(72);
    expect(m.format).toBe("png");
  });
});

describe("resize", () => {
  it("scales the long edge to 60% (landscape orientation preserved)", async () => {
    const out = await resize(await stripes(100, 40));
    const m = await meta(out);
    expect(m.width).toBe(60);
    expect(m.height).toBe(24);
    const outTall = await resize(await stripes(40, 100));
    const mTall = await meta(outTall);
    expect(mTall.width).toBe(24);
    expect(mTall.height).toBe(60);
  });
});

describe("mirror", () => {
  it("flips pixels horizontally", async () => {
    const img = await stripes(40, 20, 9); // stripes at x=0,9,18,27,36
    const out = await mirror(img);
    const a = await raw3(img);
    const b = await raw3(out);
    expect(a.info.width).toBe(b.info.width);
    expect(a.info.channels).toBe(3);
    const px = (r: { data: Buffer; info: { width: number } }, x: number) => [r.data[x * 3], r.data[x * 3 + 1], r.data[x * 3 + 2]];
    expect(px(b, 0)).toEqual(px(a, a.info.width - 1));
    expect(px(b, b.info.width - 1)).toEqual(px(a, 0));
    // A mirrored striped image differs from the original.
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});

describe("overlay", () => {
  it("changes pixels inside the sticker band and keeps the top intact", async () => {
    const img = await shape(80, 60, 3);
    const out = await overlay(img);
    const a = await raw3(img);
    const b = await raw3(out);
    expect(a.info.width).toBe(b.info.width);
    // Top-left corner: outside the band and the corner sticker.
    const cornerSame = a.data.slice(0, 3).every((v, k) => Math.abs(v - b.data[k]!) < 2);
    expect(cornerSame).toBe(true);
    // Inside the caption band (bottom fifth, centre): must have changed.
    const y = Math.round(b.info.height * 0.93);
    const x = Math.round(b.info.width * 0.5);
    const idx = (y * b.info.width + x) * 3;
    const changed = [0, 1, 2].some((k) => Math.abs(a.data[idx + k]! - b.data[idx + k]!) > 2);
    expect(changed).toBe(true);
  });
});

describe("screenshot", () => {
  it("adds a status bar and a border around the image", async () => {
    const out = await screenshot(await gradient(120, 80));
    const m = await meta(out);
    const border = Math.max(2, Math.round(80 * 0.02));
    const bar = Math.max(6, Math.round(80 * 0.05));
    expect(m.width).toBe(120 + 2 * border);
    expect(m.height).toBe(80 + 2 * border + bar);
    expect(m.format).toBe("png");
    // The status bar is dark, the added border light.
    const raw = await raw3(out);
    const px = (x: number, y: number) => [raw.data[(y * raw.info.width + x) * 3], raw.data[(y * raw.info.width + x) * 3 + 1], raw.data[(y * raw.info.width + x) * 3 + 2]];
    const barPx = px(Math.round(raw.info.width / 2), Math.round(bar / 2));
    expect(barPx.every((v) => v < 80)).toBe(true);
    const borderPx = px(1, bar + 1);
    expect(borderPx.every((v) => v > 200)).toBe(true);
  });
});

describe("whatsapp", () => {
  it("re-encodes as JPEG quality 70", async () => {
    const out = await whatsapp(await gradient(200, 150));
    const m = await meta(out);
    expect(m.format).toBe("jpeg");
    // 200x150 stays under the long-edge cap: no upscale, no downscale.
    expect(m.width).toBe(200);
    expect(m.height).toBe(150);
  });

  it("caps the long edge at 1600 without upscaling small images", async () => {
    const big = await sharp(await gradient(100, 60)).resize(2400, 1600).png().toBuffer();
    const out = await whatsapp(big);
    const m = await meta(out);
    expect(m.width).toBe(WHATSAPP.longEdge);
    // 2400x1600 scaled by 2/3: 1600 x 1066.67 -> sharp rounds to 1067.
    expect(m.height).toBe(1067);
    const small = await whatsapp(await gradient(120, 90));
    const ms = await meta(small);
    expect(ms.width).toBe(120);
    expect(ms.height).toBe(90);
  });

  it("loses detail (a q70 re-encode is lossy)", async () => {
    const img = await stripes(400, 300, 3);
    const out = await whatsapp(img);
    const a = await raw3(img);
    const b = await raw3(await sharp(out).resize(400, 300).png().toBuffer());
    let diff = 0;
    for (let i = 0; i < a.data.length; i += 3) if (Math.abs(a.data[i]! - b.data[i]!) > 8) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});
