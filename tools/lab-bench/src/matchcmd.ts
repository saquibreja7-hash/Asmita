/**
 * The `match` command: score a built set with every matching method, write
 * results.json + pair scores to a fresh run directory.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSet, galleryItems, probeItems, PROBE_TRANSFORMS, type BenchSet, type SetItem } from "./setformat.ts";
import type { FaceLocator } from "./landmarks.ts";
import { SscdEmbedder } from "./sscd.ts";
import {
  MATCH_METHODS,
  SCORE_KINDS,
  backgroundMasked,
  faceCrop,
  hashForPdq,
  pairScores,
  aggregate,
  type MatchDeps,
  type MatchMethodId,
  type MatchResults,
  type MethodResult,
  type PdqRep,
  type Reps,
} from "./matching.ts";
import { defaultModelsDir, newRunDir, writeJson, writeJsonl } from "./runs.ts";

export async function loadSet(setDir: string): Promise<{ set: BenchSet; buffers: Map<string, Buffer> }> {
  const set = parseSet(JSON.parse(readFileSync(join(setDir, "set.json"), "utf8")));
  const buffers = new Map<string, Buffer>();
  for (const item of set.items) {
    buffers.set(item.id, readFileSync(join(setDir, item.file)));
  }
  return { set, buffers };
}

/** Per-item representations for every method (None where unavailable). */
export async function computeReps(
  items: SetItem[],
  buffers: Map<string, Buffer>,
  deps: MatchDeps,
): Promise<{ reps: Map<string, Reps>; faceFailures: number; sscdFailures: number }> {
  const locator: FaceLocator | undefined = deps.faceLocator;
  const sscd = deps.sscd;
  const faceCache = new Map<string, Awaited<ReturnType<FaceLocator["detect"]>>>();
  let faceFailures = 0;
  let sscdFailures = 0;
  const locate = async (id: string): Promise<Awaited<ReturnType<FaceLocator["detect"]>> | undefined> => {
    if (!locator) return undefined;
    if (!faceCache.has(id)) {
      try {
        faceCache.set(id, await locator.detect(buffers.get(id)!));
      } catch {
        faceCache.set(id, []);
      }
    }
    return faceCache.get(id)!;
  };

  const reps = new Map<string, Reps>();
  for (const item of items) {
    const buffer = buffers.get(item.id)!;
    const rep: Reps = {
      pdq: null,
      sscd: null,
      "pdq-face": null,
      "pdq-background": null,
    };
    // Whole-image PDQ.
    try {
      const { hash, quality } = await hashForPdq(buffer);
      rep.pdq = { hash, quality };
    } catch {
      rep.pdq = null;
    }
    // SSCD.
    if (sscd?.available) {
      try {
        rep.sscd = await sscd.embed(buffer);
      } catch {
        rep.sscd = null;
        sscdFailures++;
      }
    }
    // Region methods.
    const faces = await locate(item.id);
    if (faces && faces.length > 0) {
      const face = faces[0]!;
      try {
        const cropBuffer = await faceCrop(buffer, face);
        const { hash, quality } = await hashForPdq(cropBuffer);
        rep["pdq-face"] = { hash, quality };
      } catch {
        faceFailures++;
      }
      try {
        const bgBuffer = await backgroundMasked(buffer, face);
        const { hash, quality } = await hashForPdq(bgBuffer);
        rep["pdq-background"] = { hash, quality };
      } catch {
        faceFailures++;
      }
    }
    reps.set(item.id, rep);
  }
  return { reps, faceFailures, sscdFailures };
}

export async function runMatch(
  setDir: string,
  deps: MatchDeps = {},
  runsDir?: string,
): Promise<{ runDir: string; results: MatchResults }> {
  const { set, buffers } = await loadSet(setDir);
  const targetFmr = deps.targetFmr ?? 0.01;
  const modelsDir = defaultModelsDir();
  const locator = deps.faceLocator;
  const sscd = deps.sscd ?? new SscdEmbedder({ modelsDir });
  let faceReady = locator !== undefined;
  let faceReason = "no face locator available";
  if (locator?.init) {
    try {
      await locator.init();
    } catch (err) {
      faceReady = false;
      faceReason = `face locator failed to initialise (${(err as Error).message})`;
    }
  }
  const { reps, faceFailures, sscdFailures } = await computeReps(set.items, buffers, {
    faceLocator: faceReady ? locator : undefined,
    sscd,
  });

  const methods: Record<MatchMethodId, MethodResult> = {} as Record<MatchMethodId, MethodResult>;
  const notes: string[] = [];
  const allScores: Array<Record<string, unknown>> = [];
  for (const method of MATCH_METHODS) {
    const available =
      method === "sscd" ? sscd.available : method === "pdq" ? true : faceReady;
    if (!available) {
      methods[method] = {
        available: false,
        reason: method === "sscd" ? (sscd as SscdEmbedder).reason ?? "SSCD unavailable" : faceReason,
        scoreKind: SCORE_KINDS[method],
        perTransform: {},
      };
      continue;
    }
    const { scores, misses } = pairScores(set.items, reps, method);
    for (const s of scores) allScores.push({ ...s });
    for (const m of misses) allScores.push({ ...m, score: null });
    methods[method] = {
      available: true,
      scoreKind: SCORE_KINDS[method],
      perTransform: aggregate(scores, method, set.items, targetFmr),
    };
  }
  if (faceFailures > 0) notes.push(`${faceFailures} region hashing failures (no usable face or crop)`);
  if (sscdFailures > 0) notes.push(`${sscdFailures} SSCD embedding failures`);

  const perTransformCounts: Record<string, number> = {};
  for (const t of PROBE_TRANSFORMS) perTransformCounts[t] = set.items.filter((i) => i.transform === t).length;

  const results: MatchResults = {
    kind: "match",
    createdAt: new Date().toISOString(),
    set: {
      dir: setDir,
      items: set.items.length,
      gallery: galleryItems(set.items).length,
      probes: probeItems(set.items).length,
      perTransform: perTransformCounts,
    },
    config: { targetFmr },
    methods,
    notes,
  };
  const runDir = newRunDir("match", runsDir);
  writeJson(runDir, "results.json", results);
  writeJsonl(runDir, "pairs.jsonl", allScores);
  return { runDir, results };
}
