import {
  isSextortionLabel,
  SEXTORTION_LABELS,
  sortSextortionLabels,
} from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";
import { tokenize, type DatasetRow } from "./dataset.ts";
import { generateDataset, GENERATOR_SEED, GENERATOR_VERSION } from "./generate.ts";
import { SLOTS } from "./slots.ts";
import { FAMILIES, SCRIPT_TAGS } from "./templates.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): validation for the
 * synthetic training data and the hand-written evaluation set.
 *
 * The generator's text is a CLOSED VOCABULARY: every token comes from the
 * template frames and the slot pools in this package. That property is what
 * makes the spec's content rules structural rather than aspirational — no
 * slur, real name, or real number can appear in generated text, because it
 * can only come from the reviewed constants in templates.ts and slots.ts.
 * The checks below re-derive the vocabulary and assert it, plus pattern
 * guards (long digit runs, unexpected URLs or email addresses) that hold
 * for both datasets.
 *
 * The evaluation set additionally has a committed, reviewed token snapshot
 * (eval/vocabulary.json): every word a human reviewer must have seen. If
 * eval text changes, the snapshot must be regenerated and re-reviewed.
 */

export interface ValidationIssue {
  row?: string;
  message: string;
}

// ------------------------------------------------------------ row rules ----

export function rowIssues(row: DatasetRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (message: string) => issues.push({ row: row.id, message });
  if (!row.id) push("row has an empty id");
  if (row.kind !== "threat" && row.kind !== "negative") push(`bad kind ${row.kind}`);
  if (!SCRIPT_TAGS.includes(row.script)) push(`bad script ${row.script}`);
  if (!row.family) push("row has an empty family");
  if (!row.text || !row.text.trim()) push("row has empty text");
  for (const label of row.labels) {
    if (!isSextortionLabel(label)) push(`unknown label ${label}`);
  }
  if (row.labels.length === 0) push("row has no labels");
  if (row.labels.length !== new Set(row.labels).size) push("row has duplicate labels");
  const sorted = sortSextortionLabels(row.labels.filter(isSextortionLabel));
  if (row.labels.join(",") !== sorted.join(",")) push(`labels not in canonical order: ${row.labels.join(",")}`);
  const hasNotThreat = row.labels.includes("NOT_THREAT");
  const threatSide = row.labels.some((label) => label !== "NOT_THREAT" && label !== "MINOR_SIGNAL");
  if (row.kind === "threat") {
    if (hasNotThreat) push("threat row carries NOT_THREAT");
    if (!threatSide) push("threat row has no threat-side label");
  } else {
    if (!hasNotThreat) push("negative row missing NOT_THREAT");
    if (threatSide) push("negative row carries a threat-side label");
  }
  return issues;
}

// -------------------------------------------------------- pattern guards ----

// A real-looking phone number: 10+ consecutive digits. Generated amounts are
// at most 5 digits, the helpline 1930 is 4; placeholders are 98XXXXXX00.
const LONG_DIGIT_RUN = /[0-9]{10,}/;

// Only the site's own published helpline address may appear (awareness rows).
const ALLOWED_ADDRESS = "cybercrime.gov.in";
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+(?:com|in|org|net|io)\b/gi;
// Synthetic UPI handles, test-domain style, as in the WP93 fixtures.
const ALLOWED_HANDLES = new Set(["test@upi", "user@upi"]);
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.\w+/g;

const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

export function contentIssues(row: DatasetRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (message: string) => issues.push({ row: row.id, message });
  if (LONG_DIGIT_RUN.test(row.text)) push("text contains a 10+ digit run (phone-like number)");
  for (const match of row.text.matchAll(URL_PATTERN)) {
    if (match[0].toLowerCase() !== ALLOWED_ADDRESS) push(`unexpected address: ${match[0]}`);
  }
  for (const match of row.text.matchAll(EMAIL_PATTERN)) {
    if (!ALLOWED_HANDLES.has(match[0].toLowerCase())) push(`unexpected email/handle: ${match[0]}`);
  }
  return issues;
}

// -------------------------------------------------- closed vocabulary ------

/** Every token the generator can produce: template frames and slot pools. */
export function generatorVocabulary(): Set<string> {
  const tokens = new Set<string>();
  for (const family of FAMILIES) {
    for (const list of Object.values(family.templates)) {
      for (const frame of list) {
        for (const token of tokenize(frame.replace(/\{(\w+)(\?)?\}/g, " "))) tokens.add(token);
      }
    }
  }
  for (const pool of Object.values(SLOTS)) {
    for (const value of pool) {
      for (const text of [value.dev, value.rom, value.en]) {
        for (const token of tokenize(text)) tokens.add(token);
      }
    }
  }
  return tokens;
}

// ------------------------------------------------------------- datasets ----

export interface DatasetCheck {
  issues: ValidationIssue[];
  rows: number;
}

export function checkDataset(rows: readonly DatasetRow[]): DatasetCheck {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const texts = new Map<string, number>();
  for (const row of rows) {
    issues.push(...rowIssues(row));
    issues.push(...contentIssues(row));
    if (ids.has(row.id)) issues.push({ row: row.id, message: "duplicate id" });
    ids.add(row.id);
    texts.set(row.text, (texts.get(row.text) ?? 0) + 1);
  }
  const duplicates = [...texts.values()].filter((count) => count > 1).length;
  const rowsTotal = rows.length;
  if (rowsTotal > 0) {
    // Synthetic data repeats authored frames on purpose; what must not happen
    // is a degenerate generator collapsing to a handful of strings.
    const maxRepeats = Math.max(...texts.values());
    if (maxRepeats > 100) {
      issues.push({ message: `one text repeats ${maxRepeats} times (degenerate composition?)` });
    }
    if (texts.size / rowsTotal < 0.1) {
      issues.push({ message: `only ${texts.size} unique texts in ${rowsTotal} rows` });
    }
    const duplicateRows = rowsTotal - texts.size;
    if (duplicateRows / rowsTotal > 0.9) {
      issues.push({ message: `${duplicates} duplicated texts across ${rowsTotal} rows` });
    }
  }
  return { issues, rows: rowsTotal };
}

/** The spec's minimums: 6,000 positives and 6,000 negatives, balanced across the four scripts. */
export const MIN_THREATS = 6000;
export const MIN_NEGATIVES = 6000;

export function checkGenerated(): DatasetCheck {
  const issues: ValidationIssue[] = [];
  // 1. Noise-free generation must stay inside the closed vocabulary.
  const clean = generateDataset({ noise: false });
  const vocabulary = generatorVocabulary();
  for (const row of clean) {
    for (const token of tokenize(row.text)) {
      if (!vocabulary.has(token)) issues.push({ row: row.id, message: `token outside the generator vocabulary: ${token}` });
    }
  }
  // 2. The real dataset (with noise) must satisfy the row rules, guards and quotas.
  const rows = generateDataset();
  const check = checkDataset(rows);
  issues.push(...check.issues);

  const threats = rows.filter((row) => row.kind === "threat").length;
  const negatives = rows.length - threats;
  if (threats < MIN_THREATS) issues.push({ message: `only ${threats} threat rows (need ${MIN_THREATS})` });
  if (negatives < MIN_NEGATIVES) issues.push({ message: `only ${negatives} negative rows (need ${MIN_NEGATIVES})` });
  // Balance: each script carries the same number of threats and of negatives.
  const perScript = new Map<string, { threat: number; negative: number }>();
  for (const row of rows) {
    const entry = perScript.get(row.script) ?? { threat: 0, negative: 0 };
    entry[row.kind]++;
    perScript.set(row.script, entry);
  }
  for (const [script, entry] of perScript) {
    // Balanced across scripts: each script's share of each kind is within a
    // few rows of a quarter of that kind's total (odd quotas leave remainders).
    if (Math.abs(entry.threat - MIN_THREATS / SCRIPT_TAGS.length) > 3) {
      issues.push({ message: `script ${script} carries ${entry.threat} threats (expected ~${MIN_THREATS / SCRIPT_TAGS.length})` });
    }
    if (Math.abs(entry.negative - MIN_NEGATIVES / SCRIPT_TAGS.length) > 3) {
      issues.push({ message: `script ${script} carries ${entry.negative} negatives (expected ~${MIN_NEGATIVES / SCRIPT_TAGS.length})` });
    }
  }
  // Family quotas must be met exactly.
  for (const family of FAMILIES) {
    const count = rows.filter((row) => row.family === family.id).length;
    if (count !== family.quota) issues.push({ message: `family ${family.id} produced ${count} rows, expected ${family.quota}` });
  }
  // MINOR_SIGNAL rows must only ever state an age or school context.
  for (const row of rows) {
    if (row.labels.includes("MINOR_SIGNAL") && row.kind === "threat") {
      if (!/class|school|saal|student|कक्षा|स्कूल|padh|umar|साल|years old/i.test(row.text)) {
        issues.push({ row: row.id, message: "MINOR_SIGNAL threat row has no age or school statement" });
      }
    }
  }
  return { issues, rows: rows.length };
}

export function checkEval(rows: readonly DatasetRow[], snapshot: readonly string[]): DatasetCheck {
  const issues: ValidationIssue[] = [];
  const check = checkDataset(rows);
  issues.push(...check.issues);
  const threats = rows.filter((row) => row.kind === "threat").length;
  const negatives = rows.length - threats;
  if (threats < 120) issues.push({ message: `only ${threats} eval threats (need at least 120)` });
  if (negatives < 180) issues.push({ message: `only ${negatives} eval negatives (need at least 180)` });
  if (rows.length < 300) issues.push({ message: `only ${rows.length} eval rows (need at least 300)` });
  // The eval set is hand-written: no invisible characters at all.
  for (const row of rows) {
    if (INVISIBLE.test(row.text)) issues.push({ row: row.id, message: "eval text contains invisible characters" });
  }
  // Every script appears in both halves, and every taxonomy label appears.
  for (const script of SCRIPT_TAGS) {
    if (!rows.some((row) => row.script === script && row.kind === "threat")) {
      issues.push({ message: `no eval threat in script ${script}` });
    }
    if (!rows.some((row) => row.script === script && row.kind === "negative")) {
      issues.push({ message: `no eval negative in script ${script}` });
    }
  }
  const present = new Set(rows.flatMap((row) => row.labels));
  for (const label of SEXTORTION_LABELS) {
    if (!present.has(label)) issues.push({ message: `eval set never uses label ${label}` });
  }
  // The committed vocabulary snapshot must match the eval text exactly.
  const tokens = [...new Set(rows.flatMap((row) => tokenize(row.text)))].sort();
  const expected = [...snapshot].sort();
  if (tokens.join("\n") !== expected.join("\n")) {
    const missing = expected.filter((token) => !tokens.includes(token));
    const added = tokens.filter((token) => !expected.includes(token));
    issues.push({
      message: `eval vocabulary snapshot out of date (missing ${missing.length}, added ${added.length}; run: npm run snapshot)`,
    });
  }
  // Eval text must never appear in the generated training data.
  const generated = new Set(generateDataset().map((row) => row.text));
  for (const row of rows) {
    if (generated.has(row.text)) issues.push({ row: row.id, message: "eval text also appears in generated training data" });
  }
  return { issues, rows: rows.length };
}

export { GENERATOR_SEED, GENERATOR_VERSION };
