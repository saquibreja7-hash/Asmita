import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRows, type DatasetRow } from "./dataset.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the hand-written
 * evaluation set, committed under eval/. It is written by hand, separately
 * from the generator, and NEVER used for training or threshold tuning on
 * the final model — WP117's trainer reads only generated data. See
 * eval/README.md for who should replace these examples with human-reviewed
 * ones later.
 */

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));

export const EVAL_DIR = path.resolve(TOOL_DIR, "../eval");

export const EVAL_FILES = ["threats.jsonl", "negatives.jsonl"] as const;

export async function loadEvalSet(): Promise<DatasetRow[]> {
  const rows: DatasetRow[] = [];
  for (const file of EVAL_FILES) {
    const text = await readFile(path.join(EVAL_DIR, file), "utf8");
    rows.push(...parseRows(text));
  }
  return rows;
}

export async function loadEvalSnapshot(): Promise<string[]> {
  const text = await readFile(path.join(EVAL_DIR, "vocabulary.json"), "utf8");
  const parsed = JSON.parse(text) as { reviewed: string[] };
  return parsed.reviewed;
}

export async function writeEvalSnapshot(tokens: readonly string[]): Promise<string> {
  const { writeFile } = await import("node:fs/promises");
  const body = JSON.stringify({ reviewed: [...tokens].sort() }, null, 2) + "\n";
  await writeFile(path.join(EVAL_DIR, "vocabulary.json"), body, "utf8");
  return path.join(EVAL_DIR, "vocabulary.json");
}
