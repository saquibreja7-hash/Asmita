import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rowsToJsonl, stats, tokenize, type DatasetRow } from "./dataset.ts";
import { loadEvalSet, loadEvalSnapshot, writeEvalSnapshot, EVAL_DIR } from "./evalSet.ts";
import { generateDataset, GENERATOR_SEED, GENERATOR_VERSION } from "./generate.ts";
import { checkEval, checkGenerated } from "./validate.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the lab-sextortion
 * tool's command line.
 *
 *   npm run generate   — write the deterministic dataset to data/ (gitignored)
 *   npm run validate   — full validation of generated data and the eval set
 *   npm run snapshot   — regenerate eval/vocabulary.json after review
 *   npm run stats      — print dataset counts
 *
 * The generated training data is never committed (public repo); it is
 * rebuilt from this package's constants in a deterministic way, so nothing
 * is lost by keeping it out of git.
 */

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(TOOL_DIR, "../data");

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

const command = process.argv[2] ?? "validate";
if (command === "generate") await writeData();
else if (command === "validate") await validate();
else if (command === "snapshot") await snapshot();
else if (command === "stats") await printStats();
else {
  console.error(`unknown command: ${command} (use generate | validate | snapshot | stats)`);
  console.error(`eval dir: ${EVAL_DIR}`);
  process.exitCode = 1;
}
