import { describe, expect, it } from "vitest";
import { effectiveThreshold, Matcher, popcount32 } from "../../src/match/matcher.ts";
import { hammingDistance } from "../../src/pdq.ts";
import { flipBits, randomFingerprint } from "../support/synthetic.ts";

describe("popcount32", () => {
  it("agrees with a naive count", () => {
    for (const x of [0, 1, 0xffffffff, 0x80000000, 0x55555555, 0x12345678, 0xdeadbeef]) {
      let n = 0;
      for (let i = 0; i < 32; i++) n += (x >>> i) & 1;
      expect(popcount32(x)).toBe(n);
    }
  });
});

describe("Matcher", () => {
  const pool = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, pdq: randomFingerprint(i + 1), quality: 100 }));

  it("computes the same distance as pdq.ts hammingDistance", () => {
    const base = randomFingerprint(9999);
    for (const bits of [0, 1, 5, 17, 31]) {
      const near = flipBits(base, bits, bits + 3);
      const m = new Matcher([{ id: "x", pdq: base, quality: 100 }], 31);
      expect(m.match(near)).toEqual([{ fingerprintId: "x", distance: hammingDistance(base, near) }]);
      expect(hammingDistance(base, near)).toBe(bits);
    }
  });

  it("is inclusive at the threshold and exclusive above it", () => {
    const base = randomFingerprint(42);
    const m = new Matcher([{ id: "x", pdq: base, quality: 100 }], 31);
    expect(m.match(flipBits(base, 31))).toHaveLength(1);
    expect(m.match(flipBits(base, 32))).toHaveLength(0);
  });

  it("finds nothing for unrelated random fingerprints (about 128 bits apart)", () => {
    const m = new Matcher(pool, 31);
    for (let i = 0; i < 50; i++) expect(m.match(randomFingerprint(100_000 + i))).toEqual([]);
  });

  it("returns every matching entry, best first, once per id", () => {
    const base = randomFingerprint(77_777); // outside the pool seed range
    const m = new Matcher(
      [
        ...pool,
        { id: "far", pdq: flipBits(base, 20, 1), quality: 90 },
        { id: "near", pdq: flipBits(base, 3, 2), quality: 90 },
        { id: "exact", pdq: base, quality: 90 },
        { id: "near", pdq: flipBits(base, 9, 4), quality: 90 }, // same id twice: best distance kept
      ],
      31,
    );
    expect(m.match(base)).toEqual([
      { fingerprintId: "exact", distance: 0 },
      { fingerprintId: "near", distance: 3 },
      { fingerprintId: "far", distance: 20 },
    ]);
  });

  it("caps the pool threshold at 31 and accepts lower ones", () => {
    expect(effectiveThreshold(31)).toBe(31);
    expect(effectiveThreshold(64)).toBe(31);
    expect(effectiveThreshold(10)).toBe(10);
    expect(effectiveThreshold(-1)).toBe(0);
    const base = randomFingerprint(5);
    const strict = new Matcher([{ id: "x", pdq: base, quality: 100 }], 10);
    expect(strict.match(flipBits(base, 11))).toEqual([]);
    expect(strict.match(flipBits(base, 10))).toHaveLength(1);
    const loose = new Matcher([{ id: "x", pdq: base, quality: 100 }], 200);
    expect(loose.threshold).toBe(31);
    expect(loose.match(flipBits(base, 40))).toEqual([]);
  });

  it("handles an empty pool", () => {
    expect(new Matcher([], 31).match(randomFingerprint(1))).toEqual([]);
  });
});
