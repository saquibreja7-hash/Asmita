import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSet } from "../src/buildset.ts";
import { runMatch } from "../src/matchcmd.ts";
import { runReport } from "../src/reportcmd.ts";
import { SscdEmbedder } from "../src/sscd.ts";
import { PROBE_TRANSFORMS, type ProbeTransform } from "../src/setformat.ts";
import { shape } from "../src/synthetic.ts";
import { FakeLocator, fakeSscdSession } from "./support/fakes.ts";

const tmp = mkdtempSync(join(tmpdir(), "lab-bench-match-"));
const portraits = join(tmp, "portraits");
const setDir = join(tmp, "set");
const runsDir = join(tmp, "runs");

beforeAll(async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(portraits, { recursive: true });
  // Three shape fixtures chosen for hashability: originals hash at PDQ
  // quality 52, their WhatsApp re-encodes at 69-71, so every pair scores
  // (measured 2026-11-20 on the check container's sharp/libvips).
  writeFileSync(join(portraits, "p1.png"), await shape(96, 64, 1));
  writeFileSync(join(portraits, "p2.png"), await shape(96, 64, 5));
  writeFileSync(join(portraits, "p3.png"), await shape(96, 64, 9));
  await buildSet(portraits, setDir, { locator: new FakeLocator() });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runMatch", () => {
  it("scores every pair and reports recall at 1% FMR per transform", async () => {
    const { runDir, results } = await runMatch(
      setDir,
      { faceLocator: new FakeLocator(), sscd: new SscdEmbedder({ session: fakeSscdSession() }) },
      runsDir,
    );
    expect(results.kind).toBe("match");
    expect(results.set.items).toBe(27);
    expect(results.set.gallery).toBe(3);
    expect(results.set.probes).toBe(24);
    expect(results.config.targetFmr).toBe(0.01);

    // The production baseline is always available.
    const pdq = results.methods.pdq;
    expect(pdq.available).toBe(true);
    expect(pdq.scoreKind).toBe("distance");
    for (const t of PROBE_TRANSFORMS) {
      const stat = pdq.perTransform[t as ProbeTransform];
      expect(stat, `transform ${t}`).toBeDefined();
      expect(stat!.genuine).toBe(3); // one genuine pair per portrait
      expect(stat!.impostor).toBe(3 * 2 + 3); // probes x other originals + gallery noise floor
      expect(stat!.recall).not.toBeNull();
    }

    // A WhatsApp re-encode is a near-duplicate: whole-image PDQ finds it.
    // Measured on these fixtures: genuine distances 28/14/6 against a
    // smallest impostor distance far above them, so recall is 3/3.
    expect(pdq.perTransform.whatsapp!.recall).toBe(1);
    // And the known PDQ weakness is visible in the same table: a mirror
    // flip defeats whole-image PDQ (measured genuine distances 128/134/124,
    // above every calibrated threshold), so recall on it is zero.
    expect(pdq.perTransform.mirror!.recall).toBe(0);

    // Region and SSCD methods ran with the injected fakes.
    expect(results.methods.sscd.available).toBe(true);
    expect(results.methods["pdq-face"].available).toBe(true);
    expect(results.methods["pdq-background"].available).toBe(true);
    for (const id of ["sscd", "pdq-face", "pdq-background"] as const) {
      expect(Object.keys(results.methods[id].perTransform)).toContain("whatsapp");
    }

    // The run directory holds the pair scores.
    expect(existsSync(join(runDir, "results.json"))).toBe(true);
    expect(existsSync(join(runDir, "pairs.jsonl"))).toBe(true);
    const pairs = readFileSync(join(runDir, "pairs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(pairs.some((p) => p.kind === "genuine" && p.method === "pdq")).toBe(true);
    expect(pairs.some((p) => p.kind === "impostor" && p.method === "sscd")).toBe(true);
    expect(new Set(pairs.map((p) => p.method))).toContain("pdq-face");

    // report renders from the same run directory.
    const report = runReport(runDir);
    expect(report.markdown).toContain("Recall at a 1.0% false-match rate");
    expect(report.markdown).toContain("faceswap+whatsapp");
    expect(existsSync(join(runDir, "report.md"))).toBe(true);
    expect(existsSync(join(runDir, "report.html"))).toBe(true);
  });

  it("marks unavailable methods with reasons and never fails the run", async () => {
    // Force the unavailable paths with an empty models directory, so the
    // test does not depend on whether weights were fetched locally.
    const emptyModels = mkdtempSync(join(tmp, "no-models"));
    const { results } = await runMatch(setDir, { sscd: new SscdEmbedder({ modelsDir: emptyModels }) }, join(tmp, "runs2"));
    // The models directory is empty: SSCD is skipped with a hint.
    expect(results.methods.sscd.available).toBe(false);
    expect(results.methods.sscd.reason).toMatch(/models:fetch/);
    // No locator injected: the region methods are skipped too.
    expect(results.methods["pdq-face"].available).toBe(false);
    expect(results.methods["pdq-background"].available).toBe(false);
    expect(results.methods["pdq-face"].reason).toMatch(/face locator/);
    // Plain PDQ still runs.
    expect(results.methods.pdq.available).toBe(true);
  });
});
