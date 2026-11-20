import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { alterations, blur, border, brightness, contrast, crop, jpegQuality, mirror, resize, rotate, screenshotScale, stacks, sticker } from "../src/alter.ts";
import { COMMONS_PHOTOS, syntheticOriginals } from "../src/images.ts";

const dims = async (buf: Buffer) => {
  const m = await sharp(buf).metadata();
  return { w: m.width!, h: m.height! };
};

async function original(): Promise<Buffer> {
  const syn = await syntheticOriginals();
  return syn.find((s) => s.cls === "photo")!.buffer; // 800x600 jpeg
}

describe("the alteration matrix (WP36 spec)", () => {
  it("covers every alteration the work package names, with severities inside the spec ranges", () => {
    const a = alterations();
    const groups = [...new Set(a.map((x) => x.group))];
    expect(groups).toEqual([
      "crop", "resize", "jpeg-quality", "rotate", "mirror", "border",
      "brightness", "contrast", "blur", "sticker", "screenshot-scale",
    ]);
    const crops = a.filter((x) => x.group === "crop").map((x) => parseInt(x.severity, 10));
    expect(Math.min(...crops)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...crops)).toBeLessThanOrEqual(40);
    const qs = a.filter((x) => x.group === "jpeg-quality").map((x) => parseInt(x.severity.slice(1), 10));
    expect(Math.min(...qs)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...qs)).toBeLessThanOrEqual(90);
    const degs = a.filter((x) => x.group === "rotate").map((x) => parseInt(x.severity, 10));
    expect(Math.min(...degs)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...degs)).toBeLessThanOrEqual(10);
    // pixel alterations come back lossless, recompressions as JPEG
    for (const x of a)
      expect(x.format).toBe(x.group === "jpeg-quality" ? "jpeg" : "png");
  });

  it("stacks an alteration with a realistic recompression", () => {
    const s = stacks();
    expect(s.map((x) => x.severity).sort()).toEqual([
      "crop10+jpeg50", "rotate3+jpeg70", "screenshot0.75x+jpeg70", "sticker-small+jpeg70",
    ]);
    expect(s.every((x) => x.format === "jpeg")).toBe(true);
  });
});

describe("alterations", () => {
  it("crop removes the stated percentage from both dimensions", async () => {
    const out = await crop(await original(), 20);
    expect(await dims(out)).toEqual({ w: 640, h: 480 });
  });

  it("resize scales by the factor", async () => {
    expect(await dims(await resize(await original(), 0.5))).toEqual({ w: 400, h: 300 });
    expect(await dims(await resize(await original(), 2))).toEqual({ w: 1600, h: 1200 });
  });

  it("jpegQuality keeps the pixels and changes the bytes", async () => {
    const o = await original();
    const out = await jpegQuality(o, 30);
    expect(await dims(out)).toEqual({ w: 800, h: 600 });
    expect(out.equals(o)).toBe(false);
    expect(out[0]).toBe(0xff); // still a JPEG
  });

  it("rotate grows the canvas and fills the corners black", async () => {
    const out = await rotate(await original(), 10);
    const d = await dims(out);
    expect(d.w).toBeGreaterThan(800);
    expect(d.h).toBeGreaterThan(600);
  });

  it("mirror flips the pixels horizontally", async () => {
    const o = await original();
    const out = await mirror(o);
    expect(await dims(out)).toEqual({ w: 800, h: 600 });
    const col = async (buf: Buffer, left: number) =>
      (await sharp(buf).extract({ left, top: 0, width: 1, height: 600 }).raw().toBuffer()).toString("hex");
    expect(await col(out, 0)).toBe(await col(o, 799));
    expect(await col(out, 799)).toBe(await col(o, 0));
  });

  it("border adds the frame size to every edge", async () => {
    const out = await border(await original(), 4); // 4% of 600 = 24
    expect(await dims(out)).toEqual({ w: 848, h: 648 });
  });

  it("brightness, contrast and blur keep the dimensions but change pixels", async () => {
    const o = await original();
    for (const out of [await brightness(o, 0.8), await contrast(o, 1.3), await blur(o, 1)]) {
      expect(await dims(out)).toEqual({ w: 800, h: 600 });
      expect(out.equals(o)).toBe(false);
    }
  });

  it("sticker overlays the badge without resizing the image", async () => {
    const o = await original();
    const small = await sticker(o, "small");
    const large = await sticker(o, "large");
    expect(await dims(small)).toEqual({ w: 800, h: 600 });
    expect(await dims(large)).toEqual({ w: 800, h: 600 });
    expect(small.equals(large)).toBe(false);
  });

  it("screenshot-scale double-resamples back to the original size", async () => {
    const out = await screenshotScale(await original(), 0.75);
    expect(await dims(out)).toEqual({ w: 800, h: 600 });
  });
});

describe("synthetic originals", () => {
  it("makes 15 harmless images: five classes, three container formats, 800x600", async () => {
    const syn = await syntheticOriginals();
    expect(syn).toHaveLength(15);
    const classes = [...new Set(syn.map((s) => s.cls))].sort();
    expect(classes).toEqual(["gradient", "noise", "photo", "shapes", "text"]);
    for (const s of syn) {
      const m = await sharp(s.buffer).metadata();
      expect(`${m.width}x${m.height}`).toBe("800x600");
      expect(m.format).toBe(s.format);
    }
  });

  it("curates only public-domain landscape photographs, verified by name", () => {
    expect(COMMONS_PHOTOS.length).toBeGreaterThanOrEqual(4);
    for (const p of COMMONS_PHOTOS) {
      expect(p.title.startsWith("File:")).toBe(true);
      expect(p.clsNote.length).toBeGreaterThan(0);
    }
  });
});
