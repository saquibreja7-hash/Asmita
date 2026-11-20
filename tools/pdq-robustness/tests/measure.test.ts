import { describe, expect, it } from "vitest";
import {
  falseMatchStats, groupStats, pooledGroupStats, PRODUCTION_MIN_QUALITY, THRESHOLDS,
  type AlterationRow,
} from "../src/measure.ts";
import { PDQ_HASH_PATTERN, PDQ_MATCH_THRESHOLD } from "../../../asmita/src/lib/pdq/pdq.ts";

describe("thresholds and production constants", () => {
  it("measures at 20/25/31/40 with 31 being the production threshold", () => {
    expect([...THRESHOLDS]).toEqual([20, 25, 31, 40]);
    expect(THRESHOLDS).toContain(PDQ_MATCH_THRESHOLD);
  });

  it("uses the crawler's own quality floor", () => {
    expect(PRODUCTION_MIN_QUALITY).toBe(50);
  });
});

const rows: AlterationRow[] = [
  { group: "crop", severity: "5%", distance: 10, quality: 90, cls: "photo" },
  { group: "crop", severity: "5%", distance: 30, quality: 80, cls: "photo" },
  { group: "crop", severity: "5%", distance: 100, quality: 70, cls: "photo" },
  { group: "crop", severity: "40%", distance: 60, quality: 10, cls: "photo" },
  { group: "mirror", severity: "flip", distance: 130, quality: 60, cls: "photo" },
  { group: "mirror", severity: "flip", distance: 45, quality: 20, cls: "gradient" },
];

describe("groupStats", () => {
  it("aggregates per (group, severity) with shares per threshold", () => {
    const g = groupStats(rows);
    expect(g).toHaveLength(3);
    const crop5 = g.find((x) => x.group === "crop" && x.severity === "5%")!;
    expect(crop5.n).toBe(3);
    expect(crop5.caught[20]).toBeCloseTo(1 / 3);
    expect(crop5.caught[25]).toBeCloseTo(1 / 3);
    expect(crop5.caught[31]).toBeCloseTo(2 / 3);
    expect(crop5.caught[40]).toBeCloseTo(2 / 3);
    expect(crop5.maxDistance).toBe(100);
    expect(crop5.lowQuality).toBe(0);
  });

  it("counts the production view: within 31 AND quality >= 50", () => {
    const g = groupStats(rows);
    const mirror = g.find((x) => x.group === "mirror")!;
    // one copy at 45 (over 31: not caught anyway), one at 130; both over -> production catch 0
    expect(mirror.caughtProduction).toBe(0);
    const crop40 = g.find((x) => x.group === "crop" && x.severity === "40%")!;
    expect(crop40.lowQuality).toBe(1);
    expect(crop40.caughtProduction).toBe(0); // distance 60 AND quality 10
    const crop5 = g.find((x) => x.group === "crop" && x.severity === "5%")!;
    expect(crop5.caughtProduction).toBeCloseTo(2 / 3);
  });

  it("keeps the input row order of (group, severity) pairs", () => {
    const g = groupStats(rows);
    expect(g.map((x) => `${x.group}|${x.severity}`)).toEqual(["crop|5%", "crop|40%", "mirror|flip"]);
  });
});

describe("pooledGroupStats", () => {
  it("pools every severity into one row per group", () => {
    const p = pooledGroupStats(rows);
    expect(p).toHaveLength(2);
    const crop = p.find((x) => x.group === "crop")!;
    expect(crop.severity).toBe("all");
    expect(crop.n).toBe(4);
    expect(crop.caught[31]).toBe(0.5); // 10 and 30 of 10,30,100,60
    const mirror = p.find((x) => x.group === "mirror")!;
    expect(mirror.n).toBe(2);
    expect(mirror.lowQuality).toBe(1);
  });
});

describe("falseMatchStats", () => {
  it("measures every unordered pair and splits by quality floor", () => {
    // Literal 64-hex strings: 0xffffffffffffffff does not survive JS number
    // precision, so fixtures are written as strings, not numbers.
    const a = "0".repeat(63) + "a"; // last byte 0x0a
    const b = "0".repeat(63) + "3"; // last byte 0x03 -> a^b = 0x09, 2 bits
    const ones = "f".repeat(64);
    const fm = falseMatchStats([
      { name: "a", hash: a, quality: 90 },
      { name: "b", hash: b, quality: 90 },
      { name: "c", hash: ones, quality: 10 }, // below the quality floor
      { name: "d", hash: ones, quality: 80 },
    ]);
    expect(fm.pairs).toBe(6);
    // a-b distance 2; c-d distance 0; every other pair is 254 bits
    expect(fm.minDistance).toBe(0);
    expect(fm.within[20]).toBe(2);
    expect(fm.within[31]).toBe(2);
    expect(fm.within[40]).toBe(2);
    // production view: c is below the quality floor, so the c-d pair is excluded
    expect(fm.withinProductionQuality[31]).toBe(1); // a-b only
  });

  it("reports zero when unrelated images are far apart", () => {
    const fm = falseMatchStats([
      { name: "a", hash: "0".repeat(64), quality: 90 },
      { name: "b", hash: "f".repeat(64), quality: 90 },
    ]);
    expect(fm.pairs).toBe(1);
    expect(fm.within[31]).toBe(0);
    expect(fm.minDistance).toBe(256);
  });
});

describe("hash format guard", () => {
  it("fixture hashes must look like real ones (64 lowercase hex)", () => {
    expect("0".repeat(64)).toMatch(PDQ_HASH_PATTERN);
    expect("f".repeat(64)).toMatch(PDQ_HASH_PATTERN);
  });
});
