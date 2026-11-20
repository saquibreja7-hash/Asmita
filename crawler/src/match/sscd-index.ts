/**
 * Brute-force cosine index over the pool's SSCD embeddings (WP28).
 *
 * The pool serves each image fingerprint's embeddings as plain float arrays
 * (L2-normalised by the model, so cosine similarity is a dot product). Every
 * vector of one fingerprint belongs to one confirmed copy of the survivor's
 * image; a query matches a fingerprint when its best similarity over the
 * fingerprint's vectors reaches the threshold. Brute force is fine at this
 * scale: a vector is 512 floats (2 KiB as Float32), 10,000 embeddings are
 * ~20 MB and scan in well under a millisecond — the pool carries at most 16
 * vectors per fingerprint and embeddings exist only for analyst-confirmed
 * copies, so the real count is far smaller. The bound is documented in
 * asmita/docs/adr/008-sscd-second-layer.md; an ANN index would be the next
 * step if the pool ever carried tens of thousands of embeddings.
 *
 * Same lifecycle rules as the Matcher and the video frame index: one index
 * per pool build, `withdraw` takes effect on the next query, and the pool
 * age gate sits in the caller. Vectors live only in this process's memory
 * and are never logged (counts only, rule 3).
 */

export type SscdHit = { fingerprintId: string; similarity: number };

export class EmbeddingIndex {
  private readonly ids: string[] = [];
  private readonly idSet: Set<string> = new Set();
  /** Every fingerprint's vectors, kept per fingerprint (never flattened: a query scores one fingerprint at a time). */
  private readonly byId = new Map<string, number[][]>();
  private readonly withdrawn = new Set<string>();

  constructor(
    entries: readonly { id: string; vectors: readonly number[][] }[],
    private readonly threshold: number,
  ) {
    for (const entry of entries) {
      // An entry with no vectors is not in the index at all (the app serves
      // an sscd block only when there is something in it); a repeated id
      // keeps its first vectors (the pool builder never repeats ids).
      if (entry.vectors.length === 0 || this.idSet.has(entry.id)) continue;
      this.idSet.add(entry.id);
      this.ids.push(entry.id);
      this.byId.set(entry.id, entry.vectors.map((v) => [...v]));
    }
  }

  /** Fingerprints that carry at least one embedding. */
  get size(): number {
    return this.ids.length;
  }

  has(id: string): boolean {
    return this.idSet.has(id);
  }

  hasEmbeddings(id: string): boolean {
    return this.idSet.has(id) && !this.withdrawn.has(id);
  }

  /** Stop matching a fingerprint immediately (pool id no longer accepted). */
  withdraw(id: string): void {
    this.withdrawn.add(id);
    this.idSet.delete(id);
  }

  /**
   * The best cosine similarity between the query vector and one
   * fingerprint's embeddings, or null when the fingerprint has none (or is
   * withdrawn, or the query's dimension does not match the stored vectors —
   * a server bug that must never produce a number). Used for the borderline
   * PDQ score the analyst sees.
   */
  score(fingerprintId: string, query: readonly number[]): number | null {
    if (this.withdrawn.has(fingerprintId)) return null;
    const vectors = this.byId.get(fingerprintId);
    if (vectors === undefined || vectors.length === 0 || vectors[0]!.length !== query.length) return null;
    let best = -1;
    for (const v of vectors) best = Math.max(best, dot(v, query));
    return best;
  }

  /**
   * Every fingerprint whose best similarity reaches the threshold, best
   * first. One image can match several fingerprints (the same picture
   * submitted by different survivors); each is a separate finding.
   */
  match(query: readonly number[]): SscdHit[] {
    if (this.ids.length === 0) return [];
    const hits: SscdHit[] = [];
    for (const id of this.ids) {
      if (this.withdrawn.has(id)) continue;
      const similarity = this.score(id, query);
      if (similarity !== null && similarity >= this.threshold) hits.push({ fingerprintId: id, similarity });
    }
    hits.sort((a, b) => b.similarity - a.similarity || (a.fingerprintId < b.fingerprintId ? -1 : 1));
    return hits;
  }
}

/** Cosine similarity of two L2-normalised vectors (= dot product). */
export function dot(a: readonly number[], b: readonly number[]): number {
  // A pool vector and a query of different dimensions can only be a server
  // bug; the safest answer is "no similarity", never a wrong number.
  if (a.length !== b.length) return -1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}
