import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { renderHtml, renderMarkdown, runReport } from "../src/reportcmd.ts";
import { newRunDir, writeJson } from "../src/runs.ts";
import type { MatchResults, MethodResult } from "../src/matching.ts";
import type { DetectResults } from "../src/detectcmd.ts";

const tmp = mkdtempSync(join(tmpdir(), "lab-bench-report-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const method = (available: boolean, recall: number | null, reason?: string): MethodResult => ({
  available,
  ...(reason ? { reason } : {}),
  scoreKind: "distance",
  perTransform: available
    ? {
        crop: { recall, threshold: 19.5, fmr: 0, genuine: 3, impostor: 9, genuineMatched: 3, impostorMatched: 0, repMisses: 0 },
        whatsapp: { recall: 1, threshold: 12.5, fmr: 0.01, genuine: 3, impostor: 9, genuineMatched: 3, impostorMatched: 1, repMisses: 0 },
      }
    : {},
});

const matchResults: MatchResults = {
  kind: "match",
  createdAt: "2026-11-20T00:00:00.000Z",
  set: { dir: "/data/sets/example", items: 9, gallery: 3, probes: 6, perTransform: { crop: 3, whatsapp: 3 } },
  config: { targetFmr: 0.01 },
  methods: {
    pdq: method(true, 1),
    sscd: method(true, 0.67),
    "pdq-face": method(false, null, "SSCD model file not found (npm run models:fetch)"),
    "pdq-background": method(false, null, "no face locator available"),
  },
  notes: ["2 region hashing failures"],
};

const detectResults: DetectResults = {
  kind: "detect",
  createdAt: "2026-11-20T00:00:00.000Z",
  set: { dir: "/data/sets/example", items: 9, gallery: 3, perTransform: { faceswap: 3, original: 3 } },
  detectors: [
    {
      id: "example-detector",
      name: "Example detector",
      items: 9,
      errors: 1,
      noFace: 2,
      overallAccuracy: 0.75,
      perTransform: {
        faceswap: { n: 3, accuracy: 1, auc: 0.95, meanScoreFake: 0.9, meanScoreReal: null, errors: 0, noFace: 2 },
        original: { n: 3, accuracy: 0.67, auc: null, meanScoreFake: null, meanScoreReal: 0.2, errors: 1, noFace: 0 },
      },
    },
  ],
  skipped: [{ id: "hive", reason: "HIVE_API_KEY is not set" }],
};

describe("report rendering", () => {
  it("markdown: recall table, thresholds, skips and notes", () => {
    const md = renderMarkdown(matchResults);
    expect(md).toContain("# E1 bench report — match");
    expect(md).toContain("| crop | 100.0% | 67.0% | skipped | skipped |");
    expect(md).toContain("| whatsapp | 100.0% | 100.0% | skipped | skipped |");
    expect(md).toContain("pdq-face: skipped — SSCD model file not found");
    expect(md).toContain("note: 2 region hashing failures");
    expect(md).toContain("Recall at a 1.0% false-match rate");
  });

  it("markdown: detector table with accuracy, AUC and skipped adapters", () => {
    const md = renderMarkdown(detectResults);
    expect(md).toContain("| example-detector | faceswap | 3 | 100.0% | 95.0% |");
    expect(md).toContain("hive: skipped — HIVE_API_KEY is not set");
  });

  it("html: real tables, no scripts, escaped text", () => {
    const html = renderHtml(matchResults);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>crop</td>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("data:image");
    // Markdown cell content is escaped, not interpreted.
    const evil = renderHtml({ ...matchResults, notes: ["<img src=x onerror=alert(1)>"] });
    expect(evil).toContain("&lt;img src=x");
  });

  it("writes report.md and report.html into the run directory", () => {
    const runDir = newRunDir("match", join(tmp, "runs"));
    writeJson(runDir, "results.json", matchResults);
    const out = runReport(runDir);
    const md = readFileSync(join(runDir, "report.md"), "utf8");
    const html = readFileSync(join(runDir, "report.html"), "utf8");
    expect(md).toBe(out.markdown + "\n");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<td>crop</td>");
  });

  it("refuses a directory without results.json", () => {
    expect(() => runReport(join(tmp, "nowhere"))).toThrow();
  });
});
