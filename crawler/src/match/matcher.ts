/**
 * Brute-force Hamming matcher over the fingerprint pool.
 *
 * Each 256-bit PDQ hash is packed into eight 32-bit words in one contiguous
 * Uint32Array; a query XORs word by word and counts bits with a branch-free
 * SWAR popcount, bailing out of an entry as soon as its running distance
 * exceeds the threshold. At the pool sizes Asmita expects (well under 1M)
 * this is fast enough that no index (BK-tree, multi-index hashing) is needed;
 * see scripts/bench-matcher.ts.
 *
 * Only the 64-hex strings validated by the pool schema reach here. The
 * matcher does not reimplement PDQ: dihedral (rotated/flipped) variants are
 * not generated because asmita/src/lib/pdq/pdq.ts does not offer them.
 */
import { PDQ_MATCH_THRESHOLD } from "../pdq.ts";

export const MIN_QUALITY = 50;

export type PoolEntry = { id: string; pdq: string; quality: number };
export type Match = { fingerprintId: string; distance: number };

const WORDS = 8;

export function packHex(hex: string, out: Uint32Array, offset: number): void {
  for (let w = 0; w < WORDS; w++) out[offset + w] = parseInt(hex.slice(w * 8, w * 8 + 8), 16) >>> 0;
}

export function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** The effective threshold: what the pool says, never above PDQ_MATCH_THRESHOLD. */
export function effectiveThreshold(poolThreshold: number): number {
  if (!Number.isFinite(poolThreshold) || poolThreshold < 0) return 0;
  return Math.min(Math.floor(poolThreshold), PDQ_MATCH_THRESHOLD);
}

export class Matcher {
  readonly size: number;
  readonly threshold: number;
  private readonly words: Uint32Array;
  private readonly ids: string[];
  private readonly idSet: Set<string>;
  private readonly withdrawn = new Set<string>();

  constructor(entries: readonly PoolEntry[], poolThreshold: number) {
    this.threshold = effectiveThreshold(poolThreshold);
    this.size = entries.length;
    this.words = new Uint32Array(entries.length * WORDS);
    this.ids = new Array<string>(entries.length);
    entries.forEach((e, i) => {
      packHex(e.pdq, this.words, i * WORDS);
      this.ids[i] = e.id;
    });
    this.idSet = new Set(this.ids);
  }

  has(id: string): boolean {
    return this.idSet.has(id);
  }

  idSetView(): ReadonlySet<string> {
    return this.idSet;
  }

  /**
   * Stop matching a fingerprint immediately (the server said it is no longer
   * accepted, e.g. consent withdrawn). Takes effect for the next match() call.
   */
  withdraw(id: string): void {
    this.withdrawn.add(id);
    this.idSet.delete(id);
  }

  /**
   * Every pool entry within the threshold, best (lowest distance) first,
   * one result per distinct fingerprint id. Several entries can match one
   * image (the same picture submitted by different survivors); each is a
   * separate finding.
   */
  match(hex: string): Match[] {
    const q = new Uint32Array(WORDS);
    packHex(hex, q, 0);
    const q0 = q[0]!, q1 = q[1]!, q2 = q[2]!, q3 = q[3]!, q4 = q[4]!, q5 = q[5]!, q6 = q[6]!, q7 = q[7]!;
    const t = this.threshold;
    const w = this.words;
    const found = new Map<string, number>();
    for (let i = 0, o = 0; i < this.size; i++, o += WORDS) {
      let d = popcount32(w[o]! ^ q0) + popcount32(w[o + 1]! ^ q1) + popcount32(w[o + 2]! ^ q2) + popcount32(w[o + 3]! ^ q3);
      if (d > t) continue;
      d += popcount32(w[o + 4]! ^ q4) + popcount32(w[o + 5]! ^ q5) + popcount32(w[o + 6]! ^ q6) + popcount32(w[o + 7]! ^ q7);
      if (d > t) continue;
      const id = this.ids[i]!;
      if (this.withdrawn.size > 0 && this.withdrawn.has(id)) continue;
      const prev = found.get(id);
      if (prev === undefined || d < prev) found.set(id, d);
    }
    return [...found.entries()]
      .map(([fingerprintId, distance]) => ({ fingerprintId, distance }))
      .sort((a, b) => a.distance - b.distance || (a.fingerprintId < b.fingerprintId ? -1 : 1));
  }
}
