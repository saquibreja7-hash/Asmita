/**
 * End-to-end image throughput: decode + PDQ + match against a 100k pool.
 * Usage: npm run bench:decode [-- <images> <concurrency>]
 * Prints JSON only (no fingerprints).
 */
import { hashImage } from "../src/image/hash-image.ts";
import { Matcher } from "../src/match/matcher.ts";
import { patternImage, randomFingerprint } from "../tests/support/synthetic.ts";

const count = Number(process.argv[2] ?? 60);
const concurrency = Number(process.argv[3] ?? 1);

const pool = Array.from({ length: 100_000 }, (_, i) => ({ id: `fp-${i}`, pdq: randomFingerprint(i + 1), quality: 100 }));
const matcher = new Matcher(pool, 31);

// A mix of typical web image sizes and formats.
const shapes: [number, number, "jpeg" | "png" | "webp"][] = [
  [1024, 768, "jpeg"],
  [640, 480, "png"],
  [800, 600, "webp"],
  [1600, 1200, "jpeg"],
];
const images: Buffer[] = [];
for (let i = 0; i < count; i++) {
  const [w, h, f] = shapes[i % shapes.length]!;
  images.push(await patternImage(1000 + i, w, h, f));
}

async function run(hash: (b: Buffer) => Promise<{ hash: string; quality: number }>): Promise<number> {
  let next = 0;
  let matched = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < images.length) {
        const b = images[next++]!;
        const r = await hash(b);
        matched += matcher.match(r.hash).length;
      }
    }),
  );
  void matched;
  return performance.now() - t0;
}

const mode = process.env.BENCH_MODE ?? "inprocess";
let hasher: (b: Buffer) => Promise<{ hash: string; quality: number }>;
let close = async () => undefined as void;
if (mode === "isolated") {
  const { DecoderPool } = await import("../src/image/decoder-pool.ts");
  const dp = new DecoderPool({ size: concurrency, taskTimeoutMs: 30_000, minSide: 1 });
  hasher = async (b) => {
    const r = await dp.hash(b);
    return { hash: r.pdq, quality: r.quality };
  };
  close = () => dp.close();
} else {
  hasher = (b) => hashImage(b, { minSide: 1 });
}

await run(hasher); // warm-up (also starts workers)
const ms = await run(hasher);
await close();
console.log(
  JSON.stringify({
    mode,
    images: count,
    concurrency,
    poolSize: pool.length,
    totalMs: Math.round(ms),
    msPerImage: Number((ms / count).toFixed(1)),
    imagesPerSecond: Number(((count / ms) * 1000).toFixed(1)),
  }),
);
