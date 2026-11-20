/**
 * Video frame index benchmark (video-fingerprints spec WP20): multi-index
 * hashing over the frames of video pool entries.
 * Usage: npm run bench:video [-- <frames> <videos> <queries>]
 * Prints JSON only (no frame hashes).
 */
import { VideoFrameIndex } from "../src/match/video-index.ts";
import { flipBits, randomFingerprint } from "../tests/support/synthetic.ts";

const frames = Number(process.argv[2] ?? 100_000);
const videos = Number(process.argv[3] ?? 100);
const queries = Number(process.argv[4] ?? 200);

// Frames are unrelated random hashes (like frames of unrelated videos);
// within one video they are near-duplicates in reality, which only makes
// the index's job easier, so the random form is the honest worst case.
const perVideo = Math.max(1, Math.ceil(frames / videos));
const entries = Array.from({ length: videos }, (_, v) => ({
  id: `fp-${v}`,
  kind: "video" as const,
  frames: Array.from({ length: perVideo }, (_, f) => randomFingerprint(v * 100_000 + f)),
})).slice(0, videos);

const t0 = performance.now();
const index = new VideoFrameIndex(entries, 31);
const buildMs = performance.now() - t0;

// Half the queries are near-duplicates of pool frames, half unrelated.
const pool = entries.flatMap((e) => e.frames);
const qs = Array.from({ length: queries }, (_, i) =>
  i % 2 === 0 ? flipBits(pool[(i * 7919) % pool.length]!, 12, i) : randomFingerprint(50_000_000 + i),
);
for (const q of qs.slice(0, 10)) index.match(q); // warm-up

let hits = 0;
const t1 = performance.now();
for (const q of qs) hits += index.match(q).length;
const totalMs = performance.now() - t1;

console.log(
  JSON.stringify({
    videos: entries.length,
    frames: index.frameCount,
    queries,
    buildMs: Number(buildMs.toFixed(1)),
    msPerQuery: Number((totalMs / queries).toFixed(3)),
    queriesPerSecond: Math.round(queries / (totalMs / 1000)),
    hits,
    node: process.version,
  }),
);
