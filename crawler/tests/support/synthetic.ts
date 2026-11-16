/**
 * Deterministic, ordinary synthetic test images (geometric patterns and
 * noise). Nothing here resembles a person; no real image is ever used.
 */
import sharp from "sharp";

/** A tiny deterministic PRNG so every run produces identical pixels. */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/** Raw RGB pixels: smooth blobs and stripes driven by the seed. */
export function patternPixels(seed: number, width: number, height: number): Buffer {
  const rnd = prng(seed);
  const blobs = Array.from({ length: 6 }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: (0.15 + rnd() * 0.35) * Math.max(width, height),
    c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  const fx = 2 + rnd() * 10;
  const fy = 2 + rnd() * 10;
  // Coarse block texture so PDQ's quality score is comfortably above 50.
  const block = Math.max(4, Math.round(Math.min(width, height) / 24));
  const cols = Math.ceil(width / block);
  const texture = Array.from({ length: cols * Math.ceil(height / block) }, () => (rnd() - 0.5) * 140);
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 128 + 60 * Math.sin((x / width) * fx * Math.PI);
      let g = 128 + 60 * Math.cos((y / height) * fy * Math.PI);
      let b = 128 + 60 * Math.sin(((x + y) / (width + height)) * (fx + fy) * Math.PI);
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y);
        if (d < blob.r) {
          const k = 1 - d / blob.r;
          r = r * (1 - k) + blob.c[0]! * k;
          g = g * (1 - k) + blob.c[1]! * k;
          b = b * (1 - k) + blob.c[2]! * k;
        }
      }
      const t = texture[Math.floor(y / block) * cols + Math.floor(x / block)]!;
      r += t;
      g += t;
      b += t;
      const i = (y * width + x) * 3;
      out[i] =Math.max(0, Math.min(255, Math.round(r)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return out;
}

/** RGBA version of patternPixels, for feeding computePdqHash directly. */
export function patternRgba(seed: number, width: number, height: number): Uint8ClampedArray {
  const rgb = patternPixels(seed, width, height);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i]!;
    out[j + 1] = rgb[i + 1]!;
    out[j + 2] = rgb[i + 2]!;
    out[j + 3] = 255;
  }
  return out;
}

export type EncodeFormat = "png" | "jpeg" | "webp" | "gif";

export async function patternImage(
  seed: number,
  width: number,
  height: number,
  format: EncodeFormat = "png",
): Promise<Buffer> {
  const img = sharp(patternPixels(seed, width, height), { raw: { width, height, channels: 3 } });
  switch (format) {
    case "png":
      return img.png().toBuffer();
    case "jpeg":
      return img.jpeg({ quality: 92 }).toBuffer();
    case "webp":
      return img.webp({ lossless: true }).toBuffer();
    case "gif":
      return img.gif().toBuffer();
  }
}

/**
 * A PNG whose header claims enormous dimensions (a "pixel bomb"). The pixel
 * data is a real small image; only the IHDR width/height are rewritten and
 * the chunk CRC recomputed, so a decoder that trusts the header would try to
 * allocate gigabytes.
 */
export async function pixelBombPng(width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(await patternImage(1, 16, 16, "png"));
  // Signature (8) + length (4) + "IHDR" (4) -> width at 16, height at 20.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  const crc = crc32(png.subarray(12, 29));
  png.writeUInt32BE(crc, 29);
  return png;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A random 64-hex fingerprint generated in code (never a real one). */
export function randomFingerprint(seed: number): string {
  const rnd = prng(seed);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += Math.floor(rnd() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return hex;
}

/** Flip `bits` distinct bits of a hex fingerprint (deterministically). */
export function flipBits(hex: string, bits: number, seed = 7): string {
  const bytes = Buffer.from(hex, "hex");
  const rnd = prng(seed);
  const chosen = new Set<number>();
  while (chosen.size < bits) chosen.add(Math.floor(rnd() * 256));
  for (const bit of chosen) bytes[bit >> 3]! ^= 1 << (bit & 7);
  return bytes.toString("hex");
}
