/**
 * Pure benchmark math: operating-point selection (recall at a fixed
 * false-match rate), ROC AUC and accuracy. No I/O, no floats-with-feet —
 * every function here is pinned by unit tests with hand-computed answers.
 */
export type ScoreKind = "distance" | "similarity";

/** Does a pair with this score match at this threshold? */
export function matches(score: number, threshold: number, kind: ScoreKind): boolean {
  return kind === "distance" ? score <= threshold : score >= threshold;
}

export type OperatingPoint = {
  /** The chosen threshold (match rule per ScoreKind). */
  threshold: number;
  /** Share of genuine pairs matched at the threshold. */
  recall: number;
  /** Observed false-match rate on the impostor pairs at the threshold. */
  fmr: number;
  genuine: number;
  impostor: number;
  genuineMatched: number;
  impostorMatched: number;
};

/**
 * Candidate thresholds: midpoints around every distinct score. When every
 * score is an integer (PDQ Hamming distances are), the midpoints are exact
 * half-integers (12.5), which read cleanly in a report and behave exactly
 * like "match at distance <= 12". For continuous scores the midpoint sits a
 * scale-relative epsilon beside each distinct value, so "just below the
 * smallest impostor" is always a representable operating point.
 */
export function thresholdCandidates(genuine: number[], impostor: number[], kind: ScoreKind): number[] {
  const all = [...genuine, ...impostor];
  if (all.length === 0) return [];
  const integral = all.every((v) => Math.abs(Math.round(v) - v) < 1e-9);
  if (integral) {
    const min = Math.min(...all);
    const max = Math.max(...all);
    const out: number[] = [];
    for (let v = min - 0.5; v <= max + 0.5; v += 1) out.push(v);
    return out;
  }
  const uniq = [...new Set(all)].sort((a, b) => a - b);
  const span = Math.max(...all) - Math.min(...all) || 1;
  const eps = Math.max((span * 1e-9) / Math.max(1, uniq.length), 1e-12);
  const out: number[] = [];
  for (const s of uniq) {
    out.push(kind === "distance" ? s - eps : s + eps);
    out.push(s);
  }
  return out;
}

function evaluate(genuine: number[], impostor: number[], threshold: number, kind: ScoreKind) {
  let genuineMatched = 0;
  let impostorMatched = 0;
  for (const g of genuine) if (matches(g, threshold, kind)) genuineMatched++;
  for (const i of impostor) if (matches(i, threshold, kind)) impostorMatched++;
  return {
    genuineMatched,
    impostorMatched,
    recall: genuine.length === 0 ? 0 : genuineMatched / genuine.length,
    fmr: impostor.length === 0 ? 0 : impostorMatched / impostor.length,
  };
}

/**
 * Among thresholds with equal recall and FMR, take the most permissive one
 * still inside the budget: the operating point that uses the FMR budget the
 * way a deployed system would (for a distance, the largest threshold; for a
 * similarity, the smallest). Ties below the budget, not above it.
 */
function thresholdIsMorePermissive(kind: ScoreKind, candidate: number, best: number): boolean {
  return kind === "distance" ? candidate > best : candidate < best;
}

/**
 * The operating point the E1 metric asks for: the threshold that maximises
 * genuine recall while the false-match rate on the impostor pairs stays at
 * or below `targetFmr` (default 1%). Null when there are no impostor pairs
 * to calibrate against (a set without enough distinct originals).
 */
export function pickOperatingPoint(
  genuine: number[],
  impostor: number[],
  kind: ScoreKind,
  targetFmr = 0.01,
): OperatingPoint | null {
  if (impostor.length === 0) return null;
  let best: OperatingPoint | null = null;
  for (const threshold of thresholdCandidates(genuine, impostor, kind)) {
    const { genuineMatched, impostorMatched, recall, fmr } = evaluate(genuine, impostor, threshold, kind);
    if (fmr > targetFmr + 1e-12) continue;
    if (
      !best ||
      recall > best.recall + 1e-12 ||
      (Math.abs(recall - best.recall) <= 1e-12 &&
        (fmr < best.fmr - 1e-12 ||
          (Math.abs(fmr - best.fmr) <= 1e-12 && thresholdIsMorePermissive(kind, threshold, best.threshold))))
    ) {
      best = { threshold, recall, fmr, genuine: genuine.length, impostor: impostor.length, genuineMatched, impostorMatched };
    }
  }
  return best;
}

/**
 * Rank-based ROC AUC (Mann-Whitney): the probability that a random positive
 * scores higher (more "fake") than a random negative, ties counting half.
 * Null when either side is empty (AUC is undefined then).
 */
export function auc(positives: number[], negatives: number[]): number | null {
  if (positives.length === 0 || negatives.length === 0) return null;
  const rows = [
    ...positives.map((s) => ({ s, pos: true })),
    ...negatives.map((s) => ({ s, pos: false })),
  ].sort((a, b) => a.s - b.s);
  const nP = positives.length;
  const nN = negatives.length;
  // Walk tie groups in ascending score order. A positive beats every negative
  // in a strictly lower group and splits even with a negative in its own
  // group (Mann-Whitney U).
  let i = 0;
  let concordant = 0;
  let negBelow = 0; // negatives with a strictly smaller score
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j]!.s === rows[i]!.s) j++;
    const posIn = rows.slice(i, j).filter((r) => r.pos).length;
    const negIn = j - i - posIn;
    concordant += posIn * negBelow + 0.5 * posIn * negIn;
    negBelow += negIn;
    i = j;
  }
  return concordant / (nP * nN);
}

/** Share of correct binary predictions (predicted fake iff score >= cut). */
export function accuracy(labels: boolean[], scores: number[], cut = 0.5): number | null {
  if (labels.length === 0 || labels.length !== scores.length) return null;
  let ok = 0;
  for (let i = 0; i < labels.length; i++) if ((scores[i]! >= cut) === labels[i]!) ok++;
  return ok / labels.length;
}

export function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function round(x: number | null, digits = 4): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
