/*
 * WP116 (docs/research/research-tools-spec.md, Track D): a deterministic,
 * seeded PRNG for the synthetic training data generator.
 *
 * mulberry32: a small, well-known 32-bit generator. Integer math only, so
 * the same seed gives the same stream on every machine and Node version.
 * Nothing here uses Math.random, Date.now or any other nondeterministic
 * source, so the whole dataset is byte-identical on every run.
 */

/** FNV-1a 32-bit: a deterministic string → seed hash for per-row streams. */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts.join("|")) {
    hash ^= part.codePointAt(0)!;
    // 32-bit unsigned multiply, per FNV-1a.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, max). */
  int(max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  /** One array entry, uniformly. */
  pick<T>(items: readonly T[]): T;
}

export function rngFromSeed(seed: number): Rng {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int(max) {
      return Math.floor(next() * max);
    },
    chance(probability) {
      return next() < probability;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
  };
}

/** A row-deterministic RNG: the same row id gives the same choices forever. */
export function rowRng(seed: number, ...key: (string | number)[]): Rng {
  return rngFromSeed(hashSeed(seed, ...key));
}
