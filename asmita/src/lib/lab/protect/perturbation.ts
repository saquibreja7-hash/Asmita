/**
 * The photo-protection layer (docs/lab/beta-spec.md WP91): a bounded,
 * seeded perturbation added to a photo's pixels, meant to make AI morphing
 * of that photo harder to do well.
 *
 * The spec's first choice is PGD-style noise against a face-embedding or
 * SSCD model behind onnxruntime-node. No model is available where this tool
 * runs: onnxruntime-node is native code the Worker cannot load, and the
 * SSCD weights are never in the repository (the crawler downloads them at
 * image build time), so there is nothing a browser page could be given
 * either. The WP's fallback ladder therefore applies — a documented simpler
 * perturbation, run in the browser (Canvas) so the page keeps working
 * within the Worker's limits. The choice is recorded in
 * docs/lab/beta-progress.md.
 *
 * The perturbation: independent, uniformly distributed noise per colour
 * channel of every pixel, each change at most PROTECT_MAX_DELTA (= epsilon
 * x 255 = 8) in 8-bit units — the WP's epsilon <= 8/255 bound, invisible to
 * a person at normal viewing. The alpha channel is never touched. The same
 * seed always produces the same noise, so the layer is reproducible and
 * testable; the page draws a fresh seed per run.
 *
 * This module is pure TypeScript with no DOM and no imports, so the unit
 * tests exercise the exact code the page runs.
 */

/** The WP's perturbation budget, in normalised units: epsilon <= 8/255. */
export const PROTECT_EPSILON = 8 / 255;
/** The same budget in 8-bit channel units: PROTECT_EPSILON * 255 = 8. */
export const PROTECT_MAX_DELTA = 8;

/** How many integer deltas one channel may draw from: -8..+8 inclusive. */
const DELTA_SPAN = 2 * PROTECT_MAX_DELTA + 1;

/**
 * A deterministic PRNG (the same one tools/lab-bench/src/synthetic.ts uses,
 * kept as a copy because lab-bench is an offline package outside the app's
 * build). Takes a uint32 seed, returns floats in [0, 1).
 */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh per-run seed: crypto random when available, Math.random if not. */
export function makeProtectSeed(): number {
  const c = globalThis.crypto as { getRandomValues?: (a: Uint32Array) => Uint32Array } | undefined;
  if (c && typeof c.getRandomValues === "function") {
    const drawn = new Uint32Array(1);
    c.getRandomValues(drawn);
    return drawn[0] >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/**
 * Add the protective noise to RGBA pixel data in place (the shape of
 * CanvasImageData.data: every pixel four bytes, RGB then alpha) and return
 * the same array. Each colour channel of each pixel moves by an integer in
 * [-PROTECT_MAX_DELTA, +PROTECT_MAX_DELTA], clamped to [0, 255] by the
 * typed array itself; alpha is left untouched. The same seed always
 * produces the same result.
 *
 * Throws a TypeError on data that is not non-empty RGBA or a seed that is
 * not a uint32 — the page catches nothing and lets its generic error state
 * show, so a bug can never silently "protect" nothing.
 */
export function protectPixels(pixels: Uint8ClampedArray, seed: number): Uint8ClampedArray {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length === 0 || pixels.length % 4 !== 0) {
    throw new TypeError("protectPixels: non-empty RGBA pixel data required");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError("protectPixels: uint32 seed required");
  }
  const rand = prng(seed);
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const delta = Math.floor(rand() * DELTA_SPAN) - PROTECT_MAX_DELTA;
      // Uint8ClampedArray clamps to [0, 255] on assignment, so a pixel at
      // 0 or 255 can only ever move less than epsilon, never out of range.
      pixels[i + c] = pixels[i + c] + delta;
    }
  }
  return pixels;
}
