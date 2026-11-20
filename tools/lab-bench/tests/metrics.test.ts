import { describe, expect, it } from "vitest";
import { accuracy, auc, matches, mean, median, pickOperatingPoint, round, thresholdCandidates } from "../src/metrics.ts";

describe("matches", () => {
  it("distance matches below the threshold, similarity above", () => {
    expect(matches(10, 12, "distance")).toBe(true);
    expect(matches(13, 12, "distance")).toBe(false);
    expect(matches(0.9, 0.8, "similarity")).toBe(true);
    expect(matches(0.7, 0.8, "similarity")).toBe(false);
  });
});

describe("thresholdCandidates", () => {
  it("uses exact half-integers for integer scores", () => {
    expect(thresholdCandidates([1, 3], [2], "distance")).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it("sits beside every distinct continuous score", () => {
    const cs = thresholdCandidates([0.5], [1.5], "distance");
    expect(cs).toHaveLength(4);
    expect(cs[0]).toBeLessThan(0.5);
    expect(cs[1]).toBe(0.5);
    expect(cs[2]).toBeLessThan(1.5);
    expect(cs[3]).toBe(1.5);
  });

  it("is empty without any scores", () => {
    expect(thresholdCandidates([], [], "distance")).toEqual([]);
  });
});

describe("pickOperatingPoint", () => {
  const impostors = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115];

  it("picks the largest threshold with zero impostor matches at a strict 1% target", () => {
    // 20 impostors: 1% of 20 = 0.2 -> allowed count 0 -> threshold below 20.
    const op = pickOperatingPoint([5, 8, 12], impostors, "distance", 0.01)!;
    expect(op).not.toBeNull();
    expect(op.threshold).toBe(19.5);
    expect(op.recall).toBe(1);
    expect(op.fmr).toBe(0);
    expect(op.genuineMatched).toBe(3);
    expect(op.impostorMatched).toBe(0);
  });

  it("gives up only the genuine pairs the FMR budget cannot cover", () => {
    const op = pickOperatingPoint([5, 25], impostors, "distance", 0.01)!;
    expect(op.threshold).toBe(19.5);
    expect(op.recall).toBe(0.5);
    expect(op.genuineMatched).toBe(1);
  });

  it("spends the allowed impostor budget when there is one", () => {
    const imp = [10, ...Array<number>(99).fill(50)];
    const op = pickOperatingPoint([12], imp, "distance", 0.01)!;
    // 1% of 100 = 1 allowed impostor match: the threshold may sit at 49.5.
    expect(op.threshold).toBe(49.5);
    expect(op.recall).toBe(1);
    expect(op.fmr).toBe(0.01);
    expect(op.impostorMatched).toBe(1);
  });

  it("handles similarity scores mirrored", () => {
    const imp = [...Array<number>(50).fill(0.1), 0.7];
    const op = pickOperatingPoint([0.9, 0.8], imp, "similarity", 0.01)!;
    // The most permissive threshold inside the budget sits just above the
    // largest impostor below the genuine mass (0.7): recall is full, FMR 0.
    expect(op.threshold).toBeGreaterThan(0.7);
    expect(op.threshold).toBeLessThanOrEqual(0.8);
    expect(op.recall).toBe(1);
    expect(op.fmr).toBe(0);
  });

  it("returns null without impostors to calibrate on", () => {
    expect(pickOperatingPoint([1], [], "distance")).toBeNull();
  });
});

describe("auc", () => {
  it("is 1 for perfect separation, 0 for reversed, 0.5 for ties", () => {
    expect(auc([0.9], [0.1])).toBe(1);
    expect(auc([0.1], [0.9])).toBe(0);
    expect(auc([0.5], [0.5])).toBe(0.5);
  });

  it("counts concordant pairs with ties at half", () => {
    // pos {0.9, 0.2} vs neg {0.8, 0.1}: 3 of 4 pairs concordant -> 0.75.
    expect(auc([0.9, 0.2], [0.8, 0.1])).toBe(0.75);
  });

  it("is null when either side is empty", () => {
    expect(auc([], [0.5])).toBeNull();
    expect(auc([0.5], [])).toBeNull();
  });
});

describe("accuracy / mean / median / round", () => {
  it("scores binary predictions at the cut", () => {
    expect(accuracy([true, false], [0.9, 0.2])).toBe(1);
    expect(accuracy([true, false], [0.4, 0.6])).toBe(0);
    expect(accuracy([true, false], [0.4, 0.6], 0.3)).toBe(0.5);
    expect(accuracy([], [])).toBeNull();
    expect(accuracy([true], [0.9, 0.2])).toBeNull();
  });

  it("means and medians", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("rounds to the given digits, keeps null", () => {
    expect(round(0.12345, 3)).toBe(0.123);
    expect(round(null)).toBeNull();
    expect(round(Number.NaN)).toBeNull();
  });
});
