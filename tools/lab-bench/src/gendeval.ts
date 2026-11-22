/**
 * The `gend-eval` command (research-tools spec WP113): an honest evaluation
 * of the lab-gend service over an E1 built set — its own face-swap
 * composites against the originals they were made from — under the
 * degradation ladder in degrade.ts. Detection and alignment run inside the
 * service, after the degradation, exactly as a deployment sees the bytes.
 *
 * Per condition: ROC-AUC, accuracy at 0.5 and the no-face rate (per class),
 * each with a bootstrap 95% CI. Aggregate numbers only are written — no
 * image bytes, nothing about a person. The service's model and detector
 * revisions are pinned in services/lab-gend/gend/weights_manifest.json;
 * results.json records the endpoint the numbers came from.
 */
import { createGendDetector } from "./detectors/gend.ts";
import type { FetchLike } from "./detectors/types.ts";
import type { GendCondition } from "./degrade.ts";
import { GEND_EVAL_CONDITIONS } from "./degrade.ts";
import { conditionStats, type GendConditionStat, type GendOutcome } from "./gendstats.ts";
import { loadSet } from "./matchcmd.ts";
import { newRunDir, writeJson, writeJsonl } from "./runs.ts";
import type { SetItem } from "./setformat.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type GendEvalDeps = {
  /** Override the service endpoint and credentials (tests inject a fake). */
  url?: string;
  token?: string;
  fetchFn?: FetchLike;
  conditions?: GendCondition[];
  /** Bootstrap replicates and seed; defaults are fixed so runs are comparable. */
  replicates?: number;
  seed?: number;
};

export type GendEvalResults = {
  kind: "gend-eval";
  createdAt: string;
  set: { dir: string; items: number; originals: number; faceswaps: number };
  /** The endpoint these numbers came from; the model pin lives in the service repo. */
  service: { url: string };
  conditions: GendConditionStat[];
};

/** The items the evaluation scores: untouched originals vs face-swap composites. */
export function evalItems(items: SetItem[]): SetItem[] {
  return items.filter((i) => i.transform === "original" || i.transform === "faceswap");
}

export async function runGendEval(
  setDir: string,
  deps: GendEvalDeps = {},
  runsDir?: string,
): Promise<{ runDir: string; results: GendEvalResults }> {
  const conditions = deps.conditions ?? GEND_EVAL_CONDITIONS;
  const { set, buffers } = await loadSet(setDir);
  const items = evalItems(set.items);
  const originals = items.filter((i) => i.transform === "original").length;
  const faceswaps = items.filter((i) => i.transform === "faceswap").length;
  if (originals === 0 || faceswaps === 0) {
    throw new Error(
      `gend-eval needs both originals and faceswap composites in the set (${originals} original(s), ${faceswaps} faceswap(s)) — build it with "build-set <portraits-dir>"`,
    );
  }

  const built = createGendDetector({ url: deps.url, token: deps.token, fetchFn: deps.fetchFn });
  if ("skipped" in built) throw new Error(`gend-eval: ${built.skipped}`);
  const detector = built.detector;

  const rows: Array<Record<string, unknown>> = [];
  const perCondition: GendConditionStat[] = [];
  const replicates = deps.replicates ?? 2000;
  const seed = deps.seed ?? 20261122;

  for (const condition of conditions) {
    const outcomes: Array<{ label: boolean; outcome: GendOutcome }> = [];
    for (const item of items) {
      const degraded = condition.id === "clean" ? buffers.get(item.id)! : await condition.apply(buffers.get(item.id)!);
      const result = await detector.detect(degraded);
      const outcome: GendOutcome = "score" in result ? { score: result.score } : "noFace" in result ? { noFace: true } : { error: result.error };
      outcomes.push({ label: item.label === "fake", outcome });
      rows.push({
        condition: condition.id,
        item: item.id,
        transform: item.transform,
        label: item.label,
        ...("score" in result ? { score: result.score } : "noFace" in result ? { noFace: true } : { error: result.error }),
      });
    }
    perCondition.push(conditionStats(condition.id, condition.label, outcomes, replicates, seed));
  }

  const results: GendEvalResults = {
    kind: "gend-eval",
    createdAt: new Date().toISOString(),
    set: { dir: setDir, items: items.length, originals, faceswaps },
    service: { url: deps.url ?? process.env.LAB_GEND_URL ?? "" },
    conditions: perCondition,
  };
  const runDir = newRunDir("gend-eval", runsDir);
  writeJson(runDir, "results.json", results);
  writeJsonl(runDir, "scores.jsonl", rows);
  writeFileSync(join(runDir, "gend-eval.md"), `${renderGendEvalTable(results)}\n`);
  return { runDir, results };
}

/** The aggregate markdown table (what the doc keeps, aggregate numbers only). */
export function renderGendEvalTable(results: GendEvalResults): string {
  const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
  const ci = (c: { lo: number; hi: number } | null) => (c ? `${pct(c.lo)}–${pct(c.hi)}` : "—");
  const lines: string[] = [];
  lines.push(`| condition | real n | fake n | AUC (95% CI) | accuracy @0.5 (95% CI) | no-face real | no-face fake | errors |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const c of results.conditions) {
    lines.push(
      `| ${c.label} | ${c.nReal} | ${c.nFake} | ${pct(c.auc)} (${ci(c.aucCi)}) | ${pct(c.accuracy)} (${ci(c.accuracyCi)}) | ${pct(c.noFaceReal)} (${ci(c.noFaceRealCi)}) | ${pct(c.noFaceFake)} (${ci(c.noFaceFakeCi)}) | ${c.errors} |`,
    );
  }
  return lines.join("\n");
}
