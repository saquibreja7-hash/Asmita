import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEXTORTION_CORE_LABELS,
  SEXTORTION_LABELS,
  SEXTORTION_SUPPORTING_LABELS,
  type SextortionLabel,
} from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";
import { classifyWithModel } from "../../../asmita/src/lib/lab/sextortion/classify.ts";
import type { SextortionModelJson } from "../../../asmita/src/lib/lab/sextortion/model-format.ts";
import {
  checkMessagePatterns,
  type MessageCheckPatternId,
} from "../../../asmita/src/lib/lab/message-check/patterns.ts";
import { loadEvalSet } from "./evalSet.ts";
import type { DatasetRow } from "./dataset.ts";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): the evaluation
 * report for the sextortion classifier, on the hand-written eval set
 * (eval/, written separately from the generator and never used for training
 * or threshold tuning).
 *
 * Three systems, all on the same rows:
 * - rules-only: the WP93 pattern engine. Its "likely threat" flag is ≥ 2
 *   distinct rule ids — the same "a single keyword is never enough" rule the
 *   spec applies to the model.
 * - model: the WP117 classifier's combination rule (core label AND
 *   supporting label at or above their thresholds).
 * - rules+model: either fires (what /lab/message-check now runs).
 *
 * The flag ground truth is the eval row's own labels: a row is a
 * "should flag" positive exactly when it carries a core label and a
 * supporting label; hard negatives and threat-shaped rows that never meet
 * the combination rule (a plea, a bare claim) count as should-not-flag.
 */

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_PATH = path.resolve(TOOL_DIR, "../../../asmita/src/lib/lab/sextortion/model.json");

/** The WP93 rules fire as a system when at least this many distinct rule ids match. */
export const RULES_FLAG_MIN_MATCHES = 2;

export async function loadCommittedModel(): Promise<SextortionModelJson> {
  const raw = await readFile(MODEL_PATH, "utf8");
  return JSON.parse(raw) as SextortionModelJson;
}

export interface EvalRowOutcome {
  row: DatasetRow;
  modelLabels: SextortionLabel[];
  modelFlag: boolean;
  ruleMatches: MessageCheckPatternId[];
  rulesFlag: boolean;
  combinedFlag: boolean;
  /** Ground truth: the row's labels carry a core label AND a supporting label. */
  flagEligible: boolean;
}

export function evaluateSystems(model: SextortionModelJson, rows: readonly DatasetRow[]): EvalRowOutcome[] {
  const core = new Set<string>(SEXTORTION_CORE_LABELS);
  const supporting = new Set<string>(SEXTORTION_SUPPORTING_LABELS);
  return rows.map((row) => {
    const hasCore = row.labels.some((label) => core.has(label));
    const hasSupporting = row.labels.some((label) => supporting.has(label));
    const classification = classifyWithModel(model, row.text);
    const ruleMatches = checkMessagePatterns(row.text);
    const rulesFlag = ruleMatches.length >= RULES_FLAG_MIN_MATCHES;
    return {
      row,
      modelLabels: classification.labels,
      modelFlag: classification.flagged,
      ruleMatches,
      rulesFlag,
      combinedFlag: classification.flagged || rulesFlag,
      flagEligible: hasCore && hasSupporting,
    };
  });
}

export interface Prf {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

function prf(tp: number, fp: number, fn: number): Prf {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return {
    precision,
    recall,
    f1: tp === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    support: tp + fn,
  };
}

/** Flag-level precision/recall/F1 of one system over a set of outcomes. */
export function flagPrf(outcomes: readonly EvalRowOutcome[], system: "rulesFlag" | "modelFlag" | "combinedFlag"): Prf {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const outcome of outcomes) {
    const flagged = outcome[system];
    if (flagged && outcome.flagEligible) tp++;
    else if (flagged) fp++;
    else if (outcome.flagEligible) fn++;
  }
  return prf(tp, fp, fn);
}

/** Label-level precision/recall/F1 of the model for one label over a set of outcomes. */
export function labelPrf(outcomes: readonly EvalRowOutcome[], label: SextortionLabel): Prf {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const outcome of outcomes) {
    const fired = outcome.modelLabels.includes(label);
    const truth = outcome.row.labels.includes(label);
    if (fired && truth) tp++;
    else if (fired) fp++;
    else if (truth) fn++;
  }
  return prf(tp, fp, fn);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Render the full evaluation report as markdown (pasted into docs/lab/sextortion-eval.md). */
export function renderEvalMarkdown(model: SextortionModelJson, outcomes: readonly EvalRowOutcome[]): string {
  const scripts = [...new Set(outcomes.map((outcome) => outcome.row.script))];
  const lines: string[] = [];
  const systems: { id: "rulesFlag" | "modelFlag" | "combinedFlag"; name: string }[] = [
    { id: "rulesFlag", name: "rules-only (WP93, ≥ 2 rules)" },
    { id: "modelFlag", name: "model (WP117 combination rule)" },
    { id: "combinedFlag", name: "rules+model (the page)" },
  ];
  lines.push(`## The flag decision`);
  lines.push("");
  lines.push(`Eval rows: ${outcomes.length} (${outcomes.filter((o) => o.flagEligible).length} should flag, ${outcomes.filter((o) => !o.flagEligible).length} should not). Model ${model.modelVersion}, trained ${model.trainedAt}, ${model.trainRows} train / ${model.tuneRows} tuning rows, seed ${model.generatorSeed}.`);
  lines.push("");
  lines.push("| system | flagged | precision | recall | F1 |");
  lines.push("|---|---|---|---|---|");
  for (const system of systems) {
    const metrics = flagPrf(outcomes, system.id);
    lines.push(`| ${system.name} | ${outcomes.filter((o) => o[system.id]).length} | ${pct(metrics.precision)} | ${pct(metrics.recall)} | ${pct(metrics.f1)} |`);
  }
  lines.push("");
  lines.push("Per script (precision / recall per system):");
  lines.push("");
  lines.push(`| script | ${systems.map((s) => s.name).join(" | ")} |`);
  lines.push(`|---|${systems.map(() => "---").join("|")}|`);
  for (const script of scripts) {
    const subset = outcomes.filter((outcome) => outcome.row.script === script);
    lines.push(
      `| ${script} | ${systems
        .map((system) => {
          const metrics = flagPrf(subset, system.id);
          return `${pct(metrics.precision)} / ${pct(metrics.recall)}`;
        })
        .join(" | ")} |`,
    );
  }
  lines.push("");
  lines.push("## Per-label results (model), overall and by script");
  lines.push("");
  for (const script of ["all", ...scripts]) {
    const subset = script === "all" ? outcomes : outcomes.filter((outcome) => outcome.row.script === script);
    lines.push(`### ${script}`);
    lines.push("");
    lines.push("| label | support | precision | recall | F1 |");
    lines.push("|---|---|---|---|---|");
    for (const label of SEXTORTION_LABELS) {
      const metrics = labelPrf(subset, label);
      lines.push(`| ${label} | ${metrics.support} | ${pct(metrics.precision)} | ${pct(metrics.recall)} | ${pct(metrics.f1)} |`);
    }
    lines.push("");
  }
  lines.push("## Hard negatives (confusion)");
  lines.push("");
  const families = [...new Set(outcomes.filter((o) => o.row.kind === "negative").map((o) => o.row.family))];
  lines.push("| family | rows | model flags | rules flags | rules+model flags | labels that fired |");
  lines.push("|---|---|---|---|---|---|");
  for (const family of families) {
    const subset = outcomes.filter((outcome) => outcome.row.kind === "negative" && outcome.row.family === family);
    const labelCounts = new Map<SextortionLabel, number>();
    for (const outcome of subset) {
      for (const label of outcome.modelLabels) {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
    }
    const fired = [...labelCounts.entries()].map(([label, count]) => `${label} ×${count}`).join(", ");
    lines.push(
      `| ${family} | ${subset.length} | ${subset.filter((o) => o.modelFlag).length} | ${subset.filter((o) => o.rulesFlag).length} | ${subset.filter((o) => o.combinedFlag).length} | ${fired || "—"} |`,
    );
  }
  lines.push("");
  const flaggedNegatives = outcomes.filter((o) => o.row.kind === "negative" && o.combinedFlag);
  if (flaggedNegatives.length === 0) lines.push("No hard negative is flagged by any system.");
  else lines.push(`Flagged hard negatives: ${flaggedNegatives.map((o) => o.row.id).join(", ")}`);
  lines.push("");
  lines.push("## Minor routing");
  lines.push("");
  const minorFires = outcomes.filter((outcome) => outcome.modelLabels.includes("MINOR_SIGNAL"));
  const minorTruth = outcomes.filter((outcome) => outcome.row.labels.includes("MINOR_SIGNAL"));
  lines.push(
    `MINOR_SIGNAL fires on ${minorFires.length} row(s) (${minorFires.map((o) => o.row.id).join(", ") || "—"}); ${minorTruth.length} eval row(s) carry the label (${minorTruth.map((o) => o.row.id).join(", ")}).`,
  );
  lines.push("");
  return lines.join("\n");
}

/** Run the full report: committed model + eval set, printed as markdown. */
export async function evalReportMarkdown(): Promise<string> {
  const model = await loadCommittedModel();
  const rows = await loadEvalSet();
  const outcomes = evaluateSystems(model, rows);
  return renderEvalMarkdown(model, outcomes);
}
