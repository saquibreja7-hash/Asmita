/**
 * PDQ perceptual image hashing (Meta ThreatExchange algorithm), TypeScript port.
 *
 * Runs entirely in the browser. Input is raw RGBA pixel data (e.g. from a
 * canvas ImageData); output is a 256-bit hash as 64 hex chars plus a quality
 * score. No image bytes ever leave this module — callers must release their
 * buffers after hashing.
 *
 * This is a line-faithful port of the reference C++ implementation:
 *   github.com/facebook/ThreatExchange (pdq/cpp/hashing/pdqhashing.cpp,
 *   pdq/cpp/downscaling/downscaling.cpp, pdq/cpp/hashing/torben.cpp).
 * It is validated against the reference regression vectors in
 * tests/unit/pdq-reference-vectors.test.ts. Residual per-image differences of
 * a few bits can arise from JPEG decoder variance (libjpeg vs the JS decoder),
 * which is far inside PDQ's match threshold of 31.
 */

export const PDQ_CLIENT_VERSION = "pdq-ts-0.2.0";

const OUT_DIM = 64; // intermediate downsample
const DCT_DIM = 16; // 16x16 DCT block -> 256 bits
const MIN_HASHABLE_DIM = 5;
const PDQ_NUM_JAROSZ_XY_PASSES = 2;

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

const fround = Math.fround;

// Reference: pdqio.cpp — images larger than 512 on either side are first
// resized to exactly 512x512 (aspect ratio intentionally not preserved,
// nearest-neighbor, matching CImg::resize's default interpolation) because
// the two-pass Jarosz filter is prohibitively expensive on large images.
const DOWNSAMPLE_DIMS = 512;

function nearestResizeRgba(input: PdqInput, newWidth: number, newHeight: number): PdqInput {
  const { data, width, height } = input;
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; y++) {
    const srcY = Math.trunc((y * height) / newHeight);
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.trunc((x * width) / newWidth);
      const src = (srcY * width + srcX) * 4;
      const dst = (y * newWidth + x) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return { data: out, width: newWidth, height: newHeight };
}

// Reference: fillFloatLumaFromRGB. Rec.601 luma coefficients, float32 math.
function toLuminance(input: PdqInput): Float32Array {
  const { data, width, height } = input;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = fround(
      fround(0.299 * data[p]) + fround(0.587 * data[p + 1]) + fround(0.114 * data[p + 2]),
    );
  }
  return luma;
}

// Reference: computeJaroszFilterWindowSize.
function jaroszWindowSize(oldDimension: number, newDimension: number): number {
  return Math.floor((oldDimension + 2 * newDimension - 1) / (2 * newDimension));
}

// Reference: box1DFloat — exact four-phase sliding box filter.
function box1DFloat(
  invec: Float32Array,
  inBase: number,
  outvec: Float32Array,
  outBase: number,
  vectorLength: number,
  stride: number,
  fullWindowSize: number,
) {
  const halfWindowSize = Math.floor((fullWindowSize + 2) / 2); // 7->4, 8->5

  const phase1Nreps = halfWindowSize - 1;
  const phase2Nreps = fullWindowSize - halfWindowSize + 1;
  const phase3Nreps = vectorLength - fullWindowSize;
  const phase4Nreps = halfWindowSize - 1;

  let li = 0; // left edge of read window, for subtracts
  let ri = 0; // right edge of read window, for adds
  let oi = 0; // output index

  let sum = 0;
  let currentWindowSize = 0;

  // PHASE 1: ACCUMULATE FIRST SUM NO WRITES
  for (let i = 0; i < phase1Nreps; i++) {
    sum = fround(sum + invec[inBase + ri]);
    currentWindowSize++;
    ri += stride;
  }

  // PHASE 2: INITIAL WRITES WITH SMALL WINDOW
  for (let i = 0; i < phase2Nreps; i++) {
    sum = fround(sum + invec[inBase + ri]);
    currentWindowSize++;
    outvec[outBase + oi] = fround(sum / currentWindowSize);
    ri += stride;
    oi += stride;
  }

  // PHASE 3: WRITES WITH FULL WINDOW
  for (let i = 0; i < phase3Nreps; i++) {
    sum = fround(sum + invec[inBase + ri]);
    sum = fround(sum - invec[inBase + li]);
    outvec[outBase + oi] = fround(sum / currentWindowSize);
    li += stride;
    ri += stride;
    oi += stride;
  }

  // PHASE 4: FINAL WRITES WITH SMALL WINDOW
  for (let i = 0; i < phase4Nreps; i++) {
    sum = fround(sum - invec[inBase + li]);
    currentWindowSize--;
    outvec[outBase + oi] = fround(sum / currentWindowSize);
    li += stride;
    oi += stride;
  }
}

function boxAlongRowsFloat(
  inBuf: Float32Array,
  outBuf: Float32Array,
  numRows: number,
  numCols: number,
  windowSize: number,
) {
  for (let i = 0; i < numRows; i++) {
    box1DFloat(inBuf, i * numCols, outBuf, i * numCols, numCols, 1, windowSize);
  }
}

function boxAlongColsFloat(
  inBuf: Float32Array,
  outBuf: Float32Array,
  numRows: number,
  numCols: number,
  windowSize: number,
) {
  for (let j = 0; j < numCols; j++) {
    box1DFloat(inBuf, j, outBuf, j, numRows, numCols, windowSize);
  }
}

// Reference: jaroszFilterFloat — two ping-pong passes ending in buffer1.
function jaroszFilterFloat(
  buffer1: Float32Array,
  buffer2: Float32Array,
  numRows: number,
  numCols: number,
  windowSizeAlongRows: number,
  windowSizeAlongCols: number,
  nreps: number,
) {
  for (let i = 0; i < nreps; i++) {
    boxAlongRowsFloat(buffer1, buffer2, numRows, numCols, windowSizeAlongRows);
    boxAlongColsFloat(buffer2, buffer1, numRows, numCols, windowSizeAlongCols);
  }
}

// Reference: decimateFloat — target centers, not corners.
function decimateFloat(
  inBuf: Float32Array,
  inNumRows: number,
  inNumCols: number,
  out: Float32Array,
  outNumRows: number,
  outNumCols: number,
) {
  for (let outi = 0; outi < outNumRows; outi++) {
    const ini = Math.trunc(((outi + 0.5) * inNumRows) / outNumRows);
    for (let outj = 0; outj < outNumCols; outj++) {
      const inj = Math.trunc(((outj + 0.5) * inNumCols) / outNumCols);
      out[outi * outNumCols + outj] = inBuf[ini * inNumCols + inj];
    }
  }
}

// Reference: pdqImageDomainQualityMetric — quantized gradient count.
function pdqImageDomainQualityMetric(buffer64x64: Float32Array): number {
  let gradientSum = 0;
  for (let i = 0; i < OUT_DIM - 1; i++) {
    for (let j = 0; j < OUT_DIM; j++) {
      const u = buffer64x64[i * OUT_DIM + j];
      const v = buffer64x64[(i + 1) * OUT_DIM + j];
      const d = Math.trunc(((u - v) * 100) / 255);
      gradientSum += Math.abs(d);
    }
  }
  for (let i = 0; i < OUT_DIM; i++) {
    for (let j = 0; j < OUT_DIM - 1; j++) {
      const u = buffer64x64[i * OUT_DIM + j];
      const v = buffer64x64[i * OUT_DIM + j + 1];
      const d = Math.trunc(((u - v) * 100) / 255);
      gradientSum += Math.abs(d);
    }
  }
  return Math.min(100, Math.trunc(gradientSum / 90));
}

let dctMatrix: Float32Array | null = null;

// Reference: dct_matrix_64 — 16x64 DCT-II basis skipping the DC term:
// d[i][j] = sqrt(2/64) * cos((pi/2/64) * (i+1) * (2j+1)).
function getDctMatrix(): Float32Array {
  if (!dctMatrix) {
    dctMatrix = new Float32Array(DCT_DIM * OUT_DIM);
    const scale = fround(Math.sqrt(2 / OUT_DIM));
    for (let i = 0; i < DCT_DIM; i++) {
      for (let j = 0; j < OUT_DIM; j++) {
        dctMatrix[i * OUT_DIM + j] = fround(
          scale * Math.cos((Math.PI / 2 / OUT_DIM) * (i + 1) * (2 * j + 1)),
        );
      }
    }
  }
  return dctMatrix;
}

// Reference: dct64To16 — B = D A Dt with float32 accumulation.
function dct64To16(a: Float32Array): Float32Array {
  const d = getDctMatrix();
  const t = new Float32Array(DCT_DIM * OUT_DIM); // T = D A
  for (let i = 0; i < DCT_DIM; i++) {
    for (let j = 0; j < OUT_DIM; j++) {
      let sumk = 0;
      for (let k = 0; k < OUT_DIM; k++) {
        sumk = fround(sumk + fround(d[i * OUT_DIM + k] * a[k * OUT_DIM + j]));
      }
      t[i * OUT_DIM + j] = sumk;
    }
  }
  const b = new Float32Array(DCT_DIM * DCT_DIM);
  for (let i = 0; i < DCT_DIM; i++) {
    for (let j = 0; j < DCT_DIM; j++) {
      let sumk = 0;
      for (let k = 0; k < OUT_DIM; k++) {
        sumk = fround(sumk + fround(t[i * OUT_DIM + k] * d[j * OUT_DIM + k]));
      }
      b[i * DCT_DIM + j] = sumk;
    }
  }
  return b;
}

// Reference: torben — median selection without sorting; returns an actual
// element of the array (the lower median for even counts).
function torben(m: Float32Array, n: number): number {
  let min = m[0];
  let max = m[0];
  for (let i = 1; i < n; i++) {
    if (m[i] < min) min = m[i];
    if (m[i] > max) max = m[i];
  }

  let guess = 0;
  let maxltguess = 0;
  let mingtguess = 0;
  let less = 0;
  let greater = 0;
  let equal = 0;

  for (;;) {
    guess = fround((min + max) / 2);
    less = 0;
    greater = 0;
    equal = 0;
    maxltguess = min;
    mingtguess = max;
    for (let i = 0; i < n; i++) {
      if (m[i] < guess) {
        less++;
        if (m[i] > maxltguess) maxltguess = m[i];
      } else if (m[i] > guess) {
        greater++;
        if (m[i] < mingtguess) mingtguess = m[i];
      } else {
        equal++;
      }
    }
    if (less <= (n + 1) / 2 && greater <= (n + 1) / 2) break;
    else if (less > greater) max = maxltguess;
    else min = mingtguess;
  }
  if (less >= (n + 1) / 2) return maxltguess;
  else if (less + equal >= (n + 1) / 2) return guess;
  return mingtguess;
}

// Reference: pdqBuffer16x16ToBits + Hash256 word layout. Bit k lives in
// 16-bit word k>>4 at position k&15; the hex string prints words 15..0.
function buffer16x16ToHex(dctOutput: Float32Array): string {
  const dctMedian = torben(dctOutput, DCT_DIM * DCT_DIM);
  const words = new Uint16Array(16);
  for (let i = 0; i < DCT_DIM; i++) {
    for (let j = 0; j < DCT_DIM; j++) {
      if (dctOutput[i * DCT_DIM + j] > dctMedian) {
        const k = i * 16 + j;
        words[k >> 4] |= 1 << (k & 15);
      }
    }
  }
  let hash = "";
  for (let w = 15; w >= 0; w--) {
    hash += words[w].toString(16).padStart(4, "0");
  }
  return hash;
}

export function computePdqHash(input: PdqInput): PdqResult {
  if (
    !input ||
    input.width < MIN_HASHABLE_DIM ||
    input.height < MIN_HASHABLE_DIM ||
    input.data.length !== input.width * input.height * 4
  ) {
    throw new Error("pdq_invalid_input");
  }
  let image = input;
  if (image.width > DOWNSAMPLE_DIMS || image.height > DOWNSAMPLE_DIMS) {
    image = nearestResizeRgba(image, DOWNSAMPLE_DIMS, DOWNSAMPLE_DIMS);
  }
  const numRows = image.height;
  const numCols = image.width;

  const buffer1 = toLuminance(image);
  const buffer64x64 = new Float32Array(OUT_DIM * OUT_DIM);

  if (numRows === 64 && numCols === 64) {
    buffer64x64.set(buffer1);
  } else {
    const buffer2 = new Float32Array(numRows * numCols);
    const windowSizeAlongRows = jaroszWindowSize(numCols, OUT_DIM);
    const windowSizeAlongCols = jaroszWindowSize(numRows, OUT_DIM);
    jaroszFilterFloat(
      buffer1,
      buffer2,
      numRows,
      numCols,
      windowSizeAlongRows,
      windowSizeAlongCols,
      PDQ_NUM_JAROSZ_XY_PASSES,
    );
    decimateFloat(buffer1, numRows, numCols, buffer64x64, OUT_DIM, OUT_DIM);
  }

  const quality = pdqImageDomainQualityMetric(buffer64x64);
  const dct = dct64To16(buffer64x64);
  const hash = buffer16x16ToHex(dct);
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
