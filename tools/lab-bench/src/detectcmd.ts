/**
 * The `detect` command: run every available detector over a built set,
 * write results.json + per-item detections to a fresh run directory.
 *
 * Aggregation per detector and per transform (charter E1 metric: AUC and
 * accuracy per transform):
 *   - accuracy: the share of items classified correctly, using the
 *     detector's own verdict when it gives one and otherwise score >= 0.5;
 *   - AUC: computed over that transform's items pooled with the untouched
 *     originals (the baseline negatives), so it is reported exactly where
 *     both classes are present; a transform whose items are all one class
 *     gets accuracy only (AUC null), which is the honest number.
 */
import { buildDetectors, isDetectionScore, isNoFaceResult, type BuiltDetectors, type Detector } from "./detectors/index.ts";
import { galleryItems, PROBE_TRANSFORMS, type SetItem, type Transform } from "./setformat.ts";
import { accuracy, auc, mean, round } from "./metrics.ts";
import { newRunDir, writeJson, writeJsonl } from "./runs.ts";
import { loadSet } from "./matchcmd.ts";

export type DetectDeps = {
  /** Override the registry (tests inject fake detectors and fakes for fetch). */
  detectors?: Detector[];
  skipped?: Array<{ id: string; reason: string }>;
};

export type DetectorTransformStat = {
  n: number;
  accuracy: number | null;
  auc: number | null;
  meanScoreFake: number | null;
  meanScoreReal: number | null;
  errors: number;
  /** Items the detector honestly could not score (GenD's no-face answer). */
  noFace: number;
};

export type DetectorResult = {
  id: string;
  name: string;
  items: number;
  errors: number;
  /** Items the detector honestly could not score (summed over transforms). */
  noFace: number;
  /** Accuracy over every scored item. */
  overallAccuracy: number | null;
  perTransform: Partial<Record<Transform, DetectorTransformStat>>;
};

export type DetectResults = {
  kind: "detect";
  createdAt: string;
  set: { dir: string; items: number; gallery: number; perTransform: Record<string, number> };
  detectors: DetectorResult[];
  skipped: Array<{ id: string; reason: string }>;
};

export async function runDetect(
  setDir: string,
  deps: DetectDeps = {},
  runsDir?: string,
): Promise<{ runDir: string; results: DetectResults }> {
  const { set, buffers } = await loadSet(setDir);
  let built: BuiltDetectors;
  if (deps.detectors) {
    built = { detectors: deps.detectors, skipped: deps.skipped ?? [] };
  } else {
    built = buildDetectors();
  }
  if (built.detectors.length === 0) {
    throw new Error(
      `no detectors available: ${built.skipped.map((s) => `${s.id} (${s.reason})`).join("; ") || "unknown"}`,
    );
  }

  const rows: Array<Record<string, unknown>> = [];
  type ItemOutcome = { score?: number; label?: "ai" | "real"; noFace?: boolean; error?: string };
  const outcomes = new Map<string, Map<string, ItemOutcome>>(); // itemId -> detectorId -> outcome
  for (const item of set.items) {
    outcomes.set(item.id, new Map());
  }
  for (const detector of built.detectors) {
    for (const item of set.items) {
      const buffer = buffers.get(item.id)!;
      const result = await detector.detect(buffer);
      const outcome: ItemOutcome = isDetectionScore(result)
        ? { score: result.score, ...(result.label ? { label: result.label } : {}) }
        : isNoFaceResult(result)
          ? { noFace: true }
          : { error: result.error };
      outcomes.get(item.id)!.set(detector.id, outcome);
      rows.push({ detector: detector.id, item: item.id, transform: item.transform, label: item.label, ...outcome });
    }
  }

  const detectors: DetectorResult[] = built.detectors.map((detector) => {
    const perTransform: Partial<Record<Transform, DetectorTransformStat>> = {};
    let allLabels: boolean[] = [];
    let allScores: number[] = [];
    let errors = 0;
    let noFaceTotal = 0;
    for (const t of [...PROBE_TRANSFORMS, "original", "dataset"] as const) {
      const bucket = set.items.filter((i) => i.transform === t);
      if (bucket.length === 0) continue;
      const labels: boolean[] = [];
      const scores: number[] = [];
      let bucketErrors = 0;
      let bucketNoFace = 0;
      for (const item of bucket) {
        const o = outcomes.get(item.id)!.get(detector.id)!;
        if (o.error) { bucketErrors++; continue; }
        if (o.noFace) { bucketNoFace++; continue; }
        labels.push(item.label === "fake");
        scores.push(o.label ? (o.label === "ai" ? 1 : 0) : (o.score ?? 0));
      }
      errors += bucketErrors;
      noFaceTotal += bucketNoFace;
      if (labels.length === 0) {
        perTransform[t] = { n: bucket.length, accuracy: null, auc: null, meanScoreFake: null, meanScoreReal: null, errors: bucketErrors, noFace: bucketNoFace };
        continue;
      }
      // AUC pool: this transform's items plus the untouched originals (the
      // baseline negatives), the honest ROC when the transform has one class.
      const poolItems = t === "original" ? bucket : [...bucket, ...set.items.filter((i) => i.transform === "original")];
      const poolLabels: boolean[] = [];
      const poolScoresNum: number[] = [];
      for (const item of poolItems) {
        const o = outcomes.get(item.id)!.get(detector.id)!;
        if (o.error || o.noFace) continue;
        poolLabels.push(item.label === "fake");
        poolScoresNum.push(o.label ? (o.label === "ai" ? 1 : 0) : (o.score ?? 0));
      }
      const fakeScores = scores.filter((_, i) => labels[i]!);
      const realScores = scores.filter((_, i) => !labels[i]!);
      perTransform[t] = {
        n: bucket.length,
        accuracy: round(accuracy(labels, scores), 4),
        auc: round(
          auc(
            poolScoresNum.filter((_, i) => poolLabels[i]!),
            poolScoresNum.filter((_, i) => !poolLabels[i]!),
          ),
          4,
        ),
        meanScoreFake: round(mean(fakeScores), 4),
        meanScoreReal: round(mean(realScores), 4),
        errors: bucketErrors,
        noFace: bucketNoFace,
      };
      allLabels = allLabels.concat(labels);
      allScores = allScores.concat(scores);
    }
    return {
      id: detector.id,
      name: detector.name,
      items: set.items.length,
      errors,
      noFace: noFaceTotal,
      overallAccuracy: round(accuracy(allLabels, allScores), 4),
      perTransform,
    };
  });

  const perTransformCounts: Record<string, number> = {};
  for (const t of [...PROBE_TRANSFORMS, "original", "dataset"]) {
    perTransformCounts[t] = set.items.filter((i) => i.transform === t).length;
  }
  const results: DetectResults = {
    kind: "detect",
    createdAt: new Date().toISOString(),
    set: { dir: setDir, items: set.items.length, gallery: galleryItems(set.items).length, perTransform: perTransformCounts },
    detectors,
    skipped: built.skipped,
  };
  const runDir = newRunDir("detect", runsDir);
  writeJson(runDir, "results.json", results);
  writeJsonl(runDir, "detections.jsonl", rows);
  return { runDir, results };
}
