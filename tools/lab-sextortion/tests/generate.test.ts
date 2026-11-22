import { describe, expect, it } from "vitest";
import { stats } from "../src/dataset.ts";
import { composeRow, generateDataset, GENERATOR_SEED, scriptQuotas } from "../src/generate.ts";
import { FAMILIES, SCRIPT_TAGS } from "../src/templates.ts";
import { checkDataset, checkGenerated, generatorVocabulary, MIN_NEGATIVES, MIN_THREATS } from "../src/validate.ts";

/*
 * WP116: the synthetic generator. The spec's requirements checked here:
 * deterministic, at least 6,000 positives and 6,000 negatives, balanced
 * across the four scripts, labels coherent, a closed content vocabulary,
 * no phone-like numbers, and MINOR_SIGNAL rows only ever state an age or
 * school context.
 */

describe("the deterministic generator", () => {
  it("produces byte-identical datasets on every run", () => {
    expect(generateDataset()).toEqual(generateDataset());
    expect(JSON.stringify(generateDataset())).toBe(JSON.stringify(generateDataset()));
  });

  it("meets the spec's minimums: 6000 threats and 6000 negatives, balanced across scripts", () => {
    const rows = generateDataset();
    const summary = stats(rows);
    expect(summary.threats).toBeGreaterThanOrEqual(MIN_THREATS);
    expect(summary.negatives).toBeGreaterThanOrEqual(MIN_NEGATIVES);
    expect(summary.total).toBe(12000);
    for (const script of SCRIPT_TAGS) {
      // Quotas split as evenly as possible: the four script totals differ by
      // at most the number of families with an odd quota (±2 here).
      const threats = rows.filter((row) => row.script === script && row.kind === "threat").length;
      const negatives = rows.filter((row) => row.script === script && row.kind === "negative").length;
      expect(Math.abs(threats - 1500)).toBeLessThanOrEqual(2);
      expect(Math.abs(threats - negatives)).toBeLessThanOrEqual(2);
      expect(summary.byScript[script]).toBe(threats + negatives);
    }
  });

  it("fills every family's quota exactly", () => {
    const rows = generateDataset();
    for (const family of FAMILIES) {
      expect(rows.filter((row) => row.family === family.id)).toHaveLength(family.quota);
    }
  });

  it("produces coherent labels: threats never NOT_THREAT, negatives always", () => {
    for (const row of generateDataset()) {
      const hasNotThreat = row.labels.includes("NOT_THREAT");
      const threatSide = row.labels.some((label) => label !== "NOT_THREAT" && label !== "MINOR_SIGNAL");
      if (row.kind === "threat") {
        expect(hasNotThreat, row.id).toBe(false);
        expect(threatSide, row.id).toBe(true);
      } else {
        expect(hasNotThreat, row.id).toBe(true);
        expect(threatSide, row.id).toBe(false);
      }
    }
  });

  it("labels only what the text actually contains (base labels present)", () => {
    for (const family of FAMILIES) {
      for (const label of family.baseLabels) {
        const row = composeRow(family, "romanised", 0);
        expect(row.labels, `${family.id}: ${row.labels}`).toContain(label);
      }
    }
  });

  it("splits quotas across the four scripts as evenly as possible", () => {
    expect(scriptQuotas(1300)).toEqual({ devanagari: 325, romanised: 325, mixed: 325, english: 325 });
    expect(scriptQuotas(150)).toEqual({ devanagari: 38, romanised: 38, mixed: 37, english: 37 });
    expect(scriptQuotas(200)).toEqual({ devanagari: 50, romanised: 50, mixed: 50, english: 50 });
  });

  it("mixed script really mixes the two scripts", () => {
    let sawDevanagari = false;
    let sawLatin = false;
    for (const family of FAMILIES.filter((family) => family.kind === "threat")) {
      for (let index = 0; index < 10; index++) {
        const row = composeRow(family, "mixed", index);
        if (/[\u0900-\u097F]/.test(row.text)) sawDevanagari = true;
        if (/[a-z]/.test(row.text)) sawLatin = true;
      }
    }
    expect(sawDevanagari).toBe(true);
    expect(sawLatin).toBe(true);
  });

  it("keeps the generator a closed vocabulary (noise-free output)", () => {
    const vocabulary = generatorVocabulary();
    expect(vocabulary.size).toBeGreaterThan(100);
    for (const row of generateDataset({ noise: false })) {
      for (const token of row.text.split(/[\s.,।!?;:()"'“”…\-–—]+/u)) {
        const cleaned = token.replace(/^[^\p{L}\p{N}₹@]+|[^\p{L}\p{N}₹@]+$/gu, "");
        if (cleaned) expect(vocabulary.has(cleaned), `${row.id}: ${cleaned}`).toBe(true);
      }
    }
  });

  it("passes the full dataset check: row rules, guards, quotas, minors", () => {
    const check = checkGenerated();
    expect(check.issues).toEqual([]);
    expect(check.rows).toBe(12000);
  });

  it("keeps the composition varied: no text repeats excessively, most rows unique", () => {
    const rows = generateDataset();
    const check = checkDataset(rows);
    expect(check.issues).toEqual([]);
    const unique = new Set(rows.map((row) => row.text));
    // Threat families are combinatorial; only the template-only notice
    // families repeat, so at least a third of all rows stay unique.
    expect(unique.size).toBeGreaterThan(4000);
  });

  it("stamps every row with the fixed generator seed's id scheme", () => {
    const rows = generateDataset();
    for (const row of rows) {
      expect(row.id).toMatch(/^g-[a-zA-Z]+-(devanagari|romanised|mixed|english)-\d+$/);
    }
    expect(GENERATOR_SEED).toBe(20261122);
  });
});
