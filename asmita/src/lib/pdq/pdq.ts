/**
 * PDQ perceptual image hashing (Meta ThreatExchange algorithm), TypeScript port.
 *
 * Runs entirely in the browser. Input is raw RGBA pixel data (e.g. from a
 * canvas ImageData); output is a 256-bit hash as 64 hex chars plus a quality
 * score. No image bytes ever leave this module — callers must release their
 * buffers after hashing.
 *
 * ROLLOUT GATE: this port has not yet been validated bit-exact against Meta's
 * reference PDQ test vectors. Until that validation passes (hamming distance
 * <= 2 across the reference corpus), ENABLE_HASH_UPLOAD must remain false in
 * production. Every submission records PDQ_CLIENT_VERSION so hashes from
 * pre-validation builds can be audited retroactively.
 *
 * Algorithm reference: github.com/facebook/ThreatExchange (pdq/cpp).
 */

export const PDQ_CLIENT_VERSION = "pdq-ts-0.1.0";

const OUT_DIM = 64; // intermediate downsample
const DCT_DIM = 16; // 16x16 DCT block -> 256 bits
export const PDQ_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Recommended PDQ match threshold (hamming distance) per Meta guidance. */
export const PDQ_MATCH_THRESHOLD = 31;

export type PdqInput = {
  data: Uint8ClampedArray | Uint8Array; // RGBA, 4 bytes per pixel
  width: number;
  height: number;
};

export type PdqResult = {
  hash: string; // 64 lowercase hex chars (256 bits)
  quality: number; // 0..100, low values mean flat/blurred input
};

function toLuminance(input: PdqInput): Float32Array {
  const { data, width, height } = input;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    // Rec.601, as used by the PDQ reference implementation.
    luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return luma;
}

// Reference: computeJaroszFilterWindowSize.
function jaroszWindowSize(oldDim: number, newDim: number): number {
  return Math.floor((oldDim + 2 * newDim - 1) / (2 * newDim));
}

// One-dimensional box filter with clamped edges, applied in place per row.
function boxFilterRows(buffer: Float32Array, width: number, height: number, window: number) {
  if (window <= 1) return;
  const half = Math.floor(window / 2);
  const row = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x < Math.min(half + 1, width); x++) {
      sum += buffer[base + x];
      count++;
    }
    for (let x = 0; x < width; x++) {
      row[x] = sum / count;
      const addIdx = x + half + 1;
      if (addIdx < width) {
        sum += buffer[base + addIdx];
        count++;
      }
      const dropIdx = x - half;
      if (dropIdx >= 0) {
        sum -= buffer[base + dropIdx];
        count--;
      }
    }
    buffer.set(row, base);
  }
}

function boxFilterCols(buffer: Float32Array, width: number, height: number, window: number) {
  if (window <= 1) return;
  const half = Math.floor(window / 2);
  const col = new Float32Array(height);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < Math.min(half + 1, height); y++) {
      sum += buffer[y * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      col[y] = sum / count;
      const addIdx = y + half + 1;
      if (addIdx < height) {
        sum += buffer[addIdx * width + x];
        count++;
      }
      const dropIdx = y - half;
      if (dropIdx >= 0) {
        sum -= buffer[dropIdx * width + x];
        count--;
      }
    }
    for (let y = 0; y < height; y++) {
      buffer[y * width + x] = col[y];
    }
  }
}

// Two-pass Jarosz filter (box filter applied twice approximates a tent
// filter), then decimation to OUT_DIM x OUT_DIM.
function downsample(luma: Float32Array, width: number, height: number): Float32Array {
  const windowX = jaroszWindowSize(width, OUT_DIM);
  const windowY = jaroszWindowSize(height, OUT_DIM);
  for (let pass = 0; pass < 2; pass++) {
    boxFilterRows(luma, width, height, windowX);
    boxFilterCols(luma, width, height, windowY);
  }
  const out = new Float32Array(OUT_DIM * OUT_DIM);
  for (let i = 0; i < OUT_DIM; i++) {
    const srcY = Math.floor(((i + 0.5) * height) / OUT_DIM);
    for (let j = 0; j < OUT_DIM; j++) {
      const srcX = Math.floor(((j + 0.5) * width) / OUT_DIM);
      out[i * OUT_DIM + j] = luma[srcY * width + srcX];
    }
  }
  return out;
}

let dctMatrix: Float32Array | null = null;

// 16x64 DCT-II basis skipping the DC term, per the PDQ reference
// (dct64To16): d[k][n] = sqrt(2/64) * cos(pi/(2*64) * (k+1) * (2n+1)).
function getDctMatrix(): Float32Array {
  if (!dctMatrix) {
    dctMatrix = new Float32Array(DCT_DIM * OUT_DIM);
    const scale = Math.sqrt(2 / OUT_DIM);
    for (let k = 0; k < DCT_DIM; k++) {
      for (let n = 0; n < OUT_DIM; n++) {
        dctMatrix[k * OUT_DIM + n] =
          scale * Math.cos((Math.PI / (2 * OUT_DIM)) * (k + 1) * (2 * n + 1));
      }
    }
  }
  return dctMatrix;
}

// B = D * A * D^T where A is 64x64 and D is 16x64 -> B is 16x16.
function dct64To16(block: Float32Array): Float32Array {
  const d = getDctMatrix();
  const intermediate = new Float32Array(DCT_DIM * OUT_DIM); // D * A
  for (let k = 0; k < DCT_DIM; k++) {
    for (let j = 0; j < OUT_DIM; j++) {
      let sum = 0;
      for (let n = 0; n < OUT_DIM; n++) {
        sum += d[k * OUT_DIM + n] * block[n * OUT_DIM + j];
      }
      intermediate[k * OUT_DIM + j] = sum;
    }
  }
  const out = new Float32Array(DCT_DIM * DCT_DIM);
  for (let k = 0; k < DCT_DIM; k++) {
    for (let l = 0; l < DCT_DIM; l++) {
      let sum = 0;
      for (let n = 0; n < OUT_DIM; n++) {
        sum += intermediate[k * OUT_DIM + n] * d[l * OUT_DIM + n];
      }
      out[k * DCT_DIM + l] = sum;
    }
  }
  return out;
}

// Gradient-based quality on the 64x64 buffer: flat or heavily blurred images
// produce weak hashes. Approximation of the reference metric; calibrated so a
// constant image scores 0 and a busy natural image scores near 100.
function computeQuality(block: Float32Array): number {
  let gradientSum = 0;
  for (let i = 0; i < OUT_DIM; i++) {
    for (let j = 0; j < OUT_DIM - 1; j++) {
      gradientSum += Math.abs(block[i * OUT_DIM + j] - block[i * OUT_DIM + j + 1]);
    }
  }
  for (let j = 0; j < OUT_DIM; j++) {
    for (let i = 0; i < OUT_DIM - 1; i++) {
      gradientSum += Math.abs(block[i * OUT_DIM + j] - block[(i + 1) * OUT_DIM + j]);
    }
  }
  const normalized = gradientSum / (2 * OUT_DIM * (OUT_DIM - 1));
  return Math.max(0, Math.min(100, Math.round(normalized * 20)));
}

function median(values: Float32Array): number {
  const sorted = Float32Array.from(values).sort();
  const mid = sorted.length / 2;
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computePdqHash(input: PdqInput): PdqResult {
  if (
    !input ||
    input.width < 2 ||
    input.height < 2 ||
    input.data.length !== input.width * input.height * 4
  ) {
    throw new Error("pdq_invalid_input");
  }
  const luma = toLuminance(input);
  const block = downsample(luma, input.width, input.height);
  const quality = computeQuality(block);
  const dct = dct64To16(block);
  const threshold = median(dct);

  const bytes = new Uint8Array(32);
  for (let bit = 0; bit < DCT_DIM * DCT_DIM; bit++) {
    if (dct[bit] > threshold) {
      bytes[bit >> 3] |= 0x80 >> (bit & 7);
    }
  }
  let hash = "";
  for (let i = 0; i < bytes.length; i++) {
    hash += bytes[i].toString(16).padStart(2, "0");
  }
  return { hash, quality };
}

const POPCOUNT_TABLE = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = (i & 1) + table[i >> 1];
  }
  return table;
})();

export function hammingDistance(hexA: string, hexB: string): number {
  const a = hexA.toLowerCase();
  const b = hexB.toLowerCase();
  if (!PDQ_HASH_PATTERN.test(a) || !PDQ_HASH_PATTERN.test(b)) {
    throw new Error("pdq_invalid_hash");
  }
  let distance = 0;
  for (let i = 0; i < 64; i += 2) {
    const byteA = parseInt(a.slice(i, i + 2), 16);
    const byteB = parseInt(b.slice(i, i + 2), 16);
    distance += POPCOUNT_TABLE[byteA ^ byteB];
  }
  return distance;
}
