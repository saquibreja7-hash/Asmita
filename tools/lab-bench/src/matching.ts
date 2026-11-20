/**
 * The E1 matching benchmark: score every probe against a gallery of
 * originals with each method, then report recall at a 1% false-match rate
 * per transform.
 *
 * Methods (charter E1):
 *   - pdq          whole-image PDQ (the production baseline), production
 *                  quality floor (50) applied
 *   - sscd         pinned sscd_disc_mixup ONNX embeddings, cosine
 *   - pdq-face     PDQ of the face crop only (face located, crop expanded)
 *   - pdq-background  PDQ with the face masked out
 *
 * Pairs: a probe's genuine pair is the original it was built from; its
 * impostor pairs are every other original in the gallery. Gallery-vs-gallery
 * pairs (unrelated originals) join every transform's impostor pool as the
 * probe-independent noise floor. Per transform, the threshold is the one
 * pickOperatingPoint() chooses at the target FMR (default 1%), and recall is
 * the share of that transform's genuine pairs matched at it — the E1 metric.
 */
import sharp from "sharp";
import { hammingDistance, computePdqHash, PRODUCTION_MIN_QUALITY, type PdqResult } from "./pdq.ts";
import { prepareForPdq } from "./prepare.ts";
import { cosine, SscdEmbedder } from "./sscd.ts";
import type { FaceLocator } from "./landmarks.ts";
import type { BenchSet, SetItem, Transform } from "./setformat.ts";
import { galleryItems, isProbeTransform, PROBE_TRANSFORMS } from "./setformat.ts";
import { pickOperatingPoint, type ScoreKind } from "./metrics.ts";

export type MatchMethodId = "pdq" | "sscd" | "pdq-face" | "pdq-background";

/** Face-crop margin as a fraction of the face box sides. */
export const FACE_CROP_MARGIN = 0.3;
/** Background-mask margin as a fraction of the face box sides. */
export const BACKGROUND_MASK_MARGIN = 0.15;
/** Smallest side a face crop must have to be hashable. */
export const MIN_FACE_CROP_SIDE = 48;
/** The flat grey the background method masks the face with. */
export const MASK_GREY = 128;

export const MATCH_METHODS: MatchMethodId[] = ["pdq", "sscd", "pdq-face", "pdq-background"];
export const SCORE_KINDS: Record<MatchMethodId, ScoreKind> = {
  pdq: "distance",
  sscd: "similarity",
  "pdq-face": "distance",
  "pdq-background": "distance",
};

export type MatchDeps = {
  /** Face locator (production: HumanFaceLocator; tests inject fakes). */
  faceLocator?: FaceLocator;
  /** SSCD embedder (production: SscdEmbedder; tests inject fakes). */
  sscd?: SscdEmbedder;
  /** Target false-match rate for the operating point. Default 1%. */
  targetFmr?: number;
};

export type PdqRep = { hash: string; quality: number } | null;

export type Reps = {
  pdq: PdqRep;
  sscd: number[] | null;
  "pdq-face": PdqRep;
  "pdq-background": PdqRep;
};

export async function hashForPdq(buffer: Buffer): Promise<PdqResult> {
  const input = await prepareForPdq(buffer);
  return computePdqHash(input);
}

/** Hash with the production quality floor: below 50 the crawler skips. */
export function usable(rep: PdqRep): string | null {
  return rep && rep.quality >= PRODUCTION_MIN_QUALITY ? rep.hash : null;
}

/** The face crop the pdq-face method hashes: box plus margin, clamped. */
export async function faceCrop(buffer: Buffer, face: { box: { x: number; y: number; w: number; h: number } }): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("faceCrop: unreadable image");
  const mx = face.box.w * FACE_CROP_MARGIN;
  const my = face.box.h * FACE_CROP_MARGIN;
  const left = Math.max(0, Math.round(face.box.x - mx));
  const top = Math.max(0, Math.round(face.box.y - my));
  const width = Math.min(w - left, Math.round(face.box.w + 2 * mx));
  const height = Math.min(h - top, Math.round(face.box.h + 2 * my));
  if (width < MIN_FACE_CROP_SIDE || height < MIN_FACE_CROP_SIDE) throw new Error("faceCrop: crop too small");
  return sharp(buffer, { failOn: "none", animated: false }).rotate().extract({ left, top, width, height }).png().toBuffer();
}

/** The background the pdq-background method hashes: face masked with flat grey. */
export async function backgroundMasked(buffer: Buffer, face: { box: { x: number; y: number; w: number; h: number } }): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("backgroundMasked: unreadable image");
  const mx = face.box.w * BACKGROUND_MASK_MARGIN;
  const my = face.box.h * BACKGROUND_MASK_MARGIN;
  const left = Math.max(0, Math.round(face.box.x - mx));
  const top = Math.max(0, Math.round(face.box.y - my));
  const width = Math.min(w - left, Math.round(face.box.w + 2 * mx));
  const height = Math.min(h - top, Math.round(face.box.h + 2 * my));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgb(${MASK_GREY},${MASK_GREY},${MASK_GREY})"/></svg>`;
  return sharp(buffer, { failOn: "none", animated: false }).rotate().composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

export type MatchPairScore = {
  method: MatchMethodId;
  probe: string;
  gallery: string;
  transform: Transform;
  kind: "genuine" | "impostor";
  score: number;
};

/** A pair that exists but could not be scored (a side had no usable representation). */
export type PairMiss = Omit<MatchPairScore, "score">;

export type TransformStat = {
  recall: number | null;
  threshold: number | null;
  fmr: number | null;
  genuine: number;
  impostor: number;
  genuineMatched: number;
  impostorMatched: number;
  /** Pairs that could not be scored because a side had no usable representation. */
  repMisses: number;
};

export type MethodResult = {
  available: boolean;
  reason?: string;
  scoreKind: ScoreKind;
  perTransform: Partial<Record<Transform, TransformStat>>;
};

export type MatchResults = {
  kind: "match";
  createdAt: string;
  set: { dir: string; items: number; gallery: number; probes: number; perTransform: Record<string, number> };
  config: { targetFmr: number };
  methods: Record<MatchMethodId, MethodResult>;
  notes: string[];
};

/**
 * Compute every pair score for one method over the set. Pure given the
 * per-item representations, so tests can drive it with synthetic ones.
 * Gallery-vs-gallery pairs are emitted once under the "original" transform
 * and joined into every transform's impostor pool at aggregation.
 */
export function pairScores(
  items: SetItem[],
  reps: Map<string, Reps>,
  method: MatchMethodId,
): { scores: MatchPairScore[]; misses: PairMiss[] } {
  const gallery = galleryItems(items);
  const probes = items.filter((i) => isProbeTransform(i.transform));
  const scores: MatchPairScore[] = [];
  const misses: PairMiss[] = [];
  const score = (a: SetItem, b: SetItem, kind: "genuine" | "impostor", transform: Transform): void => {
    const ra = reps.get(a.id)?.[method];
    const rb = reps.get(b.id)?.[method];
    const push = (score?: number) => {
      const base = { method, probe: a.id, gallery: b.id, transform, kind };
      if (score === undefined) misses.push(base);
      else scores.push({ ...base, score });
    };
    if (method === "sscd") {
      push(Array.isArray(ra) && Array.isArray(rb) ? cosine(ra, rb) : undefined);
      return;
    }
    const ha = usable(ra as PdqRep);
    const hb = usable(rb as PdqRep);
    push(ha && hb ? hammingDistance(ha, hb) : undefined);
  };
  for (const p of probes) {
    for (const g of gallery) {
      if (g.id === p.sourceId) score(p, g, "genuine", p.transform);
      else score(p, g, "impostor", p.transform);
    }
  }
  for (let i = 0; i < gallery.length; i++) {
    for (let j = i + 1; j < gallery.length; j++) {
      score(gallery[i]!, gallery[j]!, "impostor", "original");
    }
  }
  return { scores, misses };
}

/**
 * Recall at the target FMR per transform. Each probe transform's impostor
 * pool is its own probe-vs-unrelated-original pairs plus the gallery noise
 * floor; the threshold is picked per transform by pickOperatingPoint, and
 * pairs lost to missing representations count as misses (they can never match).
 */
export function aggregate(
  scores: MatchPairScore[],
  method: MatchMethodId,
  items: SetItem[],
  targetFmr: number,
): MethodResult["perTransform"] {
  const gallery = galleryItems(items);
  const kind = SCORE_KINDS[method];
  const perTransform: MethodResult["perTransform"] = {};
  for (const t of PROBE_TRANSFORMS) {
    const genuine = scores.filter((s) => s.transform === t && s.kind === "genuine").map((s) => s.score);
    const impostor = scores
      .filter((s) => s.kind === "impostor" && (s.transform === t || s.transform === "original"))
      .map((s) => s.score);
    const probeCount = items.filter((i) => i.transform === t).length;
    if (probeCount === 0) continue; // transform absent from this set
    const expectedGenuine = probeCount;
    const expectedImpostor = probeCount * Math.max(0, gallery.length - 1) + (gallery.length * (gallery.length - 1)) / 2;
    const op = pickOperatingPoint(genuine, impostor, kind, targetFmr);
    perTransform[t] = {
      recall: op ? op.recall : null,
      threshold: op ? op.threshold : null,
      fmr: op ? op.fmr : null,
      genuine: genuine.length,
      impostor: impostor.length,
      genuineMatched: op ? op.genuineMatched : 0,
      impostorMatched: op ? op.impostorMatched : 0,
      repMisses:
        Math.max(0, expectedGenuine - genuine.length) +
        Math.max(0, expectedImpostor - impostor.length),
    };
  }
  return perTransform;
}

