import { extractFeatureBuckets } from "../../../asmita/src/lib/lab/sextortion/features.ts";
import {
  SEXTORTION_CORE_LABELS,
  SEXTORTION_LABELS,
  SEXTORTION_SUPPORTING_LABELS,
  type SextortionLabel,
} from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";
import {
  SEXTORTION_MODEL_FORMAT,
  SEXTORTION_QUANT_SCALE,
  sigmoid,
  type SextortionModelJson,
} from "../../../asmita/src/lib/lab/sextortion/model-format.ts";
import { composeRow, GENERATOR_SEED, GENERATOR_VERSION, scriptQuotas } from "./generate.ts";
import { hashSeed, rngFromSeed, type Rng } from "./rng.ts";
import { FAMILIES, SCRIPT_TAGS } from "./templates.ts";
import type { DatasetRow } from "./dataset.ts";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): the trainer for the
 * sextortion classifier.
 *
 * A one-vs-rest logistic regression per taxonomy label over hashed features
 * (features.ts — the SAME extraction the Worker runs at inference, imported
 * from the app tree so the two can never drift). Plain mini-batch gradient
 * descent with L2 decay, early stopping on the tuning split, thresholds
 * picked on the tuning split for flag precision ≥ 0.95, exported as
 * asmita/src/lib/lab/sextortion/model.json.
 *
 * Determinism: the training data comes from the WP116 generator (fixed
 * seed), the train/tuning split is by row index, the batch order is a
 * seeded Fisher–Yates shuffle, and the "training date" is a constant — the
 * same code always rebuilds the same model file. Nothing here reads the
 * clock, Math.random, or any file outside the repo.
 *
 * The hand-written eval set (eval/) is NEVER touched by this file: it is
 * not used for training, threshold selection, or early stopping.
 */

export const TRAINER_VERSION = 1;
/** The date of the training run this model file records. A constant, for byte-reproducible exports. */
export const TRAINED_AT = "2026-11-22";

// ------------------------------------------------------------- constants ----

/** Feature hash space (2^16 buckets). */
export const HASH_BITS = 65536;
/** Every SPLIT_EVERY-th row of each family×script run goes to the tuning split. */
export const SPLIT_EVERY = 6;
export const BATCH_SIZE = 64;
/** Learning rate for the mean gradient of one mini-batch. */
export const LEARNING_RATE = 0.5;
/** L2: per-batch decay applied to touched weights (w -= lr·(∇/n + L2·w)). */
export const L2_LAMBDA = 1e-5;
/**
 * The same L2 term, added to the tuning loss the early-stopping rule
 * watches (see trainLabel): cross-entropy alone saturates near zero on the
 * synthetic split, and without a penalty the rule would reward unbounded
 * weight growth — pure memorisation of the training phrasings.
 */
export const L2_EARLY_STOP = 0.01;
/** Cap on how strongly a rare positive class is up-weighted (min(neg/pos, 5)). */
export const POS_WEIGHT_CAP = 5;
export const MAX_EPOCHS = 240;
export const PATIENCE = 24;
/** Flag precision the threshold shift must reach on the tuning split. */
export const TARGET_FLAG_PRECISION = 0.95;
const CORE_SET = new Set<string>(SEXTORTION_CORE_LABELS);
const SUPPORTING_SET = new Set<string>(SEXTORTION_SUPPORTING_LABELS);

// ------------------------------------------------------------------- rows ----

export interface TrainingRow {
  row: DatasetRow;
  /** Feature buckets, ascending, unique. */
  buckets: Int32Array;
  /** Ground truth, canonical label order. */
  y: Uint8Array;
  /** The flag rule's ground truth: a core label AND a supporting label present. */
  flagEligible: boolean;
}

export interface TrainingData {
  train: TrainingRow[];
  tune: TrainingRow[];
}

/** The deterministic split: row index % SPLIT_EVERY === SPLIT_EVERY - 1 tunes. */
export function isTuningIndex(index: number) {
  return index % SPLIT_EVERY === SPLIT_EVERY - 1;
}

/**
 * Rebuild the generator's dataset row by row (identical output to
 * generateDataset(): the same composeRow calls in the same order), extract
 * features once, and split train/tuning.
 */
export function prepareData(): TrainingData {
  const train: TrainingRow[] = [];
  const tune: TrainingRow[] = [];
  for (const family of FAMILIES) {
    const quotas = scriptQuotas(family.quota);
    for (const script of SCRIPT_TAGS) {
      for (let index = 0; index < quotas[script]; index++) {
        const row = composeRow(family, script, index);
        const labelSet = new Set(row.labels);
        const y = new Uint8Array(SEXTORTION_LABELS.length);
        SEXTORTION_LABELS.forEach((label, at) => {
          y[at] = labelSet.has(label) ? 1 : 0;
        });
        const core = SEXTORTION_CORE_LABELS.some((label) => labelSet.has(label));
        const support = SEXTORTION_SUPPORTING_LABELS.some((label) => labelSet.has(label));
        const prepared: TrainingRow = {
          row,
          buckets: Int32Array.from(extractFeatureBuckets(row.text, HASH_BITS)),
          y,
          flagEligible: core && support,
        };
        (isTuningIndex(index) ? tune : train).push(prepared);
      }
    }
  }
  return { train, tune };
}

// -------------------------------------------------------------- training ----

function scoreRow(weights: Float64Array, bias: number, buckets: Int32Array) {
  let z = bias;
  for (let i = 0; i < buckets.length; i++) z += weights[buckets[i]];
  return z;
}

export interface LabelFit {
  label: SextortionLabel;
  weights: Float64Array;
  bias: number;
  /** Epochs of the best snapshot (early stopping stops the run earlier). */
  epochs: number;
  /** Tuning F1 of the exported snapshot. */
  bestF1: number;
  /** Tuning loss (mean cross-entropy) of the exported snapshot. */
  bestLoss: number;
}

interface PrCounts {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

function countsToF1(tp: number, fp: number, fn: number): PrCounts {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = tp === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/**
 * One label's one-vs-rest logistic regression: mini-batch gradient descent
 * with lazy L2 decay. Early stopping watches the tuning split's
 * L2-PENALIZED loss: the synthetic tuning split separates almost
 * perfectly, so plain cross-entropy hits ~0 within a few epochs and every
 * further epoch only inflates the weights — pure memorisation of the
 * training phrasings, which scores exact template wordings at 1.0 and
 * differently-worded real messages at ~0. Adding the same L2 term to the
 * early-stopping metric makes the tuning split itself pick the snapshot
 * where margin growth stops paying for itself. Positive examples are
 * up-weighted at most POS_WEIGHT_CAP because some labels sit in under 3%
 * of rows.
 */
export function trainLabel(
  data: TrainingData,
  labelIndex: number,
  options: { maxEpochs?: number; patience?: number } = {},
): LabelFit {
  const label = SEXTORTION_LABELS[labelIndex];
  const maxEpochs = options.maxEpochs ?? MAX_EPOCHS;
  const patience = options.patience ?? PATIENCE;
  const { train, tune } = data;

  const positives = train.reduce((sum, entry) => sum + entry.y[labelIndex], 0);
  const posWeight = positives === 0 ? 1 : Math.min((train.length - positives) / positives, POS_WEIGHT_CAP);

  // Deterministic batch order per label: seeded Fisher–Yates over indices.
  const rng: Rng = rngFromSeed(hashSeed(GENERATOR_SEED, "wp117-train", label));
  const order = train.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }

  const weights = new Float64Array(HASH_BITS);
  const grad = new Float64Array(HASH_BITS);
  const mark = new Int32Array(HASH_BITS);
  const touched: number[] = [];
  let bias = 0;
  let bestLoss = Infinity;
  let bestWeights = Float64Array.from(weights);
  let bestBias = 0;
  let bestEpoch = 0;
  let bestF1 = 0;
  let stale = 0;

  const tuneTruth = tune.map((entry) => entry.y[labelIndex]);
  const evaluate = (): { loss: number; f1: number } => {
    let loss = 0;
    const scores: number[] = [];
    for (const entry of tune) {
      const score = sigmoid(scoreRow(weights, bias, entry.buckets));
      scores.push(score);
      const target = entry.y[labelIndex];
      // Weighted cross-entropy, matching the up-weighted gradient.
      const weight = target === 1 ? posWeight : 1;
      loss += weight * -(target * Math.log(Math.max(score, 1e-12)) + (1 - target) * Math.log(Math.max(1 - score, 1e-12)));
    }
    // The L2 penalty on the same term the SGD decays: cross-entropy alone
    // saturates near zero on this synthetic split and would reward
    // unbounded weight growth.
    let sumSquares = 0;
    for (let bucket = 0; bucket < weights.length; bucket++) sumSquares += weights[bucket] * weights[bucket];
    const penalized = loss / tune.length + L2_EARLY_STOP * (sumSquares / weights.length);
    return { loss: penalized, f1: f1OfThreshold(scores, tuneTruth, 0.5).f1 };
  };

  let batchId = 0;
  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    for (let start = 0; start < order.length; start += BATCH_SIZE) {
      batchId++;
      let biasGrad = 0;
      touched.length = 0;
      const end = Math.min(start + BATCH_SIZE, order.length);
      for (let at = start; at < end; at++) {
        const entry = train[order[at]];
        const target = entry.y[labelIndex];
        const prediction = sigmoid(scoreRow(weights, bias, entry.buckets));
        const g = (prediction - target) * (target === 1 ? posWeight : 1);
        biasGrad += g;
        for (let i = 0; i < entry.buckets.length; i++) {
          const bucket = entry.buckets[i];
          if (mark[bucket] !== batchId) {
            mark[bucket] = batchId;
            grad[bucket] = 0;
            touched.push(bucket);
          }
          grad[bucket] += g;
        }
      }
      const invBatch = 1 / (end - start);
      for (const bucket of touched) {
        weights[bucket] -= LEARNING_RATE * (grad[bucket] * invBatch + L2_LAMBDA * weights[bucket]);
      }
      bias -= LEARNING_RATE * biasGrad * invBatch;
    }
    const { loss, f1 } = evaluate();
    if (loss < bestLoss - 1e-9) {
      bestLoss = loss;
      bestEpoch = epoch;
      bestWeights = Float64Array.from(weights);
      bestBias = bias;
      bestF1 = f1;
      stale = 0;
    } else {
      stale++;
      if (stale >= patience) {
        return { label, weights: bestWeights, bias: bestBias, epochs: bestEpoch + 1, bestF1, bestLoss };
      }
    }
  }
  const final = evaluate();
  return { label, weights: bestWeights, bias: bestBias, epochs: bestEpoch + 1, bestF1, bestLoss: final.loss };
}

// ------------------------------------------------------------- thresholds ----

export interface ThresholdChoice {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
}

/** Confusion of `fired = score >= threshold` against truths. */
function f1OfThreshold(scores: readonly number[], truths: readonly number[], threshold: number): PrCounts {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < scores.length; i++) {
    const fired = scores[i] >= threshold;
    const truth = truths[i] === 1;
    if (fired && truth) tp++;
    else if (fired) fp++;
    else if (truth) fn++;
  }
  return countsToF1(tp, fp, fn);
}

/**
 * A label's decision threshold on the tuning split. When positives and
 * negatives separate perfectly, the cut is the MIDPOINT of the gap between
 * the highest negative score and the lowest positive score — the widest
 * margin on both sides, so differently-worded real messages have room to
 * land clear of it (the tuning data is synthetic and near-separable; a
 * knife-edge at the top of the positive cluster would not generalise).
 * Otherwise the threshold maximises F1 (ties: higher precision, then the
 * higher threshold).
 */
export function chooseThreshold(scores: readonly number[], truths: readonly number[]): ThresholdChoice {
  const positives = scores.filter((_, index) => truths[index] === 1);
  const negatives = scores.filter((_, index) => truths[index] !== 1);
  // A label with no positive tuning examples must never fire.
  if (positives.length === 0) return { threshold: 1, precision: 1, recall: 0, f1: 0 };
  if (negatives.length > 0) {
    const minPositive = Math.min(...positives);
    const maxNegative = Math.max(...negatives);
    if (minPositive > maxNegative) {
      const threshold = (minPositive + maxNegative) / 2;
      const metrics = f1OfThreshold(scores, truths, threshold);
      return { threshold, precision: metrics.precision, recall: metrics.recall, f1: metrics.f1 };
    }
  }
  const candidates = [...new Set(scores)].sort((a, b) => a - b);
  let best: ThresholdChoice | null = null;
  for (const threshold of candidates) {
    const metrics = f1OfThreshold(scores, truths, threshold);
    const better =
      best === null ||
      metrics.f1 > best.f1 + 1e-12 ||
      (Math.abs(metrics.f1 - best.f1) <= 1e-12 &&
        (metrics.precision > best.precision + 1e-12 ||
          (Math.abs(metrics.precision - best.precision) <= 1e-12 && threshold > best.threshold)));
    if (better) best = { threshold, precision: metrics.precision, recall: metrics.recall, f1: metrics.f1 };
  }
  if (best === null) return { threshold: 1, precision: 1, recall: 0, f1: 0 };
  return best;
}

export interface FlagMetrics {
  flagged: number;
  trueFlags: number;
  falseFlags: number;
  missedFlags: number;
  precision: number;
  recall: number;
}

/** Rows the flag rule should fire on (per ground-truth labels) vs those it must not. */
export interface FlagRow {
  flagEligible: boolean;
  /** Position of this row in the score arrays (subsets keep their original index). */
  scoreIndex: number;
}

/**
 * The combination rule over a precomputed tuning-score matrix: core ≥
 * threshold AND supporting ≥ threshold. Scores are computed once per label;
 * the threshold sweep then costs one comparison per label per row.
 */
export function flagMetricsFromScores(
  scoresByLabel: readonly (readonly number[])[],
  rows: readonly FlagRow[],
  thresholds: readonly number[],
): FlagMetrics {
  let flaggedTrue = 0;
  let flaggedFalse = 0;
  let missed = 0;
  const coreIdx: number[] = [];
  const supportIdx: number[] = [];
  SEXTORTION_LABELS.forEach((label, index) => {
    if (CORE_SET.has(label)) coreIdx.push(index);
    else if (SUPPORTING_SET.has(label)) supportIdx.push(index);
  });
  for (let r = 0; r < rows.length; r++) {
    const scoreIndex = rows[r].scoreIndex;
    let coreHit = false;
    let supportHit = false;
    for (const index of coreIdx) {
      if (scoresByLabel[index][scoreIndex] >= thresholds[index]) {
        coreHit = true;
        break;
      }
    }
    if (coreHit) {
      for (const index of supportIdx) {
        if (scoresByLabel[index][scoreIndex] >= thresholds[index]) {
          supportHit = true;
          break;
        }
      }
    }
    const flagged = coreHit && supportHit;
    if (flagged && rows[r].flagEligible) flaggedTrue++;
    else if (flagged) flaggedFalse++;
    else if (rows[r].flagEligible) missed++;
  }
  const flagged = flaggedTrue + flaggedFalse;
  return {
    flagged,
    trueFlags: flaggedTrue,
    falseFlags: flaggedFalse,
    missedFlags: missed,
    precision: flagged === 0 ? 1 : flaggedTrue / flagged,
    recall: flaggedTrue + missed === 0 ? 1 : flaggedTrue / (flaggedTrue + missed),
  };
}

export interface ThresholdShift {
  /** Multiplicative shift δ: threshold' = 1 − (1 − threshold)·(1 − δ). */
  shift: number;
  thresholds: number[];
  metrics: FlagMetrics;
  /** Flags on tuning hard negatives (rows whose kind is "negative") at the chosen point. */
  negativeFalseFlags: number;
}

/**
 * The spec's constraint: pick thresholds on the tuning split so the flag
 * rule reaches precision ≥ 0.95 while keeping the most recall. Per-label
 * F1-optimal thresholds first, then the smallest uniform shift δ (0.005
 * steps) that meets the precision target. Also recorded: how many tuning
 * hard negatives the chosen point still flags.
 */
export function chooseThresholdShift(
  scoresByLabel: readonly (readonly number[])[],
  tuneRows: readonly TrainingRow[],
  baseThresholds: readonly number[],
): ThresholdShift {
  const flags: FlagRow[] = tuneRows.map((row, index) => ({ flagEligible: row.flagEligible, scoreIndex: index }));
  const negativeRows: FlagRow[] = tuneRows
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row.row.kind === "negative")
    .map((entry) => ({ flagEligible: entry.row.flagEligible, scoreIndex: entry.index }));
  const capped = (threshold: number, shift: number) => Math.min(0.999998, 1 - (1 - threshold) * (1 - shift));
  for (let step = 0; step <= 190; step++) {
    const shift = step * 0.005;
    const thresholds = baseThresholds.map((threshold) => capped(threshold, shift));
    const metrics = flagMetricsFromScores(scoresByLabel, flags, thresholds);
    if (metrics.precision >= TARGET_FLAG_PRECISION || step === 190) {
      return { shift, thresholds, metrics, negativeFalseFlags: flagMetricsFromScores(scoresByLabel, negativeRows, thresholds).flagged };
    }
  }
  throw new Error("unreachable");
}

// ------------------------------------------------------------------ model ----

export interface TrainedModel {
  model: SextortionModelJson;
  labelFits: LabelFit[];
  perLabelThresholds: ThresholdChoice[];
  shift: ThresholdShift;
}

/** Weights below this quantized magnitude are dropped from the export (spec cap: the model file stays ≤ 2 MB). */
export const MIN_ABS_QUANT = 32;

/** Quantize, prune sub-threshold weights, and assemble the model file. */
export function buildModelJson(
  data: TrainingData,
  fits: readonly LabelFit[],
  thresholds: readonly number[],
): SextortionModelJson {
  const labels = {} as SextortionModelJson["labels"];
  SEXTORTION_LABELS.forEach((label, index) => {
    const fit = fits[index];
    const i: number[] = [];
    const v: number[] = [];
    for (let bucket = 0; bucket < fit.weights.length; bucket++) {
      const quantized = Math.round(fit.weights[bucket] * SEXTORTION_QUANT_SCALE);
      if (quantized >= MIN_ABS_QUANT || quantized <= -MIN_ABS_QUANT) {
        i.push(bucket);
        v.push(quantized);
      }
    }
    labels[label] = {
      bias: Math.round(fit.bias * SEXTORTION_QUANT_SCALE),
      threshold: Math.round(thresholds[index] * SEXTORTION_QUANT_SCALE),
      i,
      v,
    };
  });
  return {
    format: SEXTORTION_MODEL_FORMAT,
    modelVersion: TRAINER_VERSION,
    trainedAt: TRAINED_AT,
    generatorSeed: GENERATOR_SEED,
    generatorVersion: GENERATOR_VERSION,
    hashBits: HASH_BITS,
    quantScale: SEXTORTION_QUANT_SCALE,
    trainRows: data.train.length,
    tuneRows: data.tune.length,
    labels,
  };
}

/** Train everything: data → per-label fits → thresholds → flag shift → model. */
export function trainSextortionModel(options: { prepare?: () => TrainingData; maxEpochs?: number; patience?: number } = {}): TrainedModel {
  const data = options.prepare?.() ?? prepareData();
  const labelFits = SEXTORTION_LABELS.map((_, index) => trainLabel(data, index, options));

  // Tuning scores, computed once and shared by threshold choice and the shift sweep.
  const scoresByLabel = labelFits.map((fit) =>
    Array.from(data.tune.map((entry) => sigmoid(scoreRow(fit.weights, fit.bias, entry.buckets)))),
  );
  const perLabelThresholds = labelFits.map((fit, index) =>
    chooseThreshold(scoresByLabel[index], data.tune.map((entry) => entry.y[index])),
  );
  const shift = chooseThresholdShift(
    scoresByLabel,
    data.tune,
    perLabelThresholds.map((choice) => choice.threshold),
  );
  const model = buildModelJson(data, labelFits, shift.thresholds);
  return { model, labelFits, perLabelThresholds, shift };
}
