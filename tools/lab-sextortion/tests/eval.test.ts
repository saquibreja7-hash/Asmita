import { describe, expect, it } from "vitest";
import { loadEvalSet, loadEvalSnapshot } from "../src/evalSet.ts";
import { checkDataset, checkEval, contentIssues, rowIssues } from "../src/validate.ts";
import { tokenize, type DatasetRow } from "../src/dataset.ts";

/*
 * WP116: the hand-written evaluation set. It is committed, written by hand
 * (never by the generator), covers every documented pattern of §D and every
 * taxonomy label, and is never used for training or threshold tuning.
 */

describe("the evaluation set", () => {
  it("loads and passes the full validation", async () => {
    const rows = await loadEvalSet();
    const snapshot = await loadEvalSnapshot();
    const check = checkEval(rows, snapshot);
    expect(check.issues).toEqual([]);
  });

  it("has at least 120 threats and 180 negatives, 300 rows total", async () => {
    const rows = await loadEvalSet();
    const threats = rows.filter((row) => row.kind === "threat").length;
    const negatives = rows.filter((row) => row.kind === "negative").length;
    expect(threats).toBeGreaterThanOrEqual(120);
    expect(negatives).toBeGreaterThanOrEqual(180);
    expect(rows.length).toBeGreaterThanOrEqual(300);
  });

  it("spreads threats and negatives over all four scripts", async () => {
    const rows = await loadEvalSet();
    for (const script of ["devanagari", "romanised", "mixed", "english"] as const) {
      expect(rows.filter((row) => row.script === script && row.kind === "threat").length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.script === script && row.kind === "negative").length).toBeGreaterThan(0);
    }
  });

  it("uses every taxonomy label at least once, and every threat row is labelled honestly", async () => {
    const rows = await loadEvalSet();
    const present = new Set(rows.flatMap((row) => row.labels));
    const { SEXTORTION_LABELS } = await import("../../../asmita/src/lib/lab/sextortion/taxonomy.ts");
    for (const label of SEXTORTION_LABELS) {
      expect(present.has(label), label).toBe(true);
    }
    for (const row of rows) {
      expect(rowIssues(row), row.id).toEqual([]);
      expect(contentIssues(row), row.id).toEqual([]);
    }
  });

  it("never shares text or ids with the generated training data", async () => {
    const { generateDataset } = await import("../src/generate.ts");
    const generated = new Set(generateDataset().map((row) => row.text));
    const rows = await loadEvalSet();
    for (const row of rows) {
      expect(generated.has(row.text), row.id).toBe(false);
      expect(row.id).toMatch(/^[ae][tn]-/);
    }
  });

  it("keeps the committed vocabulary snapshot in sync", async () => {
    const rows = await loadEvalSet();
    const snapshot = await loadEvalSnapshot();
    const tokens = new Set(rows.flatMap((row) => tokenize(row.text)));
    // The snapshot is the human-review artifact: every word in the eval set
    // was seen and approved, and every snapshot word is still in use.
    const snapshotWords = new Set(snapshot);
    const missing = [...tokens].filter((token) => !snapshotWords.has(token));
    expect(missing).toEqual([]);
    const stale = snapshot.filter((word) => !tokens.has(word));
    expect(stale).toEqual([]);
  });

  it("keeps MINOR_SIGNAL rows to age or school statements only", async () => {
    const rows = await loadEvalSet();
    for (const row of rows.filter((row) => row.labels.includes("MINOR_SIGNAL"))) {
      expect(/class|school|saal|student|कक्षा|स्कूल|padh|umar|साल|years old/i.test(row.text), row.id).toBe(true);
    }
  });
});

describe("row and content validators", () => {
  const base: DatasetRow = {
    id: "t-x",
    kind: "threat",
    family: "test",
    script: "romanised",
    labels: ["THREAT_EXPOSE"],
    text: "paise bhejo warna sabko bhej dunga",
  };

  it("accepts a coherent row", () => {
    expect(rowIssues(base)).toEqual([]);
    expect(contentIssues(base)).toEqual([]);
  });

  it("rejects label and kind incoherence", () => {
    expect(rowIssues({ ...base, kind: "threat", labels: ["NOT_THREAT"] }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, kind: "negative", labels: ["THREAT_EXPOSE"] }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, labels: ["DEMAND_MONEY", "THREAT_EXPOSE"] }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, labels: [] }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, labels: ["NOT_A_LABEL"] as never }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, script: "emoji" as never }).length).toBeGreaterThan(0);
    expect(rowIssues({ ...base, text: "  " }).length).toBeGreaterThan(0);
  });

  it("flags phone-like numbers and unexpected addresses", () => {
    expect(contentIssues({ ...base, id: "p1", text: "call me on 9876543210 now" }).length).toBeGreaterThan(0);
    expect(contentIssues({ ...base, id: "p2", text: "see https://example.com/page" }).length).toBeGreaterThan(0);
    expect(contentIssues({ ...base, id: "p3", text: "pay to name@example.test" }).length).toBeGreaterThan(0);
    // The allowed forms: placeholders and the site's own helpline address.
    expect(contentIssues({ ...base, id: "p4", text: "message 98XXXXXX00 or report at cybercrime.gov.in" })).toEqual([]);
  });

  it("checkDataset reports duplicate ids and degenerate composition", () => {
    const dup = [base, { ...base, id: "t-x", text: base.text }];
    const issues = checkDataset(dup).issues;
    expect(issues.some((issue) => issue.message === "duplicate id")).toBe(true);
    const degenerate = Array.from({ length: 150 }, (_, index) => ({
      ...base,
      id: `t-${index}`,
      text: "same text",
    }));
    const degenerateIssues = checkDataset(degenerate).issues;
    expect(degenerateIssues.length).toBeGreaterThan(0);
  });
});
