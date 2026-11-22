import type { ScriptTag } from "./templates.ts";
import type { SextortionLabel } from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the dataset row
 * format and JSONL I/O for the synthetic generator and the hand-written
 * evaluation set. The generated training data lives under data/ (gitignored,
 * never committed); the evaluation set lives under eval/ (committed).
 */

export interface DatasetRow {
  /** g-… for generated rows, et-/en-… for evaluation rows. */
  id: string;
  kind: "threat" | "negative";
  family: string;
  script: ScriptTag;
  /** Canonical taxonomy order, no duplicates. */
  labels: SextortionLabel[];
  text: string;
}

export function rowToJson(row: DatasetRow): string {
  return JSON.stringify(row);
}

export function parseRows(jsonl: string): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as DatasetRow);
  }
  return rows;
}

export function rowsToJsonl(rows: readonly DatasetRow[]): string {
  return rows.map(rowToJson).join("\n") + "\n";
}

/** Split text into content tokens, punctuation and markers stripped. */
export function tokenize(text: string): string[] {
  return text
    .split(/[\s.,!?;:()"'“”…\-–—]+/u)
    .map((token) => token.replace(/^[^\p{L}\p{N}₹@]+|[^\p{L}\p{N}₹@]+$/gu, ""))
    .filter((token) => token.length > 0);
}

export interface DatasetStats {
  total: number;
  threats: number;
  negatives: number;
  byScript: Record<string, number>;
  byFamily: Record<string, number>;
  labelCounts: Record<string, number>;
}

export function stats(rows: readonly DatasetRow[]): DatasetStats {
  const byScript: Record<string, number> = {};
  const byFamily: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  let threats = 0;
  for (const row of rows) {
    byScript[row.script] = (byScript[row.script] ?? 0) + 1;
    byFamily[row.family] = (byFamily[row.family] ?? 0) + 1;
    if (row.kind === "threat") threats++;
    for (const label of row.labels) labelCounts[label] = (labelCounts[label] ?? 0) + 1;
  }
  return {
    total: rows.length,
    threats,
    negatives: rows.length - threats,
    byScript,
    byFamily,
    labelCounts,
  };
}
