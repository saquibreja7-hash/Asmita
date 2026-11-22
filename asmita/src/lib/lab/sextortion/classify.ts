import { extractFeatureBuckets } from "./features";
import modelJson from "./model.json";
import {
  decodeSextortionModel,
  sigmoid,
  type DecodedSextortionModel,
  type SextortionModelJson,
} from "./model-format";
import {
  SEXTORTION_CORE_LABELS,
  SEXTORTION_LABELS,
  SEXTORTION_SUPPORTING_LABELS,
  type SextortionLabel,
} from "./taxonomy";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): the Worker-side
 * sextortion classifier. One-vs-rest logistic regression over hashed
 * features (features.ts), weights from the committed model.json (written by
 * tools/lab-sextortion/src/train.ts).
 *
 * Everything happens in memory, in this isolate: no network, no storage,
 * no logging — the pasted text never leaves this function. A
 * classification is a set of labels plus one boolean; the caller (the
 * message-check route) turns labels into plain sentences and advice, and
 * the page never sees a score.
 *
 * Decision logic (spec): a message is a likely sextortion threat only when
 * THREAT_EXPOSE or CLAIM_HAS_MEDIA is at or above its threshold AND at
 * least one demand/audience/deadline/impersonation label is at or above
 * its threshold. A single keyword is never enough.
 */

const MODEL = modelJson as unknown as SextortionModelJson;

// One decode per model object (the committed file, or one the tests/tool
// load from disk). Decoding is pure and idempotent.
const decodedCache = new WeakMap<SextortionModelJson, DecodedSextortionModel>();

function decodedOf(model: SextortionModelJson): DecodedSextortionModel {
  let decoded = decodedCache.get(model);
  if (!decoded) {
    decoded = decodeSextortionModel(model);
    decodedCache.set(model, decoded);
  }
  return decoded;
}

export interface SextortionClassification {
  /**
   * The labels at or above their thresholds, in canonical order. MINOR_SIGNAL
   * is included (the route uses it to send under-18s to /minor-support);
   * NOT_THREAT is never included — "looks harmless" is not a finding the
   * page may show, and the none-match copy covers it.
   */
  labels: SextortionLabel[];
  /** The combination rule above. Never a verdict on a person or case. */
  flagged: boolean;
}

/** Every label's decision threshold, dequantized, in canonical label order. */
export function sextortionThresholds(model: SextortionModelJson = MODEL): Record<SextortionLabel, number> {
  const decoded = decodedOf(model);
  const out = {} as Record<SextortionLabel, number>;
  decoded.labels.forEach((label, index) => {
    out[label] = decoded.threshold[index];
  });
  return out;
}

/**
 * The combination rule, on its own, so tests can drive it with synthetic
 * scores: core label ≥ threshold AND supporting label ≥ threshold.
 */
export function flagFromScores(
  scores: ReadonlyMap<SextortionLabel, number>,
  model: SextortionModelJson = MODEL,
): boolean {
  const thresholds = sextortionThresholds(model);
  const coreHit = SEXTORTION_CORE_LABELS.some((label) => (scores.get(label) ?? 0) >= thresholds[label]);
  if (!coreHit) return false;
  return SEXTORTION_SUPPORTING_LABELS.some((label) => (scores.get(label) ?? 0) >= thresholds[label]);
}

/** Classify against an explicit model (the tool's eval report and tests pass one loaded from disk). */
export function classifyWithModel(
  model: SextortionModelJson,
  text: string,
): SextortionClassification {
  const decoded = decodedOf(model);
  const buckets = extractFeatureBuckets(text, decoded.hashBits);
  const scores = new Map<SextortionLabel, number>();
  const z = new Float64Array(decoded.bias); // start at the biases
  for (const bucket of buckets) {
    const perBucket = decoded.weights.get(bucket);
    if (perBucket === undefined) continue;
    for (let index = 0; index < z.length; index++) {
      const weight = perBucket[index];
      if (weight !== 0) z[index] += weight;
    }
  }
  const labels: SextortionLabel[] = [];
  decoded.labels.forEach((label, index) => {
    const score = sigmoid(z[index]);
    scores.set(label, score);
    if (score >= decoded.threshold[index] && label !== "NOT_THREAT") labels.push(label);
  });
  return { labels, flagged: flagFromScores(scores, model) };
}

/** Classify a pasted message with the committed model. Synchronous, in memory, nothing stored. */
export function classifySextortion(text: string): SextortionClassification {
  return classifyWithModel(MODEL, text);
}

/** Facts about the committed model, for tests and documentation. */
export function sextortionModelInfo(model: SextortionModelJson = MODEL) {
  return {
    format: model.format,
    modelVersion: model.modelVersion,
    trainedAt: model.trainedAt,
    generatorSeed: model.generatorSeed,
    generatorVersion: model.generatorVersion,
    hashBits: model.hashBits,
    trainRows: model.trainRows,
    tuneRows: model.tuneRows,
    labelCount: Object.keys(model.labels).length,
    labelList: SEXTORTION_LABELS,
  };
}
