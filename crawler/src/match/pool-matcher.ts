/**
 * The whole pool the crawler matches a crawled image against
 * (video-fingerprints spec WP20): the image fingerprints, through the
 * unchanged brute-force Matcher, plus a multi-index-hashing frame index over
 * the video fingerprints the pool now serves as `{ id, kind: "video",
 * frames }` (`src/match/video-index.ts`).
 *
 * Same interface and lifecycle as the Matcher alone, so the crawler's
 * withdrawal, re-sync and staleness rules cover both kinds with no second
 * path: `withdraw` hits both indexes, `has`/`idSetView` answer for both,
 * and one pool age gates both. A match is a match whatever kind it came
 * from — the finding contract is unchanged (the fingerprint id is the pool
 * id, the video submission's), and every hit is queued for human review
 * like an image hit. `kind` is carried on each result only so the run
 * summary can count video matches; it never reaches the app.
 */
import { Matcher, type Match, type PoolEntry } from "./matcher.ts";
import { VideoFrameIndex, type VideoPoolEntry } from "./video-index.ts";

export type PoolFingerprint = PoolEntry | VideoPoolEntry;
export type PoolMatch = Match & { kind: "image" | "video" };

export class PoolMatcher {
  readonly images: Matcher;
  readonly videos: VideoFrameIndex;
  /** Every pool id, image and video alike. */
  private readonly ids: Set<string>;

  constructor(entries: readonly PoolFingerprint[], poolThreshold: number) {
    const imageEntries: PoolEntry[] = [];
    const videoEntries: VideoPoolEntry[] = [];
    for (const entry of entries) {
      if ("kind" in entry) videoEntries.push(entry);
      else imageEntries.push(entry);
    }
    this.images = new Matcher(imageEntries, poolThreshold);
    this.videos = new VideoFrameIndex(videoEntries, poolThreshold);
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
   * no longer accepted). Covers both kinds; takes effect next match().
   */
  withdraw(id: string): void {
    this.images.withdraw(id);
    this.videos.withdraw(id);
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
}
