import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rowsToJsonl, stats, tokenize, type DatasetRow } from "./dataset.ts";
import { loadEvalSet, loadEvalSnapshot, writeEvalSnapshot, EVAL_DIR } from "./evalSet.ts";
import { generateDataset, GENERATOR_SEED, GENERATOR_VERSION } from "./generate.ts";
import { checkEval, checkGenerated } from "./validate.ts";
import { trainSextortionModel, TRAINER_VERSION, TRAINED_AT } from "./train.ts";
import { evalReportMarkdown } from "./evaluate.ts";

/*
 * WP116 + WP117 (docs/research/research-tools-spec.md, Track D): the
 * lab-sextortion tool's command line.
 *
 *   npm run generate     — write the deterministic dataset to data/ (gitignored)
 *   npm run validate     — full validation of generated data and the eval set
 *   npm run snapshot     — regenerate eval/vocabulary.json after review
 *   npm run stats        — print dataset counts
 *   npm run train        — train the classifier, write the app's model.json
 *   npm run eval-report  — score the committed model on the hand-written eval set
 *
 * The generated training data is never committed (public repo); it is
 * rebuilt from this package's constants in a deterministic way, so nothing
 * is lost by keeping it out of git.
 */

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(TOOL_DIR, "../data");
const MODEL_PATH = path.resolve(TOOL_DIR, "../../../asmita/src/lib/lab/sextortion/model.json");

async function writeData() {
  const rows = generateDataset();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "generated.jsonl"), rowsToJsonl(rows), "utf8");
  const summary = stats(rows);
  const manifest = {
    seed: GENERATOR_SEED,
    version: GENERATOR_VERSION,
    total: summary.total,
    threats: summary.threats,
    negatives: summary.negatives,
    byScript: summary.byScript,
    byFamily: summary.byFamily,
    labelCounts: summary.labelCounts,
  };
  await writeFile(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`wrote ${rows.length} rows to ${DATA_DIR} (seed ${GENERATOR_SEED}, version ${GENERATOR_VERSION})`);
}

function printIssues(title: string, issues: { row?: string; message: string }[]) {
  console.log(`${title}: ${issues.length === 0 ? "OK" : `${issues.length} issue(s)`}`);
  for (const issue of issues.slice(0, 40)) {
    console.log(`  - ${issue.row ? `[${issue.row}] ` : ""}${issue.message}`);
  }
  if (issues.length > 40) console.log(`  … and ${issues.length - 40} more`);
}

async function validate() {
  let failed = false;

  const generated = checkGenerated();
  printIssues("generated dataset", generated.issues);
  failed ||= generated.issues.length > 0;

  const evalRows = await loadEvalSet();
  const snapshot = await loadEvalSnapshot();
  const evalCheck = checkEval(evalRows, snapshot);
  printIssues(`eval set (${evalCheck.rows} rows)`, evalCheck.issues);
  failed ||= evalCheck.issues.length > 0;

  console.log(
    `summary: generated ${generated.rows} rows; eval ${evalCheck.rows} rows ` +
      `(${evalRows.filter((row: DatasetRow) => row.kind === "threat").length} threats, ` +
      `${evalRows.filter((row: DatasetRow) => row.kind === "negative").length} negatives)`,
  );
  if (failed) {
    console.log("VALIDATION FAILED");
    process.exitCode = 1;
  } else {
    console.log("VALIDATION PASSED");
  }
}

async function snapshot() {
  const rows = await loadEvalSet();
  const tokens = [...new Set(rows.flatMap((row) => tokenize(row.text)))].sort();
  const file = await writeEvalSnapshot(tokens);
  console.log(`wrote ${tokens.length} reviewed tokens to ${file}`);
  console.log("review the word list before committing: every word must be clinical, invented and name-free.");
}

async function printStats() {
  const rows = generateDataset();
  const summary = stats(rows);
  console.log(JSON.stringify(summary, null, 2));
}

async function train() {
  const started = Date.now();
  console.log(`training the WP117 classifier (trainer v${TRAINER_VERSION}, trainedAt ${TRAINED_AT})…`);
  const { model, labelFits, perLabelThresholds, shift } = trainSextortionModel();
  const body = JSON.stringify(model) + "\n";
  await writeFile(MODEL_PATH, body, "utf8");
  console.log(
    `rows: ${model.trainRows} train + ${model.tuneRows} tuning (split 1/${"SPLIT_EVERY"}) · hashBits 2^${Math.log2(model.hashBits)} · quantScale ${model.quantScale}`,
  );
  console.log("label           epochs  tuneF1  threshold");
  for (const fit of labelFits) {
    const choice = perLabelThresholds[labelFits.indexOf(fit)];
    console.log(
      `${fit.label.padEnd(24)}${String(fit.epochs).padStart(6)}  ${fit.bestF1.toFixed(3)}  loss ${fit.bestLoss.toFixed(3)}  ${choice.threshold.toFixed(3)} (f1 ${choice.f1.toFixed(3)}, p ${choice.precision.toFixed(3)}, r ${choice.recall.toFixed(3)})`,
    );
  }
  console.log(
    `flag rule on tuning after shift δ=${shift.shift.toFixed(3)}: precision ${shift.metrics.precision.toFixed(3)} (target ≥ ${(0.95).toFixed(2)}), recall ${shift.metrics.recall.toFixed(3)}, false flags ${shift.metrics.falseFlags} (${shift.negativeFalseFlags} on hard negatives)`,
  );
  const bytes = Buffer.byteLength(body, "utf8");
  console.log(`wrote ${MODEL_PATH} (${(bytes / 1024).toFixed(1)} KiB, spec cap 2048 KiB) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function printEvalReport() {
  console.log(await evalReportMarkdown());
}

const command = process.argv[2] ?? "validate";
if (command === "generate") await writeData();
else if (command === "validate") await validate();
else if (command === "snapshot") await snapshot();
else if (command === "stats") await printStats();
else if (command === "train") await train();
else if (command === "eval-report") await printEvalReport();
else {
  console.error(`unknown command: ${command} (use generate | validate | snapshot | stats | train | eval-report)`);
  console.error(`eval dir: ${EVAL_DIR}`);
  process.exitCode = 1;
}
