/**
 * The E1 test-set transforms, each deterministic and documented, CPU only
 * (sharp). Pixel-only transforms (crop, resize, mirror, overlay, screenshot)
 * are re-encoded losslessly as PNG so each row measures its alteration alone,
 * exactly like tools/pdq-robustness does; the WhatsApp re-encode and the
 * face-swap composite are JPEG, because they model real re-encodes.
 */
import sharp from "sharp";

/** crop: keep a 90% x 90% window offset to (8%, 3%) — an off-centre reframe. */
export const CROP = { xFrac: 0.08, yFrac: 0.03, wFrac: 0.9, hFrac: 0.9 } as const;

/** resize: 0.6x bicubic downscale (the output stays at the smaller size). */
export const RESIZE = { scale: 0.6 } as const;

/** whatsapp: long edge 1600 (only ever downscaled), JPEG quality 70, 4:2:0. */
export const WHATSAPP = { longEdge: 1600, quality: 70 } as const;

/** screenshot: a device-style frame — top status bar and a light border. */
export const SCREENSHOT = { barFrac: 0.05, borderFrac: 0.02 } as const;

/** overlay: caption sticker over the bottom quarter plus a corner sticker. */
export const OVERLAY = { bandFrac: 0.22, stickerFrac: 0.18 } as const;

export async function crop(buffer: Buffer): Promise<Buffer> {
  const img = sharp(buffer, { failOn: "none", animated: false });
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("crop: unreadable image");
  const left = Math.round(w * CROP.xFrac);
  const top = Math.round(h * CROP.yFrac);
  const width = Math.max(1, Math.round(w * CROP.wFrac));
  const height = Math.max(1, Math.round(h * CROP.hFrac));
  return sharp(buffer, { failOn: "none", animated: false })
    .extract({ left, top, width: Math.min(width, w - left), height: Math.min(height, h - top) })
    .png()
    .toBuffer();
}

export async function resize(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("resize: unreadable image");
  const landscape = w >= h;
  const along = landscape ? "width" : "height";
  const value = Math.max(1, Math.round((landscape ? w : h) * RESIZE.scale));
  return sharp(buffer, { failOn: "none", animated: false })
    .resize({ [along]: value, kernel: "cubic" })
    .png()
    .toBuffer();
}

export async function mirror(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", animated: false }).flop().png().toBuffer();
}

export async function overlay(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("overlay: unreadable image");
  const bandH = Math.max(8, Math.round(h * OVERLAY.bandFrac));
  const sticker = Math.max(12, Math.round(Math.min(w, h) * OVERLAY.stickerFrac));
  // A caption sticker (semi-opaque card with pseudo-text rows) across the
  // bottom, and a round corner sticker, like stickers pasted in a chat app.
  const rows = Math.max(2, Math.floor(bandH / 22));
  let band = `<rect x="${Math.round(w * 0.04)}" y="${h - bandH - Math.round(h * 0.03)}" width="${Math.round(w * 0.92)}" height="${bandH}" rx="${Math.round(bandH * 0.12)}" fill="white" fill-opacity="0.82"/>`;
  for (let i = 0; i < rows; i++) {
    band += `<rect x="${Math.round(w * 0.08)}" y="${h - bandH - Math.round(h * 0.03) + Math.round(bandH * (0.18 + 0.62 * (i / Math.max(1, rows - 1))))}" width="${Math.round(w * (i % 2 === 0 ? 0.7 : 0.45))}" height="${Math.max(2, Math.round(bandH * 0.09))}" fill="rgb(50,50,60)" fill-opacity="0.8"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${band}
    <circle cx="${Math.round(w * 0.88)}" cy="${Math.round(h * 0.1)}" r="${Math.round(sticker / 2)}" fill="rgb(235,64,90)" fill-opacity="0.9"/></svg>`;
  return sharp(buffer, { failOn: "none", animated: false })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function screenshot(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("screenshot: unreadable image");
  const bar = Math.max(6, Math.round(h * SCREENSHOT.barFrac));
  const border = Math.max(2, Math.round(Math.min(w, h) * SCREENSHOT.borderFrac));
  const canvasW = w + 2 * border;
  const canvasH = h + 2 * border + bar;
  // Status-bar chrome (time, battery) on top, device-grey surround: the way a
  // shared screenshot looks, complete with borders.
  const barSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${bar}">
    <rect width="${canvasW}" height="${bar}" fill="rgb(28,28,34)"/>
    <rect x="${Math.round(canvasW * 0.05)}" y="${Math.round(bar * 0.32)}" width="${Math.round(canvasW * 0.08)}" height="${Math.round(bar * 0.36)}" rx="2" fill="rgb(230,230,235)"/>
    <rect x="${Math.round(canvasW * 0.82)}" y="${Math.round(bar * 0.34)}" width="${Math.round(canvasW * 0.08)}" height="${Math.round(bar * 0.32)}" rx="2" fill="rgb(120,200,120)"/>
  </svg>`;
  const base = sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: { r: 238, g: 238, b: 242 } },
  })
    .composite([
      { input: Buffer.from(barSvg), top: 0, left: 0 },
      { input: buffer, top: bar + border, left: border },
    ])
    .png();
  return base.toBuffer();
}

/**
 * WhatsApp-style re-encode: long edge capped at 1600 px (smaller images are
 * never upscaled) and JPEG quality about 70 — the compression a shared image
 * actually goes through on the platform.
 */
export async function whatsapp(buffer: Buffer): Promise<Buffer> {
  const img = sharp(buffer, { failOn: "none", animated: false });
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("whatsapp: unreadable image");
  const long = Math.max(w, h);
  const resized = long > WHATSAPP.longEdge
    ? img.resize({ width: w >= h ? WHATSAPP.longEdge : undefined, height: h > w ? WHATSAPP.longEdge : undefined, kernel: "lanczos3" })
    : img;
  return resized
    .jpeg({ quality: WHATSAPP.quality, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

/** A helper for the face-swap path: JPEG quality 92, near-lossless transport. */
export async function jpegNearLossless(buffer: Buffer, quality = 92): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", animated: false }).rotate().jpeg({ quality }).toBuffer();
}
