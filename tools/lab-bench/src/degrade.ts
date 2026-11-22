/**
 * The WP113 evaluation degradations (research-tools spec, Track B): the
 * quality and resolution collapses Pirogov & Artemev (arXiv 2507.21905) show
 * break deepfake detectors — JPEG 95/75/50/30/10, max side 128 — plus the
 * E1 WhatsApp-style re-encode at long side 1600 and 1280, plus Gaussian blur
 * at sigma 1 and 2 (GenD's own rebuttal protocol blurs the same way).
 *
 * Every transform is deterministic and CPU only (sharp). Following the E1
 * harness's rule, the resolution and blur conditions re-encode losslessly
 * (PNG) so each row measures its alteration alone; the JPEG and WhatsApp
 * conditions are JPEG because they model real re-encodes. Detection and
 * alignment happen after the degradation, exactly as the lab-gend service
 * does: it receives these bytes.
 */
import sharp from "sharp";

/** JPEG re-encode at an explicit quality, 4:2:0 like a chat app. */
export async function jpegQuality(buffer: Buffer, quality: number): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", animated: false })
    .jpeg({ quality, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

/** The E1 WhatsApp re-encode with a configurable long-edge cap (q~70). */
export async function whatsappReencode(buffer: Buffer, longEdge: number): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("degrade: unreadable image");
  let img = sharp(buffer, { failOn: "none", animated: false });
  const long = Math.max(w, h);
  if (long > longEdge) {
    img = img.resize({ width: w >= h ? longEdge : undefined, height: h > w ? longEdge : undefined, kernel: "lanczos3" });
  }
  return img.jpeg({ quality: 70, chromaSubsampling: "4:2:0" }).toBuffer();
}

/** Downscale so the longest side is `side` px (never upscaled), PNG out. */
export async function maxSide(buffer: Buffer, side: number): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("degrade: unreadable image");
  let img = sharp(buffer, { failOn: "none", animated: false });
  if (Math.max(w, h) > side) {
    img = img.resize({ width: w >= h ? side : undefined, height: h > w ? side : undefined, kernel: "lanczos3" });
  }
  return img.png().toBuffer();
}

/** Gaussian blur with the given sigma (a mild privacy-style blur), PNG out. */
export async function gaussianBlur(buffer: Buffer, sigma: number): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", animated: false }).blur(sigma).png().toBuffer();
}

export type GendCondition = {
  id: string;
  label: string;
  apply: (buffer: Buffer) => Promise<Buffer>;
};

/** The clean condition: the item exactly as the set stored it. */
const clean: GendCondition = { id: "clean", label: "as stored (no degradation)", apply: async (b) => b };

/**
 * The full WP113 condition list, in report order: clean, the Pirogov JPEG
 * ladder, the two WhatsApp-style re-encodes, the 128 px collapse, the two
 * blur levels.
 */
export const GEND_EVAL_CONDITIONS: GendCondition[] = [
  clean,
  ...[95, 75, 50, 30, 10].map((q): GendCondition => ({
    id: `jpeg-${q}`,
    label: `JPEG quality ${q}`,
    apply: (b) => jpegQuality(b, q),
  })),
  { id: "whatsapp-1600", label: "WhatsApp-style re-encode, long side 1600 (E1)", apply: (b) => whatsappReencode(b, 1600) },
  { id: "whatsapp-1280", label: "WhatsApp-style re-encode, long side 1280", apply: (b) => whatsappReencode(b, 1280) },
  { id: "maxside-128", label: "downscaled to max side 128", apply: (b) => maxSide(b, 128) },
  { id: "blur-1", label: "Gaussian blur, sigma 1", apply: (b) => gaussianBlur(b, 1) },
  { id: "blur-2", label: "Gaussian blur, sigma 2", apply: (b) => gaussianBlur(b, 2) },
];
