/**
 * The altered copies the harness measures: everything a site (or a person
 * re-uploading) plausibly does to an image. Each function takes the ORIGINAL
 * file's bytes and returns encoded bytes of the copy.
 *
 * Convention, documented in REPORT.md: pixel alterations are encoded losslessly
 * (PNG) so a row measures its alteration alone; the recompression rows (jpeg)
 * are the only JPEG output, and the "stacked" rows combine an alteration with
 * a realistic re-upload recompression.
 */
import sharp from "sharp";

export type Alteration = {
  /** Row group, e.g. "crop". */
  group: string;
  /** Human-readable severity, e.g. "20%". */
  severity: string;
  /** Lossy output format of the copy. */
  format: "png" | "jpeg";
  apply: (original: Buffer) => Promise<Buffer>;
};

const dec = (buf: Buffer) => sharp(buf, { failOn: "none", animated: false });

/** Centre crop: remove pct% of WIDTH and of HEIGHT, split evenly on the sides. */
export async function crop(buf: Buffer, pct: number): Promise<Buffer> {
  const m = await dec(buf).metadata();
  const w = m.autoOrient?.width ?? m.width!, h = m.autoOrient?.height ?? m.height!;
  const cw = Math.round(w * (1 - pct / 100)), ch = Math.round(h * (1 - pct / 100));
  return dec(buf).extract({ left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch }).png().toBuffer();
}

/** Uniform scale, aspect preserved, lanczos3 (a "normal" re-size, not a screenshot resample). */
export async function resize(buf: Buffer, k: number): Promise<Buffer> {
  const m = await dec(buf).metadata();
  const w = m.autoOrient?.width ?? m.width!, h = m.autoOrient?.height ?? m.height!;
  return dec(buf).resize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), { kernel: "lanczos3" }).png().toBuffer();
}

/** Pure recompression of the original pixels at a JPEG quality. */
export async function jpegQuality(buf: Buffer, q: number): Promise<Buffer> {
  return dec(buf).jpeg({ quality: q }).toBuffer();
}

/** Rotate by a small angle; the exposed corners are filled black. */
export async function rotate(buf: Buffer, deg: number): Promise<Buffer> {
  return dec(buf).rotate(deg, { background: "#000000" }).png().toBuffer();
}

/** Horizontal mirror (flip). PDQ as we ship it has no dihedral variants. */
export async function mirror(buf: Buffer): Promise<Buffer> {
  return dec(buf).flop().png().toBuffer();
}

/** Black frame around the image, pct% of the smaller side added on every edge. */
export async function border(buf: Buffer, pct: number): Promise<Buffer> {
  const m = await dec(buf).metadata();
  const w = m.autoOrient?.width ?? m.width!, h = m.autoOrient?.height ?? m.height!;
  const b = Math.max(1, Math.round((Math.min(w, h) * pct) / 100));
  return dec(buf).extend({ top: b, bottom: b, left: b, right: b, background: "#000000" }).png().toBuffer();
}

/** Brightness factor around 1.0. */
export async function brightness(buf: Buffer, f: number): Promise<Buffer> {
  return dec(buf).modulate({ brightness: f }).png().toBuffer();
}

/** Contrast factor around 1.0, pivoting on mid-grey. */
export async function contrast(buf: Buffer, f: number): Promise<Buffer> {
  return dec(buf).linear(f, -(128 * f) + 128).png().toBuffer();
}

/** Gaussian blur, sigma pixels. */
export async function blur(buf: Buffer, sigma: number): Promise<Buffer> {
  return dec(buf).blur(sigma).png().toBuffer();
}

/**
 * Blocky "text sticker" (banner plus glyph rectangles, no font dependency)
 * composited over the image: small sits bottom-left, large sits centred.
 */
export async function sticker(buf: Buffer, size: "small" | "large"): Promise<Buffer> {
  const m = await dec(buf).metadata();
  const w = m.autoOrient?.width ?? m.width!, h = m.autoOrient?.height ?? m.height!;
  const sw = Math.round(w * (size === "small" ? 0.12 : 0.3));
  const sh = Math.round(sw * 0.45);
  const r = 6;
  let glyphs = "";
  let y = sh * 0.25;
  for (let row = 0; row < 3 && y < sh * 0.8; row++, y += sh * 0.26) {
    let x = sw * 0.07;
    while (x < sw * 0.92) {
      const gw = sw * 0.05;
      glyphs += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${gw.toFixed(1)}" height="${(sh * 0.14).toFixed(1)}" fill="#ffffff" fill-opacity="0.9"/>`;
      x += gw * 1.7;
    }
  }
  const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">` +
    `<rect width="${sw}" height="${sh}" rx="${r}" fill="#c0182b"/>${glyphs}</svg>`;
  const left = size === "small" ? Math.round(w * 0.03) : Math.round((w - sw) / 2);
  const top = size === "small" ? h - sh - Math.round(h * 0.03) : Math.round((h - sh) / 2);
  return dec(buf).composite([{ input: Buffer.from(badge), left, top }]).png().toBuffer();
}

/**
 * Screenshot-style double resample: the page shrank (or grew) the image with
 * a smooth filter and the screenshot scaled it back — two bicubic passes.
 */
export async function screenshotScale(buf: Buffer, k: number): Promise<Buffer> {
  const m = await dec(buf).metadata();
  const w = m.autoOrient?.width ?? m.width!, h = m.autoOrient?.height ?? m.height!;
  const mid = await dec(buf).resize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), { kernel: "cubic" }).png().toBuffer();
  return dec(mid).resize(w, h, { kernel: "cubic" }).png().toBuffer();
}

/** The full alteration matrix: group, severity, output format, applier. */
export function alterations(): Alteration[] {
  const a: Alteration[] = [];
  const push = (group: string, severity: string, format: Alteration["format"], apply: Alteration["apply"]) =>
    a.push({ group, severity, format, apply });
  for (const pct of [5, 10, 20, 40]) push("crop", `${pct}%`, "png", (b) => crop(b, pct));
  for (const k of [0.16, 0.5, 0.75, 1.5, 2]) push("resize", `${k}x`, "png", (b) => resize(b, k));
  for (const q of [30, 50, 70, 90]) push("jpeg-quality", `q${q}`, "jpeg", (b) => jpegQuality(b, q));
  for (const deg of [1, 3, 5, 10]) push("rotate", `${deg}deg`, "png", (b) => rotate(b, deg));
  push("mirror", "flip", "png", (b) => mirror(b));
  for (const pct of [4, 12]) push("border", `${pct}%`, "png", (b) => border(b, pct));
  for (const f of [0.8, 1.2]) push("brightness", `${f}`, "png", (b) => brightness(b, f));
  for (const f of [0.7, 1.3]) push("contrast", `${f}`, "png", (b) => contrast(b, f));
  for (const s of [1, 3]) push("blur", `sigma${s}`, "png", (b) => blur(b, s));
  for (const s of ["small", "large"] as const) push("sticker", s, "png", (b) => sticker(b, s));
  for (const k of [0.75, 1.5]) push("screenshot-scale", `${k}x`, "png", (b) => screenshotScale(b, k));
  return a;
}

/** Realistic stacks: an alteration plus the re-upload recompression that follows it. */
export function stacks(): Alteration[] {
  const a: Alteration[] = [];
  const push = (group: string, severity: string, apply: Alteration["apply"]) =>
    a.push({ group, severity, format: "jpeg", apply });
  push("stacked", "crop10+jpeg50", async (b) => jpegQuality(await crop(b, 10), 50));
  push("stacked", "rotate3+jpeg70", async (b) => jpegQuality(await rotate(b, 3), 70));
  push("stacked", "screenshot0.75x+jpeg70", async (b) => jpegQuality(await screenshotScale(b, 0.75), 70));
  push("stacked", "sticker-small+jpeg70", async (b) => jpegQuality(await sticker(b, "small"), 70));
  return a;
}
