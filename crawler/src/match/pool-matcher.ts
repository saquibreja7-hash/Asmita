/**
 * The whole pool the crawler matches a crawled image against
 * (video-fingerprints spec WP20): the image fingerprints, through the
 * unchanged brute-force Matcher, plus a multi-index-hashing frame index over
 * the video fingerprints the pool now serves as `{ id, kind: "video",
 * frames }` (`src/match/video-index.ts`).
 *
 * WP28 adds a third index behind the same interface: the SSCD embeddings of
 * analyst-confirmed copies the pool serves on image entries
 * (`sscd: { model, version, vectors }`, `src/match/sscd-index.ts`), built
 * only when the run enables the second layer — otherwise the pool's sscd
 * blocks are ignored and nothing about matching changes.
 *
 * Same interface and lifecycle as the Matcher alone, so the crawler's
 * withdrawal, re-sync and staleness rules cover every kind with no second
 * path: `withdraw` hits all indexes, `has`/`idSetView` answer for all,
 * and one pool age gates all. A match is a match whatever kind it came
 * from — the finding contract is unchanged (the fingerprint id is the pool
 * id, the video submission's), and every hit is queued for human review
 * like an image hit. `kind` is carried on each result only so the run
 * summary can count video matches; it never reaches the app.
 */
import { Matcher, type Match, type PoolEntry } from "./matcher.ts";
import { VideoFrameIndex, type VideoPoolEntry } from "./video-index.ts";
import { EmbeddingIndex, type SscdHit } from "./sscd-index.ts";
import type { PoolSscd } from "../asmita/client.ts";

export type PoolFingerprint = (PoolEntry & { sscd?: PoolSscd }) | VideoPoolEntry;
export type PoolMatch = Match & { kind: "image" | "video" };

export class PoolMatcher {
  readonly images: Matcher;
  readonly videos: VideoFrameIndex;
  /**
   * The SSCD embeddings of confirmed copies (WP28): empty while the second
   * layer is off, so every sscd method below is a no-op then.
   */
  readonly embeddings: EmbeddingIndex;
  /** Every pool id, image and video alike. */
  private readonly ids: Set<string>;

  constructor(entries: readonly PoolFingerprint[], poolThreshold: number, sscdThreshold?: number) {
    const imageEntries: PoolEntry[] = [];
    const videoEntries: VideoPoolEntry[] = [];
    const embeddingEntries: { id: string; vectors: number[][] }[] = [];
    for (const entry of entries) {
      if ("kind" in entry) {
        videoEntries.push(entry);
        continue;
      }
      imageEntries.push(entry);
      if (sscdThreshold !== undefined && entry.sscd !== undefined) {
        embeddingEntries.push({ id: entry.id, vectors: entry.sscd.vectors });
      }
    }
    this.images = new Matcher(imageEntries, poolThreshold);
    this.videos = new VideoFrameIndex(videoEntries, poolThreshold);
    this.embeddings = new EmbeddingIndex(embeddingEntries, sscdThreshold ?? 1);
    this.ids = new Set([...this.images.idSetView(), ...this.videos.idSetView()]);
  }

  /** Image fingerprints in the pool. */
  get imageSize(): number {
    return this.images.size;
  }

  /** Video fingerprints in the pool. */
  get videoCount(): number {
    return this.videos.videoCount;
  }

  /** Frame hashes indexed across all videos. */
  get frameCount(): number {
    return this.videos.frameCount;
  }

  /** Fingerprints whose confirmed copies carry SSCD embeddings (WP28). */
  get embeddingCount(): number {
    return this.embeddings.size;
  }

  /** Every pool entry, image and video alike. */
  get size(): number {
    return this.imageSize + this.videoCount;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  idSetView(): ReadonlySet<string> {
    return this.ids;
  }

  /**
   * Stop matching a fingerprint immediately (the server said its pool id is
   * no longer accepted). Covers every kind, embeddings included; takes
   * effect next match().
   */
  withdraw(id: string): void {
    this.images.withdraw(id);
    this.videos.withdraw(id);
    this.embeddings.withdraw(id);
    this.ids.delete(id);
  }

  /**
   * Every pool entry within the threshold, best (lowest distance) first —
   * image entries and videos together. One image can match several image
   * entries and several videos; each is a separate finding, as today.
   */
  match(hex: string): PoolMatch[] {
    const out: PoolMatch[] = [];
    for (const hit of this.images.match(hex)) out.push({ ...hit, kind: "image" });
    for (const hit of this.videos.match(hex)) out.push({ ...hit, kind: "video" });
    out.sort((a, b) => a.distance - b.distance || (a.fingerprintId < b.fingerprintId ? -1 : 1));
    return out;
  }

  /**
   * The second layer (WP28): every fingerprint whose confirmed copies'
   * embeddings sit within the configured cosine similarity of the query
   * vector, best first. Empty while the layer is off (the index is empty).
   */
  matchEmbeddings(vector: readonly number[]): SscdHit[] {
    return this.embeddings.match(vector);
  }

  /**
   * The borderline score an analyst sees on a PDQ match (WP28): the best
   * similarity between the crawled image and that fingerprint's confirmed
   * copies. Null when the fingerprint carries no embeddings.
   */
  embeddingScore(fingerprintId: string, vector: readonly number[]): number | null {
    return this.embeddings.score(fingerprintId, vector);
  }

  /** Whether the second layer could ever fire for this fingerprint (WP28). */
  hasEmbeddings(fingerprintId: string): boolean {
    return this.embeddings.hasEmbeddings(fingerprintId);
  }
}
