/**
 * WP113 evaluation statistics: per-condition ROC-AUC, accuracy at the 0.5
 * cut and the no-face rate, each with a bootstrap 95% confidence interval.
 *
 * Pure functions, deterministic (a seeded PRNG, mulberry32), no I/O. The
 * bootstrap resamples the scored/no-face items with replacement and takes
 * percentile intervals, so a condition with N items gets an interval that
 * honestly reflects N — small samples read as wide.
 */
import { accuracy, auc, round } from "./metrics.ts";

export type GendOutcome = { score: number } | { noFace: true } | { error: string };

export type GendScoredItem = { label: boolean; outcome: GendOutcome };

/** Deterministic PRNG (mulberry32): the same seed gives the same interval. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resample indices with replacement. */
function resample(n: number, rand: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(rand() * n));
  return out;
}

/** The [2.5%, 97.5%] percentile interval of a statistic over bootstrap replicates. */
export function bootstrapCi(
  items: GendScoredItem[],
  statistic: (sample: GendScoredItem[]) => number | null,
  replicates = 2000,
  seed = 20261122,
): { lo: number; hi: number } | null {
  if (items.length === 0) return null;
  const rand = mulberry32(seed);
  const values: number[] = [];
  for (let r = 0; r < replicates; r++) {
    const sample = resample(items.length, rand).map((i) => items[i]!);
    const value = statistic(sample);
    if (value !== null) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const lo = values[Math.floor((values.length - 1) * 0.025)]!;
  const hi = values[Math.ceil((values.length - 1) * 0.975)]!;
  return { lo: round(lo, 4)!, hi: round(hi, 4)! };
}

export type GendConditionStat = {
  condition: string;
  label: string;
  nReal: number;
  nFake: number;
  errors: number;
  /** ROC-AUC over the items that returned a score. Null if one class only. */
  auc: number | null;
  aucCi: { lo: number; hi: number } | null;
  /** Accuracy at the 0.5 cut over the items that returned a score. */
  accuracy: number | null;
  accuracyCi: { lo: number; hi: number } | null;
  /** Share of real items the service could not score (no face found). */
  noFaceReal: number | null;
  noFaceRealCi: { lo: number; hi: number } | null;
  /** Share of fake items the service could not score — a missed detection. */
  noFaceFake: number | null;
  noFaceFakeCi: { lo: number; hi: number } | null;
  scored: number;
};

/** The point estimate the CI wraps: AUC over the scored items of the sample. */
function sampleAuc(sample: GendScoredItem[]): number | null {
  const scored = scoredOf(sample);
  if (scored.length === 0) return null;
  return auc(
    scored.filter((i) => i.label).map((i) => (i.outcome as { score: number }).score),
    scored.filter((i) => !i.label).map((i) => (i.outcome as { score: number }).score),
  );
}

function sampleAccuracy(sample: GendScoredItem[]): number | null {
  const scored = scoredOf(sample);
  if (scored.length === 0) return null;
  return accuracy(scored.map((i) => i.label), scored.map((i) => (i.outcome as { score: number }).score));
}

function sampleNoFaceRate(label: boolean): (sample: GendScoredItem[]) => number | null {
  return (sample) => {
    const ofLabel = sample.filter((i) => i.label === label);
    if (ofLabel.length === 0) return null;
    return ofLabel.filter((i) => "noFace" in i.outcome && i.outcome.noFace === true).length / ofLabel.length;
  };
}

function scoredOf(items: GendScoredItem[]): GendScoredItem[] {
  return items.filter((i) => "score" in i.outcome);
}

/** All metrics for one condition, point estimates plus bootstrap 95% CIs. */
export function conditionStats(condition: string, label: string, items: GendScoredItem[], replicates = 2000, seed = 20261122): GendConditionStat {
  const reals = items.filter((i) => !i.label);
  const fakes = items.filter((i) => i.label);
  const errors = items.filter((i) => "error" in i.outcome).length;
  const scored = scoredOf(items);
  return {
    condition,
    label,
    nReal: reals.length,
    nFake: fakes.length,
    errors,
    auc: round(sampleAuc(items), 4),
    aucCi: bootstrapCi(items, sampleAuc, replicates, seed),
    accuracy: round(sampleAccuracy(items), 4),
    accuracyCi: bootstrapCi(items, sampleAccuracy, replicates, seed),
    noFaceReal: round(sampleNoFaceRate(false)(items), 4),
    noFaceRealCi: bootstrapCi(items, sampleNoFaceRate(false), replicates, seed),
    noFaceFake: round(sampleNoFaceRate(true)(items), 4),
    noFaceFakeCi: bootstrapCi(items, sampleNoFaceRate(true), replicates, seed),
    scored: scored.length,
  };
}
