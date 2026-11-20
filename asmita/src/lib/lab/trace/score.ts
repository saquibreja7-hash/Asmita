/*
 * The E3 trace scoring core (docs/lab/charter.md, experiment E3): given a
 * suspect image and one candidate original, compute whole-image, face-region
 * and background-region similarity, align the pair, and turn the signals into
 * one honest verdict band.
 *
 * Pure TypeScript over RGBA buffers: the browser page and the lab-bench
 * `trace` command both run THIS file (the lab imports it relatively, the
 * way tools/lab-bench already imports asmita's PDQ), so a harness number and
 * a page number mean the same thing. No DOM, no Node APIs; every threshold
 * below is a named constant pinned by tests and documented in
 * asmita/docs/lab/e3.md.
 *
 * What the signals are and how they combine (see e3.md for the full method):
 *   - whole / face / background: PDQ hamming distance (the site's own
 *     pdq.ts) over the full image, the located face crop (+30% margin) and
 *     the background with the face masked (+15% margin, grey 128) — the same
 *     three regions E1 benchmarked.
 *   - sscd: cosine of the SSCD copy-detection embeddings, when the model is
 *     available (the crawler's second matching layer, threshold 0.85).
 *   - tiles: the alignment corroboration — the suspect resampled onto the
 *     original through the eye-pair similarity transform (E1's face-swap
 *     alignment), then a 16x16 grid of per-tile luma differences; the share
 *     of tiles that agree is the heat map the page renders.
 * Each signal is banded (strong / match / borderline / weak / none) and
 * contributes evidence points; the verdict band is strong only when enough
 * independent signals agree, and honest about what a low score can never
 * prove. Byte-identical images short-circuit to strong — pixel equality is
 * the one claim that needs no inference at all.
 */

import { computePdqHash, hammingDistance } from "../../pdq/pdq";
import {
  applySimilarity,
  backgroundMaskBox,
  cropRgba,
  faceCropBox,
  lumaPlane,
  pixelsEqual,
  resizeRgbaNearest,
  similarityFromEyes,
  withBoxMasked,
  type FaceLandmarks,
  type Rgba,
} from "./geometry";
import { cosine } from "./sscd";

/** Version stamped on results and the evidence PDF. */
export const TRACE_TOOL_VERSION = "trace-1.0.0";

/** Smallest side a face crop must have to be hashed (E1: 48). */
export const MIN_FACE_CROP_SIDE = 48;
/** PDQ quality below which a hash is treated as unreliable (flat/blurred input). */
export const MIN_PDQ_QUALITY = 25;
/** The production PDQ match threshold (hamming distance, pdq.ts). */
export const PDQ_MATCH_THRESHOLD = 31;

/** Heat-map grid: the two images are compared tile by tile on this grid. */
export const TILE_GRID = 16;
/** Mean abs luma difference (0..255) below which a tile counts as matching. */
export const TILE_MATCH_LUMA_DIFF = 24;
/** The side both images are resampled to for the tile comparison. */
export const TILE_COMPARE_SIDE = 512;

/** SSCD cosines (the crawler's second layer, SSCD_THRESHOLD default 0.85). */
export const SSCD_MATCH_COSINE = 0.85;
export const SSCD_STRONG_COSINE = 0.93;
export const SSCD_WEAK_COSINE = 0.75;

/** Evidence points needed for each verdict band. */
export const STRONG_EVIDENCE_POINTS = 3.5;
export const POSSIBLE_EVIDENCE_POINTS = 1.5;

/** A PDQ comparison of two regions, or null where hashing failed. */
export type RegionScore = { distance: number; qualityA: number; qualityB: number } | null;

/** Machine-readable notes the page and PDF translate honestly. */
export type TraceNote =
  | "sscd_model_not_configured"
  | "sscd_inference_failed"
  | "landmarks_unavailable"
  | "no_face_in_pair"
  | "low_image_quality"
  | "identical_pixels";

export type TileScore = {
  /** Share of grid tiles whose luma difference is inside tolerance (0..1). */
  agreement: number;
  /** Per-tile similarity 0..1 (1 = identical luma), row-major, grid x grid. */
  heat: number[];
  /** Per-tile matched flags, row-major, grid x grid. */
  matched: boolean[];
  grid: number;
  /** True when the eye-pair similarity transform was applied first. */
  aligned: boolean;
};

export type TraceSignals = {
  whole: RegionScore;
  face: RegionScore | null;
  background: RegionScore | null;
  sscd: { cosine: number } | null;
  tiles: TileScore;
  notes: TraceNote[];
};

/** Compute PDQ over a region pair; null if either side cannot be hashed. */
export function regionPdq(a: Rgba, b: Rgba): RegionScore {
  try {
    const ha = computePdqHash(a);
    const hb = computePdqHash(b);
    return { distance: hammingDistance(ha.hash, hb.hash), qualityA: ha.quality, qualityB: hb.quality };
  } catch {
    return null;
  }
}

/**
 * The heat-map corroboration: resample both images to the comparison side
 * (the suspect already aligned to the original when landmarks allowed),
 * then compare mean abs luma per tile of a grid x grid grid.
 */
export function tileComparison(a: Rgba, b: Rgba, aligned: boolean): TileScore {
  const ra = resizeRgbaNearest(a, TILE_COMPARE_SIDE, TILE_COMPARE_SIDE);
  const rb = resizeRgbaNearest(b, TILE_COMPARE_SIDE, TILE_COMPARE_SIDE);
  const la = lumaPlane(ra);
  const lb = lumaPlane(rb);
  const cell = TILE_COMPARE_SIDE / TILE_GRID;
  const heat: number[] = [];
  const matched: boolean[] = [];
  let matchedCount = 0;
  for (let gy = 0; gy < TILE_GRID; gy++) {
    for (let gx = 0; gx < TILE_GRID; gx++) {
      let sum = 0;
      for (let y = 0; y < cell; y++) {
        const row = ((gy * cell + y) | 0) * TILE_COMPARE_SIDE;
        for (let x = 0; x < cell; x++) {
          const p = row + ((gx * cell + x) | 0);
          sum += Math.abs(la[p]! - lb[p]!);
        }
      }
      const diff = sum / (cell * cell);
      const ok = diff <= TILE_MATCH_LUMA_DIFF;
      heat.push(1 - Math.min(diff / 64, 1));
      matched.push(ok);
      if (ok) matchedCount++;
    }
  }
  return { agreement: matchedCount / (TILE_GRID * TILE_GRID), heat, matched, grid: TILE_GRID, aligned };
}

export type TraceInput = {
  suspect: Rgba;
  original: Rgba;
  /** Located faces in each image's pixel coordinates; null when none was found. */
  suspectFace: FaceLandmarks | null;
  originalFace: FaceLandmarks | null;
  /** SSCD embeddings (L2-normalised), null when the model was not run. */
  suspectSscd?: number[] | null;
  originalSscd?: number[] | null;
  /** False when no SSCD model URL is configured (reported honestly). */
  sscdConfigured: boolean;
  /** False when the face-landmark model could not load at all. */
  landmarksConfigured: boolean;
};

/**
 * All comparison signals for one suspect/original pair. Both images must
 * have been decoded through the same pipeline (browser canvas or harness
 * sharp) at up to the working-copy long edge; the faces must be in the same
 * pixel frame as the images.
 */
export function traceSignals(input: TraceInput): TraceSignals {
  const { suspect, original, suspectFace, originalFace } = input;
  const notes: TraceNote[] = [];

  const whole = regionPdq(suspect, original);
  const identical = pixelsEqual(suspect, original);
  if (identical) notes.push("identical_pixels");
  if (whole && Math.min(whole.qualityA, whole.qualityB) < MIN_PDQ_QUALITY) notes.push("low_image_quality");

  // Landmark-dependent signals.
  let face: RegionScore | null = null;
  let background: RegionScore | null = null;
  let alignedSuspect: Rgba | null = null;
  const haveFaces = suspectFace !== null && originalFace !== null;
  if (!input.landmarksConfigured) notes.push("landmarks_unavailable");
  if (haveFaces) {
    const cropBoxA = faceCropBox(suspectFace!, suspect.width, suspect.height);
    const cropBoxB = faceCropBox(originalFace!, original.width, original.height);
    if (cropBoxA.w >= MIN_FACE_CROP_SIDE && cropBoxA.h >= MIN_FACE_CROP_SIDE && cropBoxB.w >= MIN_FACE_CROP_SIDE && cropBoxB.h >= MIN_FACE_CROP_SIDE) {
      face = regionPdq(cropRgba(suspect, cropBoxA), cropRgba(original, cropBoxB));
      const maskedA = withBoxMasked(suspect, backgroundMaskBox(suspectFace!, suspect.width, suspect.height));
      const maskedB = withBoxMasked(original, backgroundMaskBox(originalFace!, original.width, original.height));
      background = regionPdq(maskedA, maskedB);
    }
    const transform = similarityFromEyes(suspectFace!, originalFace!);
    if (transform) alignedSuspect = applySimilarity(suspect, transform, original.width, original.height);
  } else if (input.landmarksConfigured) {
    notes.push("no_face_in_pair");
  }
  if (alignedSuspect === null) alignedSuspect = suspect;
  const tiles = tileComparison(alignedSuspect, original, alignedSuspect !== suspect);

  // SSCD.
  let sscd: { cosine: number } | null = null;
  const sa = input.suspectSscd ?? null;
  const sb = input.originalSscd ?? null;
  if (Array.isArray(sa) && Array.isArray(sb)) sscd = { cosine: cosine(sa, sb) };
  if (!sscd && !input.sscdConfigured) notes.push("sscd_model_not_configured");
  else if (!sscd && input.sscdConfigured) notes.push("sscd_inference_failed");

  return { whole, face, background, sscd, tiles, notes };
}

// ─── Bands ─────────────────────────────────────────────────────────────────

export type PdqBand = "strong" | "match" | "borderline" | "none" | "unreliable";

/**
 * Band a PDQ distance: <= 12 strong, <= 24 match, <= 31 borderline (the
 * production match threshold; the crawler shows 25-31 as borderline too),
 * above it no match. Below the quality floor the distance is noise, not
 * evidence, so it reads unreliable.
 */
export function pdqBand(score: RegionScore): PdqBand {
  if (!score) return "unreliable";
  if (Math.min(score.qualityA, score.qualityB) < MIN_PDQ_QUALITY) return "unreliable";
  if (score.distance <= 12) return "strong";
  if (score.distance <= 24) return "match";
  if (score.distance <= PDQ_MATCH_THRESHOLD) return "borderline";
  return "none";
}

export type SscdBand = "strong" | "match" | "weak" | "none" | "unreliable";

/** Band an SSCD cosine (0.85 is the crawler's match threshold). */
export function sscdBand(cosine: number | null): SscdBand {
  if (cosine === null) return "unreliable";
  if (cosine >= SSCD_STRONG_COSINE) return "strong";
  if (cosine >= SSCD_MATCH_COSINE) return "match";
  if (cosine >= SSCD_WEAK_COSINE) return "weak";
  return "none";
}

export type TileBand = "strong" | "match" | "weak" | "none";

/** Band the tile agreement share. */
export function tileBand(agreement: number): TileBand {
  if (agreement >= 0.85) return "strong";
  if (agreement >= 0.6) return "match";
  if (agreement >= 0.45) return "weak";
  return "none";
}

/** Points a band of evidence is worth. */
export const BAND_POINTS: Record<string, number> = {
  strong: 2,
  match: 1,
  borderline: 0.5,
  weak: 0.5,
  none: 0,
  unreliable: 0,
};

export type SignalName = "whole" | "face" | "background" | "sscd" | "tiles";

export type EvidencePart = {
  signal: SignalName;
  available: boolean;
  band: PdqBand | SscdBand | TileBand;
  points: number;
};

/**
 * Every signal's band and its evidence points. The face score counts as
 * shared-source evidence only when the morph carried her face over (a
 * mismatching face with a matching background is the classic morph
 * signature and shows in the breakdown, but it is not itself evidence about
 * the source photo).
 */
export function evidenceParts(signals: TraceSignals): EvidencePart[] {
  const parts: EvidencePart[] = [];
  for (const [signal, score] of [
    ["whole", signals.whole],
    ["face", signals.face],
    ["background", signals.background],
  ] as const) {
    const band = pdqBand(score);
    parts.push({ signal, available: score !== null, band, points: BAND_POINTS[band] ?? 0 });
  }
  const band = sscdBand(signals.sscd ? signals.sscd.cosine : null);
  parts.push({ signal: "sscd", available: signals.sscd !== null, band, points: BAND_POINTS[band] ?? 0 });
  const tband = tileBand(signals.tiles.agreement);
  parts.push({ signal: "tiles", available: true, band: tband, points: BAND_POINTS[tband] ?? 0 });
  return parts;
}

export type Verdict = "strong" | "possible" | "none";

export type VerdictResult = {
  verdict: Verdict;
  points: number;
  hasStrong: boolean;
  parts: EvidencePart[];
  identical: boolean;
};

/**
 * The verdict band: strong needs at least one clear signal AND enough total
 * agreement (3.5 points: e.g. whole+background+tiles all matching); one
 * clear region alone stays possible. Pixel-identical images are strong
 * outright. Below 1.5 points the honest answer is no evidence of a shared
 * source.
 */
export function verdictOf(signals: TraceSignals): VerdictResult {
  const parts = evidenceParts(signals);
  const points = parts.reduce((sum, p) => sum + p.points, 0);
  const hasStrong = parts.some((p) => p.band === "strong");
  const identical = signals.notes.includes("identical_pixels");
  let verdict: Verdict;
  if (identical || (points >= STRONG_EVIDENCE_POINTS && hasStrong)) verdict = "strong";
  else if (points >= POSSIBLE_EVIDENCE_POINTS) verdict = "possible";
  else verdict = "none";
  return { verdict, points, hasStrong, parts, identical };
}
