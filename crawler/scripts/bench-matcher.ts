/**
 * Matcher benchmark: brute-force Hamming over N random fingerprints.
 * Usage: npm run bench:matcher [-- <poolSize> <queries>]
 * Prints JSON only (no fingerprints).
 */
import { Matcher } from "../src/match/matcher.ts";
import { flipBits, randomFingerprint } from "../tests/support/synthetic.ts";

const size = Number(process.argv[2] ?? 100_000);
const queries = Number(process.argv[3] ?? 200);

const pool = Array.from({ length: size }, (_, i) => ({ id: `fp-${i}`, pdq: randomFingerprint(i + 1), quality: 100 }));
const t0 = performance.now();
const m = new Matcher(pool, 31);
const buildMs = performance.now() - t0;

// Half the queries are near-duplicates of pool entries, half unrelated.
const qs = Array.from({ length: queries }, (_, i) =>
  i % 2 === 0 ? flipBits(pool[(i * 7919) % size]!.pdq, 10, i) : randomFingerprint(10_000_000 + i),
);
for (const q of qs.slice(0, 10)) m.match(q); // warm-up

let hits = 0;
const t1 = performance.now();
for (const q of qs) hits += m.match(q).length;
const totalMs = performance.now() - t1;

console.log(
  JSON.stringify({
    poolSize: size,
    queries,
    buildMs: Number(buildMs.toFixed(1)),
    msPerQuery: Number((totalMs / queries).toFixed(3)),
    queriesPerSecond: Math.round(queries / (totalMs / 1000)),
    hits,
    node: process.version,
  }),
);
