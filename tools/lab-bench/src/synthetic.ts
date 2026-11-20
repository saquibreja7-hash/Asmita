/**
 * Tiny synthetic images for the test suite: solid shapes and gradients only,
 * small enough to hash in milliseconds. Nothing here depicts a person; the
 * face-geometry paths are exercised through a fake locator with invented
 * boxes, so no real photo is ever needed (charter: test images are
 * synthetic, the Lab never generates sexual content).
 */
import sharp from "sharp";

export const W = 96;
export const H = 64;

/** A horizontal two-colour gradient — the workhorse of the suite. */
export async function gradient(w = W, h = H, left: [number, number, number] = [220, 60, 40], right: [number, number, number] = [40, 60, 220]): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgb(${left.join(",")})"/>
      <stop offset="1" stop-color="rgb(${right.join(",")})"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Solid background with one off-centre solid circle. */
export async function shape(w = W, h = H, seed = 1): Promise<Buffer> {
  const r = rng(seed);
  const cx = Math.round(w * (0.25 + 0.5 * r()));
  const cy = Math.round(h * (0.25 + 0.5 * r()));
  const rad = Math.max(4, Math.round(Math.min(w, h) * 0.18));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="rgb(240,240,235)"/>
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="rgb(180,30,120)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Vertical stripes — a mirror changes it, a crop changes it, PDQ sees it. */
export async function stripes(w = W, h = H, mod = 7): Promise<Buffer> {
  let body = "";
  for (let x = 0; x < w; x++) {
    if (x % mod === 0) body += `<rect x="${x}" y="0" width="1" height="${h}" fill="rgb(30,30,140)"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="rgb(235,235,230)"/>${body}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A deterministic PRNG, so every fixture is reproducible. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
