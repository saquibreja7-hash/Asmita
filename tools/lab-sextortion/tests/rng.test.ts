import { describe, expect, it } from "vitest";
import { hashSeed, rngFromSeed, rowRng } from "../src/rng.ts";

describe("seeded RNG", () => {
  it("gives the same stream for the same seed, and different streams for different seeds", () => {
    const a = rngFromSeed(1234);
    const b = rngFromSeed(1234);
    const c = rngFromSeed(5678);
    const aValues = Array.from({ length: 20 }, () => a.next());
    const bValues = Array.from({ length: 20 }, () => b.next());
    const cValues = Array.from({ length: 20 }, () => c.next());
    expect(aValues).toEqual(bValues);
    expect(aValues).not.toEqual(cValues);
  });

  it("produces values in range", () => {
    const rng = rngFromSeed(99);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(10);
      expect(int).toBeGreaterThanOrEqual(0);
      expect(int).toBeLessThan(10);
    }
  });

  it("rowRng is deterministic per key and independent across keys", () => {
    const one = Array.from({ length: 10 }, () => rowRng(7, "family", "romanised", 3).next());
    const two = Array.from({ length: 10 }, () => rowRng(7, "family", "romanised", 3).next());
    const other = Array.from({ length: 10 }, () => rowRng(7, "family", "romanised", 4).next());
    expect(one).toEqual(two);
    expect(one).not.toEqual(other);
  });

  it("hashSeed is stable and spread out", () => {
    expect(hashSeed("a", 1)).toBe(hashSeed("a", 1));
    expect(hashSeed("a", 1)).not.toBe(hashSeed("a", 2));
    const hashes = new Set(Array.from({ length: 200 }, (_, i) => hashSeed("row", i)));
    expect(hashes.size).toBe(200);
  });
});
