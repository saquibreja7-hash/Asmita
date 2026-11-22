import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSet } from "../src/buildset.ts";
import { runTrace } from "../src/tracecmd.ts";
import { SscdEmbedder } from "../src/sscd.ts";
import { PROBE_TRANSFORMS, type ProbeTransform } from "../src/setformat.ts";
import { gradient, stripes } from "../src/synthetic.ts";
import { FakeLocator, fakeTraceSscdSession } from "./support/fakes.ts";

const tmp = mkdtempSync(join(tmpdir(), "lab-bench-trace-"));
const portraits = join(tmp, "portraits");
const setDir = join(tmp, "set");
const runsDir = join(tmp, "runs");

beforeAll(async () => {
  mkdirSync(portraits, { recursive: true });
  // Three fixtures chosen for source separability: the fine stripes and the
  // two gradients sit a whole fake-SSCD bin apart, so a probe is only ever
  // bin-matched to its own original. Measured 2026-11-21 on the check
  // container's sharp/libvips: every non-faceswap probe keeps its
  // portrait's bin, the right source ranks first for all 24 probes, and no
  // wrong-source pair reaches beyond verdict 'none' (0 evidence points).
  writeFileSync(join(portraits, "p1.png"), await stripes(96, 64, 3));
  writeFileSync(join(portraits, "p2.png"), await gradient(96, 64, [32, 30, 36], [66, 64, 70]));
  writeFileSync(join(portraits, "p3.png"), await gradient(96, 64, [248, 244, 236], [204, 200, 192]));
  await buildSet(portraits, setDir, { locator: new FakeLocator() });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runTrace", () => {
  it("ranks the right source first and never calls an unrelated pair strong", async () => {
    const { runDir, results } = await runTrace(
      setDir,
      { faceLocator: new FakeLocator(), sscd: new SscdEmbedder({ session: fakeTraceSscdSession() }) },
      runsDir,
    );
    expect(results.kind).toBe("trace");
    expect(results.set.items).toBe(27);
    expect(results.set.gallery).toBe(3);
    expect(results.set.probes).toBe(24);
    expect(results.config.strongEvidencePoints).toBe(3.5);
    expect(results.config.possibleEvidencePoints).toBe(1.5);

    // The charter E3 metric on these fixtures: the right source ranks first
    // for every probe of every transform, and no probe-vs-non-source pair
    // is ever called a strong match (all measured 0 evidence points).
    expect(results.overall.probes).toBe(24);
    expect(results.overall.wrongSourcePairs).toBe(48); // 24 probes x 2 other originals
    expect(results.overall.top1Share).toBe(1);
    expect(results.overall.wrongSourceStrongRate).toBe(0);
    for (const t of PROBE_TRANSFORMS) {
      const stat = results.perTransform[t as ProbeTransform];
      expect(stat, `transform ${t}`).toBeDefined();
      expect(stat!.probes).toBe(3);
      expect(stat!.wrongSourcePairs).toBe(6);
      expect(stat!.top1Share).toBe(1);
      expect(stat!.wrongSourceStrongRate).toBe(0);
    }

    // The per-pair records agree, and the closely derived probes are the
    // strong ones: the WhatsApp re-encodes measure verdict 'strong' with 6
    // evidence points against their own originals (whole 128/142/116 with
    // the stripes' high-frequency detail gone, so the region, tile and SSCD
    // signals carry it), 0 against every unrelated original.
    const pairs = readFileSync(join(runDir, "pairs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(pairs).toHaveLength(72); // 24 probes x 3 gallery originals
    expect(pairs.filter((p) => p.kind === "source").every((p) => p.rank === 1)).toBe(true);
    expect(pairs.filter((p) => p.kind === "other").every((p) => p.verdict !== "strong")).toBe(true);
    const whatsapp = pairs.filter((p) => p.transform === "whatsapp" && p.kind === "source");
    expect(whatsapp).toHaveLength(3);
    expect(whatsapp.every((p) => p.verdict === "strong" && p.sscdCosine === 1)).toBe(true);
    // A mirror defeats whole-image PDQ (measured distance 118/124/144) but
    // the mirror-invariant signals still rank the right source first.
    const mirror = pairs.filter((p) => p.transform === "mirror" && p.kind === "source");
    expect(mirror.every((p) => p.rank === 1 && p.wholeDistance > 31)).toBe(true);

    // results.json on disk is the same object; trace.md carries the
    // aggregate tables and the charter comparison.
    expect(JSON.parse(readFileSync(join(runDir, "results.json"), "utf8"))).toEqual(results);
    const md = readFileSync(join(runDir, "trace.md"), "utf8");
    expect(md).toContain("| whatsapp | 3 | 3/3 (100.0%) | 0/6 (0.0%) |");
    expect(md).toContain("| **overall** | 24 | 24/24 (100.0%) | 0/48 (0.0%) |");
    expect(md).toContain("charter target");
  }, 60_000);

  it("reports the honest note when no SSCD model is configured", async () => {
    // An empty models directory forces sscdConfigured false without
    // depending on whether weights were fetched locally. The run still
    // completes, every pair scores without the sscd signal (measured:
    // top1 drops to 23/24 — the screenshot probe loses the sscd
    // tie-break — which is the honest number), and the results say so.
    const emptyModels = mkdtempSync(join(tmp, "no-models"));
    const { runDir, results } = await runTrace(
      setDir,
      { faceLocator: new FakeLocator(), sscd: new SscdEmbedder({ modelsDir: emptyModels }) },
      join(tmp, "runs2"),
    );
    expect(results.notes.some((n) => /models:fetch/.test(n))).toBe(true);
    expect(results.overall.probes).toBe(24);
    expect(results.overall.top1Share).toBeLessThan(1); // honestly worse without the second layer
    const pairs = readFileSync(join(runDir, "pairs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(pairs.every((p) => p.sscdCosine === null)).toBe(true);
    expect(existsSync(join(runDir, "trace.md"))).toBe(true);
  }, 60_000);

  it("degrades to landmarksConfigured false when the locator cannot initialise", async () => {
    class InitFailsLocator extends FakeLocator {
      async init(): Promise<void> {
        throw new Error("fake weights missing");
      }
    }
    // The init failure is reported, never thrown: the trace core gets
    // landmarksConfigured false, the region scores and alignment are
    // skipped, and the metric is still computed (measured: 24/24 top1
    // on these fixtures — the tile and SSCD signals carry the ranking).
    const { results } = await runTrace(
      setDir,
      { faceLocator: new InitFailsLocator(), sscd: new SscdEmbedder({ session: fakeTraceSscdSession() }) },
      join(tmp, "runs3"),
    );
    expect(results.notes.some((n) => /face locator failed to initialise \(fake weights missing\)/.test(n))).toBe(true);
    expect(results.overall.probes).toBe(24);
    expect(results.overall.top1Share).toBe(1);
    expect(results.overall.wrongSourceStrongRate).toBe(0);
  }, 60_000);
});
