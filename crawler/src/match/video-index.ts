/**
 * Multi-index-hashing lookup over video frame hashes (video-fingerprints
 * spec WP20).
 *
 * The pool serves a video fingerprint as one entry per video with its kept
 * frame hashes (vPDQ: the PDQ hash of one frame per second of playback,
 * quality-filtered and deduplicated, at most 1000 frames). One survivor
 * video therefore contributes hundreds of 256-bit hashes, and at the
 * spec's scale (100k+ frames across all videos) a brute-force scan per
 * crawled image — the Matcher's approach, fine for one hash per pool entry
 * — would dominate the crawl. So each frame hash is split into 16 chunks
 * of 16 bits and indexed once per chunk (multi-index hashing): a query
 * within Hamming distance t of a frame must sit close on at least one
 * chunk — if every chunk differed in at least floor(t/16)+1 bits the total
 * would already exceed t — so probing every chunk's table for near-exact
 * matches (Hamming radius floor(t/16), which is 1 at the capped threshold
 * 31) finds every frame within t while touching a small fraction of the
 * pool. Candidates are then verified with the same full 256-bit SWAR
 * popcount the Matcher uses; a frame can be probed through more than one
 * chunk (a near-duplicate agrees on most of them), which only costs one
 * extra verification per repeat.
 *
 * A BK-tree was rejected: at radius 31 of 256 bits its search visits most
 * of the tree, so it degenerates towards a linear scan at exactly the
 * pool sizes the spec asks to stay fast at.
 *
 * Match rule (Phase 2): one preview image within the pool threshold of any
 * frame of a video is a finding for that video's pool id — the thumbnail
 * clause of the video spec's match rule. The 3-frames clause needs a crawl
 * that samples an online video, which Phase 2 never does (no video bytes
 * are fetched); the crawler reports every hit for human review, as images.
 * Memory: the packed frames plus 16 sorted (chunk value, frame index)
 * tables, ~128 bytes per frame; nothing is ever logged but counts.
 */
import { effectiveThreshold, packHex, popcount32 } from "./matcher.ts";

export type VideoPoolEntry = { id: string; kind: "video"; frames: readonly string[] };
export type VideoMatch = { fingerprintId: string; distance: number };

/** The 256-bit hash is split into this many equally sized chunks. */
const CHUNKS = 16;
/** Bits per chunk: 256 / 16. */
const CHUNK_BITS = 256 / CHUNKS;
/** 32-bit words per hash, as packed by the Matcher's packHex. */
const WORDS = 8;
/** Distinct values one 16-bit chunk can take. */
const CHUNK_VALUES = 1 << CHUNK_BITS;

/** The value of chunk `c` of an already packed 8-word hash. */
function chunkOf(words: Uint32Array, c: number): number {
  return c % 2 === 0 ? words[c >> 1]! >>> 16 : words[c >> 1]! & 0xffff;
}

/**
 * Every 16-bit value within Hamming `radius` of `value`: the probe keys of
 * one chunk table. Radius 0 is the exact value alone; radius 1 adds the 16
 * one-bit neighbours. Bounded by the capped threshold (radius 1), but
 * correct for any radius.
 */
export function chunkNeighborhood(value: number, radius: number): number[] {
  const out = [value >>> 0];
  if (radius <= 0) return out;
  const walk = (start: number, remaining: number, acc: number): void => {
    if (remaining === 0) {
      out.push((value ^ acc) >>> 0);
      return;
    }
    for (let bit = start; bit <= CHUNK_BITS - remaining; bit++) walk(bit + 1, remaining - 1, acc | (1 << bit));
  };
  for (let size = 1; size <= radius; size++) walk(0, size, 0);
  return out;
}

/** One chunk's lookup table: frame indices sorted by their chunk value. */
type ChunkTable = { values: Uint16Array; frames: Uint32Array };

export class VideoFrameIndex {
  readonly threshold: number;
  readonly videoCount: number;
  readonly frameCount: number;
  /** The radius each chunk table is probed at: floor(threshold / CHUNKS). */
  readonly subRadius: number;

  private readonly words: Uint32Array;
  /** Frame index -> video index (ids[videoOf[frame]] is the pool id). */
  private readonly videoOf: Uint32Array;
  private readonly ids: string[];
  private readonly idSet: Set<string>;
  private readonly withdrawn = new Set<string>();
  private readonly tables: ChunkTable[];
  /** Probe masks per chunk table: value ^ mask over every mask covers the neighborhood. */
  private readonly probeMasks: readonly number[];

  constructor(entries: readonly VideoPoolEntry[], poolThreshold: number) {
    this.threshold = effectiveThreshold(poolThreshold);
    this.subRadius = Math.floor(this.threshold / CHUNKS);
    // chunkNeighborhood(0, r) is the mask list: value ^ mask enumerates the
    // whole neighborhood of any value, so the masks are computed once.
    this.probeMasks = chunkNeighborhood(0, this.subRadius);
    this.ids = entries.map((e) => e.id);
    this.idSet = new Set(this.ids);
    this.videoCount = entries.length;
    this.frameCount = entries.reduce((n, e) => n + e.frames.length, 0);
    this.words = new Uint32Array(this.frameCount * WORDS);
    this.videoOf = new Uint32Array(this.frameCount);
    let frame = 0;
    entries.forEach((entry, video) => {
      for (const hash of entry.frames) {
        packHex(hash, this.words, frame * WORDS);
        this.videoOf[frame] = video;
        frame++;
      }
    });
    // Counting sort per chunk: values are 16-bit, so one pass counts, one
    // prefix sum and one scatter lay each table out grouped by value.
    this.tables = new Array<ChunkTable>(CHUNKS);
    const counts = new Uint32Array(CHUNK_VALUES);
    const cursor = new Uint32Array(CHUNK_VALUES);
    for (let c = 0; c < CHUNKS; c++) {
      counts.fill(0);
      for (let i = 0; i < this.frameCount; i++) {
        const value = chunkOfWords(this.words, i, c);
        counts[value] = counts[value]! + 1;
      }
      // Prefix sums: the write cursor per chunk value.
      let sum = 0;
      for (let v = 0; v < CHUNK_VALUES; v++) {
        cursor[v] = sum;
        sum += counts[v]!;
      }
      const values = new Uint16Array(this.frameCount);
      const frames = new Uint32Array(this.frameCount);
      for (let i = 0; i < this.frameCount; i++) {
        const value = chunkOfWords(this.words, i, c);
        const position = cursor[value]!;
        values[position] = value;
        frames[position] = i;
        cursor[value] = position + 1;
      }
      this.tables[c] = { values, frames };
    }
  }

  has(id: string): boolean {
    return this.idSet.has(id);
  }

  idSetView(): ReadonlySet<string> {
    return this.idSet;
  }

  /**
   * Stop matching a video immediately (its pool id left the pool, e.g.
   * consent withdrawn). Takes effect for the next match() call.
   */
  withdraw(id: string): void {
    this.withdrawn.add(id);
    this.idSet.delete(id);
  }

  /**
   * Every video whose best frame sits within the threshold of `hex`, best
   * (lowest) distance first. One preview image matching one frame is a
   * match (the thumbnail clause of the video match rule); each video is
   * reported once, like the Matcher reports one finding per pool entry.
   */
  match(hex: string): VideoMatch[] {
    if (this.frameCount === 0 || this.subRadius < 0) return [];
    const q = new Uint32Array(WORDS);
    packHex(hex, q, 0);
    const found = new Map<number, number>();
    for (let c = 0; c < CHUNKS; c++) {
      const table = this.tables[c]!;
      const chunk = chunkOf(q, c);
      for (const mask of this.probeMasks) {
        const key = (chunk ^ mask) >>> 0;
        // Binary search for the first table entry with this chunk value.
        let lo = 0;
        let hi = table.values.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (table.values[mid]! < key) lo = mid + 1;
          else hi = mid;
        }
        for (let p = lo; p < table.values.length && table.values[p] === key; p++) {
          const i = table.frames[p]!;
          const o = i * WORDS;
          let d =
            popcount32(this.words[o]! ^ q[0]!) +
            popcount32(this.words[o + 1]! ^ q[1]!) +
            popcount32(this.words[o + 2]! ^ q[2]!) +
            popcount32(this.words[o + 3]! ^ q[3]!);
          if (d > this.threshold) continue;
          d +=
            popcount32(this.words[o + 4]! ^ q[4]!) +
            popcount32(this.words[o + 5]! ^ q[5]!) +
            popcount32(this.words[o + 6]! ^ q[6]!) +
            popcount32(this.words[o + 7]! ^ q[7]!);
          if (d > this.threshold) continue;
          const video = this.videoOf[i]!;
          if (this.withdrawn.size > 0 && this.withdrawn.has(this.ids[video]!)) continue;
          const prev = found.get(video);
          if (prev === undefined || d < prev) found.set(video, d);
        }
      }
    }
    return [...found.entries()]
      .map(([video, distance]) => ({ fingerprintId: this.ids[video]!, distance }))
      .sort((a, b) => a.distance - b.distance || (a.fingerprintId < b.fingerprintId ? -1 : 1));
  }
}

/** Chunk `c` of packed frame `i` (row `i * WORDS` of `words`). */
function chunkOfWords(words: Uint32Array, i: number, c: number): number {
  const w = words[i * WORDS + (c >> 1)]!;
  return c % 2 === 0 ? w >>> 16 : w & 0xffff;
}
