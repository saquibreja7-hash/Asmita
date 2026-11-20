/**
 * Hashing with the PRODUCTION pipeline and the pure aggregation math.
 *
 * The hashing side imports the crawler's own decode recipe (crawler/src/
 * prepare.ts, which resolves sharp from crawler/node_modules) and our PDQ
 * (asmita/src/lib/pdq/pdq.ts) — imported, never copied, so the harness
 * measures exactly what production runs. Run `npm ci` in crawler/ first.
 *
 * The aggregation functions are pure and unit-tested in tests/measure.test.ts.
 */
import { computePdqHash, hammingDistance, PDQ_MATCH_THRESHOLD } from "../../../asmita/src/lib/pdq/pdq.ts";
import { prepareForPdq } from "../../../crawler/src/prepare.ts";
import { MIN_QUALITY } from "../../../crawler/src/match/matcher.ts";

/** Thresholds the spec asks for; 31 is the production threshold (PDQ_MATCH_THRESHOLD). */
export const THRESHOLDS = [20, 25, 31, 40] as const;
export type Threshold = (typeof THRESHOLDS)[number];

/** The crawler skips a found image whose PDQ quality is below MIN_QUALITY (50). */
export const PRODUCTION_MIN_QUALITY = MIN_QUALITY;

export type Hashed = {
  name: string;
  /** File name under out/images/ (for the Python reference step). */
  file: string;
  cls: string;
  format: string;
  width: number;
  height: number;
  hash: string;
  quality: number;
  /** For altered copies: the original's name. */
  originalOf?: string;
  group?: string;
  severity?: string;
};

export async function hashWithPipeline(buffer: Buffer): Promise<{ hash: string; quality: number; width: number; height: number }> {
  const input = await prepareForPdq(buffer);
  const { hash, quality } = computePdqHash(input);
  return { hash, quality, width: input.width, height: input.height };
}

export type AlterationRow = {
  group: string;
  severity: string;
  /** Hamming distance between the original's hash and the copy's hash. */
  distance: number;
  /** The copy's PDQ quality (production skips below 50). */
  quality: number;
  cls: string;
};

export type GroupStats = {
  group: string;
  severity: string;
  n: number;
  /** Share caught (distance <= t) per threshold, as a fraction. */
  caught: Record<Threshold, number>;
  /** Share caught at the production threshold AND not quality-skipped. */
  caughtProduction: number;
  /** Copies whose quality fell below the production floor. */
  lowQuality: number;
  meanDistance: number;
  p95Distance: number;
  maxDistance: number;
};

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!;
};

export function stats(xs: number[]): { n: number; min: number; median: number; mean: number; p95: number; max: number } {
  if (xs.length === 0) return { n: 0, min: 0, median: 0, mean: 0, p95: 0, max: 0 };
  return {
    n: xs.length,
    min: Math.min(...xs),
    median: pct(xs, 0.5),
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    p95: pct(xs, 0.95),
    max: Math.max(...xs),
  };
}

/**
 * Aggregate altered copies per (group, severity): the share caught at each
 * threshold, plus the production view (within 31 AND quality >= 50, because
 * the crawler skips a found image below that quality whatever its distance).
 */
export function groupStats(rows: AlterationRow[], thresholds: readonly Threshold[] = THRESHOLDS): GroupStats[] {
  const keys: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.group}|${r.severity}`;
    if (!seen.has(k)) { seen.add(k); keys.push([r.group, r.severity]); }
  }
  return keys.map(([group, severity]) => {
    const rs = rows.filter((r) => r.group === group && r.severity === severity);
    const dists = rs.map((r) => r.distance);
    const s = stats(dists);
    const caught = {} as Record<Threshold, number>;
    for (const t of thresholds)
      caught[t] = rs.filter((r) => r.distance <= t).length / rs.length;
    const lowQuality = rs.filter((r) => r.quality < PRODUCTION_MIN_QUALITY).length;
    const caughtProduction =
      rs.filter((r) => r.distance <= PDQ_MATCH_THRESHOLD && r.quality >= PRODUCTION_MIN_QUALITY).length / rs.length;
    return {
      group, severity, n: rs.length, caught, caughtProduction, lowQuality,
      meanDistance: s.mean, p95Distance: s.p95, maxDistance: s.max,
    };
  });
}

/**
 * Pool every severity of a group into one row (same fields), so the summary
 * table can show one line per alteration kind.
 */
export function pooledGroupStats(rows: AlterationRow[], thresholds: readonly Threshold[] = THRESHOLDS): GroupStats[] {
  return groupStats(rows.map((r) => ({ ...r, severity: "all" })), thresholds);
}

export type FalseMatchStats = {
  pairs: number;
  /** Pairs of unrelated originals within each threshold. */
  within: Record<Threshold, number>;
  /** The same count restricted to pairs where BOTH images pass the quality floor
   *  (the only pairs production could actually match). */
  withinProductionQuality: Record<Threshold, number>;
  /** Tightest unrelated pair in the whole set. */
  minDistance: number;
  medianDistance: number;
  meanDistance: number;
  maxDistance: number;
};

/**
 * False-match pressure: distances between every pair of UNRELATED originals.
 * In production terms, the pool holds one original's hash and the crawler
 * hashes the other image.
 */
export function falseMatchStats(
  originals: Array<{ name: string; hash: string; quality: number }>,
  thresholds: readonly Threshold[] = THRESHOLDS,
): FalseMatchStats {
  const pairs: Array<{ a: string; b: string; distance: number; bothOk: boolean }> = [];
  for (let i = 0; i < originals.length; i++) {
    for (let j = i + 1; j < originals.length; j++) {
      const a = originals[i]!, b = originals[j]!;
      const distance = hammingDistance(a.hash, b.hash);
      pairs.push({
        a: a.name, b: b.name, distance,
        bothOk: a.quality >= PRODUCTION_MIN_QUALITY && b.quality >= PRODUCTION_MIN_QUALITY,
      });
    }
  }
  const dists = pairs.map((p) => p.distance);
  const within = {} as Record<Threshold, number>;
  const withinProductionQuality = {} as Record<Threshold, number>;
  for (const t of thresholds) {
    within[t] = pairs.filter((p) => p.distance <= t).length;
    withinProductionQuality[t] = pairs.filter((p) => p.distance <= t && p.bothOk).length;
  }
  const s = stats(dists);
  return {
    pairs: pairs.length, within, withinProductionQuality,
    minDistance: s.min, medianDistance: s.median, meanDistance: s.mean, maxDistance: s.max,
  };
}

export { hammingDistance, computePdqHash, PDQ_MATCH_THRESHOLD };
