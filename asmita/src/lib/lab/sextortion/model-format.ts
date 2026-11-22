import { SEXTORTION_LABELS, type SextortionLabel } from "./taxonomy";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): the on-disk format
 * of the sextortion model (src/lib/lab/sextortion/model.json) and its
 * runtime decode.
 *
 * The model is a one-vs-rest logistic regression over hashed features
 * (features.ts), trained by tools/lab-sextortion/src/train.ts and exported
 * here. The file is committed: it is Asmita's own artifact, built from
 * Asmita's own synthetic examples (spec rule 3 keeps THIRD-PARTY research
 * data and weights out of the repo; this model is neither). It stays small
 * by storing, per label, only nonzero weights, quantized to integers:
 *
 *   stored value = round(weight * quantScale)   (quantScale = 2^12)
 *
 * so the whole model is a few hundred kilobytes of plain JSON, easy to
 * review in a diff, and quick to parse on the Worker.
 *
 * The trainer and the classifier share this file, so the encode (tool) and
 * the decode (app) can never disagree about the format.
 */

/** Bumped when the layout of the JSON changes in a way old readers reject. */
export const SEXTORTION_MODEL_FORMAT = 1;

/** Weights are stored as round(w * quantScale); 1/4096 resolution is plenty for a linear model. */
export const SEXTORTION_QUANT_SCALE = 4096;

/** One label's one-vs-rest weights: quantized bias, quantized decision threshold, and sparse buckets. */
export interface SextortionLabelModel {
  /** Quantized bias (divide by the model's quantScale). */
  bias: number;
  /** Quantized decision threshold (divide by the model's quantScale). */
  threshold: number;
  /** Feature buckets with a nonzero weight, ascending. */
  i: number[];
  /** Quantized weights, same length as i. */
  v: number[];
}

/** The whole model file, as written by the trainer. */
export interface SextortionModelJson {
  format: number;
  /** Trainer version; bump when training itself changes. */
  modelVersion: number;
  /** ISO date of the training run that produced this file (a constant in train.ts, for reproducibility). */
  trainedAt: string;
  /** The synthetic-data generator seed the training data was rebuilt from. */
  generatorSeed: number;
  generatorVersion: number;
  /** Feature hash space, a power of two. */
  hashBits: number;
  quantScale: number;
  trainRows: number;
  tuneRows: number;
  labels: Record<SextortionLabel, SextortionLabelModel>;
}

/** The model decoded into flat typed arrays: one pass per bucket at inference. */
export interface DecodedSextortionModel {
  hashBits: number;
  /** The labels in canonical order; index i of every array below belongs to labels[i]. */
  labels: SextortionLabel[];
  bias: Float64Array;
  threshold: Float64Array;
  /** bucket → per-label weights (dequantized), aligned with labels. */
  weights: Map<number, Float64Array>;
}

function isPowerOfTwo(value: number) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/** The logistic function, saturated safely at ±30 so exp() can never overflow. */
export function sigmoid(z: number): number {
  if (z >= 30) return 1;
  if (z <= -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Decode a model file into the runtime shape. Throws on anything malformed:
 * a bad model must fail loudly at load, never mis-classify quietly. The
 * caller decides how to react (the classifier treats it as unreachable —
 * the committed file is validated by tests).
 */
export function decodeSextortionModel(model: SextortionModelJson): DecodedSextortionModel {
  if (model.format !== SEXTORTION_MODEL_FORMAT) throw new Error(`sextortion model: unknown format ${model.format}`);
  if (!isPowerOfTwo(model.hashBits)) throw new Error(`sextortion model: hashBits ${model.hashBits} is not a power of two`);
  if (!Number.isInteger(model.quantScale) || model.quantScale <= 0) throw new Error("sextortion model: bad quantScale");
  const scale = model.quantScale;
  const labels = [...SEXTORTION_LABELS];
  const labelCount = labels.length;
  const bias = new Float64Array(labelCount);
  const threshold = new Float64Array(labelCount);
  const weights = new Map<number, Float64Array>();
  labels.forEach((label, index) => {
    const entry = model.labels[label];
    if (!entry) throw new Error(`sextortion model: label ${label} is missing`);
    if (entry.i.length !== entry.v.length) throw new Error(`sextortion model: label ${label} has mismatched i/v lengths`);
    if (entry.i.some((bucket, at) => at > 0 && bucket <= entry.i[at - 1])) {
      throw new Error(`sextortion model: label ${label} has unsorted or duplicate buckets`);
    }
    bias[index] = entry.bias / scale;
    threshold[index] = entry.threshold / scale;
    if (threshold[index] <= 0 || threshold[index] >= 1) {
      throw new Error(`sextortion model: label ${label} threshold ${entry.threshold} is out of (0,1)`);
    }
    for (let at = 0; at < entry.i.length; at++) {
      const bucket = entry.i[at];
      const value = entry.v[at] / scale;
      let perBucket = weights.get(bucket);
      if (perBucket === undefined) {
        perBucket = new Float64Array(labelCount);
        weights.set(bucket, perBucket);
      }
      perBucket[index] = value;
    }
  });
  return { hashBits: model.hashBits, labels, bias, threshold, weights };
}
