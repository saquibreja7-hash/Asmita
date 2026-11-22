import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  chooseThreshold,
  chooseThresholdShift,
  flagMetricsFromScores,
  HASH_BITS,
  isTuningIndex,
  MIN_ABS_QUANT,
  prepareData,
  trainSextortionModel,
  TRAINED_AT,
  TRAINER_VERSION,
  type TrainingData,
} from "../src/train.ts";
import { SEXTORTION_LABELS, SEXTORTION_CORE_LABELS, SEXTORTION_SUPPORTING_LABELS } from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";
import { decodeSextortionModel, SEXTORTION_QUANT_SCALE } from "../../../asmita/src/lib/lab/sextortion/model-format.ts";
import { classifyWithModel } from "../../../asmita/src/lib/lab/sextortion/classify.ts";
import { generateDataset } from "../src/generate.ts";

// WP117 (docs/research/research-tools-spec.md, Track D): the trainer's own
// rules — the deterministic split, the threshold mechanics, the flag-rule
// precision constraint, quantized pruning, byte-identical reproducibility,
// and the committed model file the app ships. Training here runs with tiny
// epoch budgets (the full run is `npm run train`, ~4 minutes); the
// committed-model tests use the real file.

const LABEL_INDEX = {} as Record<string, number>;
SEXTORTION_LABELS.forEach((label, index) => {
  LABEL_INDEX[label] = index;
});

function labelScores(perLabel: Partial<Record<string, number[]>>): number[][] {
  const rows = Math.max(...Object.values(perLabel).map((scores) => scores?.length ?? 0));
  return SEXTORTION_LABELS.map((label) => Array.from({ length: rows }, (_, r) => perLabel[label]?.[r] ?? 0));
}

describe("the deterministic split", () => {
  it("sends exactly every SPLIT_EVERY-th row of each family×script run to tuning", () => {
    expect(isTuningIndex(0)).toBe(false);
    expect(isTuningIndex(4)).toBe(false);
    expect(isTuningIndex(5)).toBe(true);
    expect(isTuningIndex(11)).toBe(true);
  });

  it("keeps the split stratified: ~1/6 of every stratum, all rows accounted for", { timeout: 60_000 }, () => {
    const data = prepareData();
    const generated = generateDataset();
    expect(data.train.length + data.tune.length).toBe(generated.length);
    expect(data.train.length).toBe(10028);
    expect(data.tune.length).toBe(1972);
    // Every family×script stratum keeps tuning rows: the split is by row
    // index inside each run, so no stratum can lose its share.
    const strata = new Set(generated.map((row) => `${row.family}/${row.script}`));
    const tuneStrata = new Set(data.tune.map((entry) => `${entry.row.family}/${entry.row.script}`));
    expect(tuneStrata.size).toBe(strata.size);
    for (const entry of data.tune) {
      expect(isTuningIndex(Number(entry.row.id.split("-").pop()))).toBe(true);
    }
  });

  it("computes flagEligible from the row's own labels, and unique sorted buckets", { timeout: 60_000 }, () => {
    const data = prepareData();
    const core = new Set<string>(SEXTORTION_CORE_LABELS);
    const supporting = new Set<string>(SEXTORTION_SUPPORTING_LABELS);
    for (const entry of data.train.slice(0, 400)) {
      const hasCore = entry.row.labels.some((label) => core.has(label));
      const hasSupporting = entry.row.labels.some((label) => supporting.has(label));
      expect(entry.flagEligible).toBe(hasCore && hasSupporting);
      for (let i = 1; i < entry.buckets.length; i++) {
        expect(entry.buckets[i]).toBeGreaterThan(entry.buckets[i - 1]);
      }
      expect(entry.buckets[0]).toBeGreaterThanOrEqual(0);
      expect(entry.buckets[entry.buckets.length - 1]).toBeLessThan(HASH_BITS);
    }
  });
});

describe("threshold choice", () => {
  it("cuts at the midpoint of the gap when positives and negatives separate", () => {
    const scores = [0.9, 0.95, 0.99, 0.1, 0.2];
    const truths = [1, 1, 1, 0, 0];
    const choice = chooseThreshold(scores, truths);
    expect(choice.threshold).toBeCloseTo((0.9 + 0.2) / 2);
    expect(choice.f1).toBe(1);
  });

  it("falls back to the F1-optimal cut when they overlap", () => {
    const scores = [0.9, 0.6, 0.55, 0.5, 0.2];
    const truths = [1, 1, 0, 1, 0];
    const choice = chooseThreshold(scores, truths);
    // Firing from 0.5 down catches all 3 positives for 1 false positive:
    // precision 0.75, recall 1, F1 0.857 — better than the stricter cut at
    // 0.6 (precision 1, recall 2/3, F1 0.8).
    expect(choice.threshold).toBeCloseTo(0.5);
    expect(choice.precision).toBeCloseTo(0.75);
    expect(choice.recall).toBe(1);
    expect(choice.f1).toBeCloseTo(0.857, 2);
  });

  it("never fires a label with no positive examples", () => {
    expect(chooseThreshold([0.1, 0.9], [0, 0])).toEqual({ threshold: 1, precision: 1, recall: 0, f1: 0 });
  });
});

describe("the flag rule over score matrices", () => {
  it("counts precision and recall of the combination rule", () => {
    // Row 0: core + supporting, eligible → true flag.
    // Row 1: core only → no flag, eligible → missed.
    // Row 2: core + supporting, not eligible → false flag.
    // Row 3: nothing.
    const perLabel = {
      THREAT_EXPOSE: [0.9, 0.9, 0.9, 0.0],
      CLAIM_HAS_MEDIA: [0.0, 0.0, 0.0, 0.0],
      DEMAND_MONEY: [0.9, 0.0, 0.9, 0.0],
      DEADLINE: [0.0, 0.0, 0.0, 0.0],
    };
    const rows = [
      { flagEligible: true, scoreIndex: 0 },
      { flagEligible: true, scoreIndex: 1 },
      { flagEligible: false, scoreIndex: 2 },
      { flagEligible: false, scoreIndex: 3 },
    ];
    const metrics = flagMetricsFromScores(labelScores(perLabel), rows, SEXTORTION_LABELS.map(() => 0.5));
    expect(metrics.trueFlags).toBe(1);
    expect(metrics.falseFlags).toBe(1);
    expect(metrics.missedFlags).toBe(1);
    expect(metrics.precision).toBeCloseTo(0.5);
    expect(metrics.recall).toBeCloseTo(0.5);
  });

  it("shifts thresholds only as far as the 0.95 precision target needs", () => {
    // Eligible rows score 0.9 core/0.9 supporting; one hard negative sits
    // at 0.8/0.8, so δ=0 misses precision 0.95 (1/2) and the sweep raises
    // the thresholds until the negative drops out.
    const perLabel = {
      THREAT_EXPOSE: [0.9, 0.8],
      DEMAND_MONEY: [0.9, 0.8],
    };
    const tuneRows = [
      { row: { kind: "threat" }, flagEligible: true },
      { row: { kind: "negative" }, flagEligible: false },
    ] as never as import("../src/train.ts").TrainingRow[];
    const base = SEXTORTION_LABELS.map((label) => (label === "THREAT_EXPOSE" || label === "DEMAND_MONEY" ? 0.5 : 1));
    const shift = chooseThresholdShift(labelScores(perLabel), tuneRows, base);
    expect(shift.metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(shift.metrics.trueFlags).toBe(1);
    expect(shift.metrics.falseFlags).toBe(0);
    expect(shift.shift).toBeGreaterThan(0);
    expect(shift.negativeFalseFlags).toBe(0);
  });
});

describe("the export", () => {
  it("prunes sub-floor weights and quantizes everything to integers", { timeout: 120_000 }, () => {
    const data = prepareData();
    const { model } = trainSextortionModel({ prepare: () => data, maxEpochs: 2, patience: 1 });
    const entry = model.labels.THREAT_EXPOSE;
    expect(Number.isInteger(entry.bias)).toBe(true);
    for (const value of entry.v) {
      expect(Math.abs(value)).toBeGreaterThanOrEqual(MIN_ABS_QUANT);
    }
    for (let i = 1; i < entry.i.length; i++) {
      expect(entry.i[i]).toBeGreaterThan(entry.i[i - 1]);
    }
    // The threshold is the tuning-split choice (max-margin or shifted),
    // quantized like everything else: an integer strictly inside (0, 1).
    expect(Number.isInteger(entry.threshold)).toBe(true);
    expect(entry.threshold).toBeGreaterThan(0);
    expect(entry.threshold).toBeLessThan(SEXTORTION_QUANT_SCALE);
  });

  it("is byte-identical across two runs from the same data (same epochs)", { timeout: 240_000 }, () => {
    const data = prepareData();
    const first = trainSextortionModel({ prepare: () => data, maxEpochs: 2, patience: 1 });
    const second = trainSextortionModel({ prepare: () => data, maxEpochs: 2, patience: 1 });
    expect(JSON.stringify(second.model)).toBe(JSON.stringify(first.model));
  });

  it("produces a model the runtime decode accepts", { timeout: 120_000 }, () => {
    const data = prepareData();
    const { model } = trainSextortionModel({ prepare: () => data, maxEpochs: 2, patience: 1 });
    expect(() => decodeSextortionModel(model)).not.toThrow();
  });
});

describe("the committed model file (what the app ships)", () => {
  const raw = readFileSync(fileURLToPath(new URL("../../../asmita/src/lib/lab/sextortion/model.json", import.meta.url)), "utf8");
  const committed = JSON.parse(raw) as {
    modelVersion: number;
    trainedAt: string;
    generatorSeed: number;
    hashBits: number;
    labels: Record<string, { i: number[]; v: number[] }>;
  };

  it("carries the trainer's version and date, and the generator seed", () => {
    expect(committed.modelVersion).toBe(TRAINER_VERSION);
    expect(committed.trainedAt).toBe(TRAINED_AT);
    expect(committed.generatorSeed).toBe(20261122);
    expect(committed.hashBits).toBe(HASH_BITS);
  });

  it("is within the spec's 2 MB cap with every weight above the pruning floor", () => {
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(2 * 1024 * 1024);
    for (const entry of Object.values(committed.labels)) {
      expect(entry.i.length).toBe(entry.v.length);
      for (const value of entry.v) expect(Math.abs(value)).toBeGreaterThanOrEqual(MIN_ABS_QUANT);
    }
  });

  it("classifies through the app's own inference path", () => {
    const result = classifyWithModel(JSON.parse(raw), "mera paas tumhara video hai. paise bhejo 50000 upi par, 24 ghante me, warna sabko bhej dunga.");
    expect(result.flagged).toBe(true);
    expect(result.labels).toContain("DEMAND_MONEY");
  });
});
