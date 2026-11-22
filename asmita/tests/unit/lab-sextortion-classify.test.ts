import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { classifySextortion, flagFromScores, sextortionModelInfo, sextortionThresholds } from "@/lib/lab/sextortion/classify";
import { SEXTORTION_LABELS, type SextortionLabel } from "@/lib/lab/sextortion/taxonomy";
import type { DatasetRow } from "../../../tools/lab-sextortion/src/dataset";

// WP117 (docs/research/research-tools-spec.md, Track D): the classifier
// itself — the committed model file, the combination rule, latency, and the
// hard-negative guarantee. All message text is invented; the eval rows come
// from the committed, hand-written evaluation set
// (tools/lab-sextortion/eval/), which is never used for training.

const MODEL_URL = new URL("../../../asmita/src/lib/lab/sextortion/model.json", import.meta.url);
const EVAL_NEGATIVES_URL = new URL("../../../tools/lab-sextortion/eval/negatives.jsonl", import.meta.url);

function loadRows(url: URL): DatasetRow[] {
  const raw = readFileSync(fileURLToPath(url), "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as DatasetRow);
}

// Invented, styled on the documented patterns (sources §D): one message per
// script, each a threat the classifier must flag, and harmless everyday
// chat it must leave alone.
const INVENTED_THREATS = [
  "mera paas tumhara video hai. paise bhejo 50000 upi par, 24 ghante me, warna sabko bhej dunga.",
  "मेरे पास तुम्हारा वीडियो है। ₹50000 यूपीआई पर भेजो, 24 घंटे में, वरना सबको भेज दूंगा।",
  "i have the recording of your video call. transfer 50000 rupees within 24 hours or i will make it viral on social media.",
  "recording mere paas hai. रुपये भेजो 24 ghante me warna sabko bhej dunga.",
] as const;

const INVENTED_HARMLESS = [
  "shaadi ki video bhej do na, dekhne ka mann hai.",
  "शादी की वीडियो भेज दो ना, देखने का मन है।",
  "please send the wedding video, we want to watch it again.",
  "EMI reminder: your instalment of 5000 rupees is due on the 5th. pay on time.",
] as const;

describe("the committed sextortion model file", () => {
  const raw = readFileSync(fileURLToPath(MODEL_URL), "utf8");
  const model = JSON.parse(raw) as {
    format: number;
    modelVersion: number;
    trainedAt: string;
    generatorSeed: number;
    hashBits: number;
    quantScale: number;
    labels: Record<string, { bias: number; threshold: number; i: number[]; v: number[] }>;
  };

  it("is a real file within the spec's 2 MB cap", () => {
    expect(raw.length).toBeGreaterThan(1000);
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("carries the required provenance fields", () => {
    expect(model.format).toBe(1);
    expect(model.modelVersion).toBeGreaterThanOrEqual(1);
    expect(model.trainedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The WP116 generator seed: the training data is reproducible from it.
    expect(model.generatorSeed).toBe(20261122);
    expect(Number.isInteger(Math.log2(model.hashBits))).toBe(true);
  });

  it("has one entry per taxonomy label, with sane thresholds and aligned arrays", () => {
    expect(Object.keys(model.labels).sort()).toEqual([...SEXTORTION_LABELS].sort());
    for (const [label, entry] of Object.entries(model.labels)) {
      expect(entry.i.length, label).toBe(entry.v.length);
      const threshold = entry.threshold / model.quantScale;
      expect(threshold, label).toBeGreaterThan(0);
      expect(threshold, label).toBeLessThan(1);
    }
  });

  it("exposes its facts through sextortionModelInfo", () => {
    const info = sextortionModelInfo();
    expect(info.trainedAt).toBe(model.trainedAt);
    expect(info.labelCount).toBe(SEXTORTION_LABELS.length);
  });
});

describe("classifySextortion", () => {
  it("flags invented threats in every script (devanagari, romanised, mixed, english)", () => {
    for (const text of INVENTED_THREATS) {
      const result = classifySextortion(text);
      expect(result.flagged, text).toBe(true);
      expect(result.labels.length, text).toBeGreaterThan(0);
    }
  });

  it("leaves invented harmless chat alone", () => {
    for (const text of INVENTED_HARMLESS) {
      const result = classifySextortion(text);
      expect(result.flagged, text).toBe(false);
      expect(result.labels, text).toEqual([]);
    }
  });

  it("is deterministic and never leaks NOT_THREAT or a score", () => {
    const first = classifySextortion(INVENTED_THREATS[0]);
    const second = classifySextortion(INVENTED_THREATS[0]);
    expect(second).toEqual(first);
    expect(first.labels).not.toContain("NOT_THREAT");
    expect(Object.keys(first)).toEqual(["labels", "flagged"]);
  });

  it("is deterministic under noise the normaliser undoes", () => {
    const clean = classifySextortion(INVENTED_THREATS[0]);
    const noisy = classifySextortion("mera paas tumhara video hai. paise bhejo 50000 upi par, 24 ghante me, warna sabko bhej d\u200Bunga.");
    expect(noisy.flagged).toBe(clean.flagged);
  });
});

describe("the combination rule (flagFromScores)", () => {
  const thresholds = sextortionThresholds();
  const core = "THREAT_EXPOSE" as SextortionLabel;
  const supporting = "DEMAND_MONEY" as SextortionLabel;

  const scores = (coreScore: number, supportingScore: number) => {
    const map = new Map<SextortionLabel, number>();
    for (const label of SEXTORTION_LABELS) map.set(label, 0);
    map.set(core, coreScore);
    map.set(supporting, supportingScore);
    return map;
  };

  it("needs a core label AND a supporting label above their thresholds", () => {
    expect(flagFromScores(scores(thresholds[core], thresholds[supporting]))).toBe(true);
    expect(flagFromScores(scores(thresholds[core], thresholds[supporting] - 0.001))).toBe(false);
    expect(flagFromScores(scores(thresholds[core] - 0.001, thresholds[supporting]))).toBe(false);
    expect(flagFromScores(scores(0, 0))).toBe(false);
  });

  it("counts CLAIM_HAS_MEDIA as the other core label", () => {
    const map = new Map<SextortionLabel, number>();
    for (const label of SEXTORTION_LABELS) map.set(label, 0);
    map.set("CLAIM_HAS_MEDIA", thresholds.CLAIM_HAS_MEDIA);
    map.set("DEADLINE", thresholds.DEADLINE);
    expect(flagFromScores(map)).toBe(true);
  });
});

describe("hard negatives stay below the flag threshold (committed eval set)", () => {
  const negatives = loadRows(EVAL_NEGATIVES_URL);

  it("has all four scripts in the eval negatives", () => {
    const scripts = new Set(negatives.map((row) => row.script));
    expect([...scripts].sort()).toEqual(["devanagari", "english", "mixed", "romanised"]);
  });

  it("flags none of the 203 hand-written hard negatives", () => {
    expect(negatives.length).toBeGreaterThanOrEqual(180);
    const flagged = negatives.filter((row) => classifySextortion(row.text).flagged);
    expect(flagged).toEqual([]);
  });

  it("never flags the short everyday messages from the PR #114 review", () => {
    // Invented; the model may still put a stray single label on them, which
    // the message-check route drops (tests/unit/lab-message-check-findings.test.ts).
    for (const text of ["hi", "hi there", "good morning", "Abhi aata hoon", "Hi! Are we still on for lunch tomorrow?", "ok", "hii", "Delhi", "Please call me back"]) {
      expect(classifySextortion(text).flagged, text).toBe(false);
    }
    const shortChat = negatives.filter((row) => row.family === "shortChat");
    expect(shortChat.length).toBe(9);
  });

  it("keeps every hard-negative family below the flag rule", () => {
    const families = new Set(negatives.map((row) => row.family));
    expect(families.size).toBeGreaterThanOrEqual(8);
    for (const family of families) {
      const rows = negatives.filter((row) => row.family === family);
      expect(rows.some((row) => classifySextortion(row.text).flagged), family).toBe(false);
    }
  });
});

describe("recall on the committed eval threats", () => {
  const threats = loadRows(new URL("../../../tools/lab-sextortion/eval/threats.jsonl", import.meta.url));

  it("flags most flag-eligible threats in every script", () => {
    // Flag-eligible: the row's own labels carry a core and a supporting
    // label — the combination rule's ground truth.
    const core = new Set<string>(["THREAT_EXPOSE", "CLAIM_HAS_MEDIA"]);
    const supporting = new Set<string>([
      "DEMAND_MONEY",
      "DEMAND_SEXUAL",
      "DEMAND_THIRD_PARTY",
      "AUDIENCE_FAMILY",
      "AUDIENCE_PUBLIC",
      "DEADLINE",
      "AUTHORITY_IMPERSONATION",
      "PLATFORM_IMPERSONATION",
      "LOAN_RECOVERY",
      "REPEAT_DEMAND",
    ]);
    const byScript: Record<string, { eligible: number; flagged: number }> = {};
    for (const row of threats) {
      const eligible =
        row.labels.some((label) => core.has(label)) && row.labels.some((label) => supporting.has(label));
      if (!eligible) continue;
      const entry = (byScript[row.script] ??= { eligible: 0, flagged: 0 });
      entry.eligible++;
      if (classifySextortion(row.text).flagged) entry.flagged++;
    }
    for (const [script, entry] of Object.entries(byScript)) {
      // A floor, not a ceiling: the honest numbers live in
      // docs/lab/sextortion-eval.md (English is the weakest script at
      // 41% recall — the closed training vocabulary is smallest there).
      // The floor guards against any script collapsing outright.
      expect(entry.flagged / entry.eligible, script).toBeGreaterThanOrEqual(0.35);
    }
  });
});

describe("inference latency", () => {
  it("classifies 4,000 characters in under 20 ms (median of warm runs)", () => {
    // A long message built from invented threat text, padded past the cap.
    const filler = " aur baat aage badhegi jab tak paise nahi milte.";
    const unit = INVENTED_THREATS[0] + filler;
    const message = unit.repeat(Math.ceil(4000 / unit.length)).slice(0, 4000);
    expect(message.length).toBe(4000);
    classifySextortion(message); // warm-up
    const samples: number[] = [];
    for (let run = 0; run < 9; run++) {
      const started = performance.now();
      classifySextortion(message);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    expect(median).toBeLessThan(20);
  });
});
