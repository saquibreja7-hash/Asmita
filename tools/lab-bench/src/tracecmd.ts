/**
 * The `trace` command (experiment E3): run the site's trace scoring core —
 * imported, never copied, the exact code the survivor's browser runs — over
 * every probe x original pair of a built E1 set, and report the charter E3
 * metric (docs/lab/charter.md): the right source is found 95% of the time
 * with at most 1% wrong-source matches.
 *
 * Pipeline per item, mirroring runMatch's structure:
 *   working copy  prepareForPdq (EXIF-rotated sRGB RGBA), capped at the
 *                 trace tool's working long edge (asmita geometry:
 *                 workingSize + resizeRgbaNearest, never upscaled);
 *   face          the located face of the WORKING copy (the working copy is
 *                 re-encoded to PNG for the locator, so its coordinates are
 *                 in the same pixel frame the comparisons use);
 *   sscd          the pinned SSCD embedding of the item's own bytes (the
 *                 embedder resizes to its 320x320 square itself).
 * Every probe is scored against every gallery original with the shared core
 * (traceSignals + verdictOf), ranked by evidence points, then SSCD cosine,
 * then whole-image PDQ distance — the way the page orders candidate sources.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { loadSet } from "./matchcmd.ts";
import type { FaceLocator } from "./landmarks.ts";
import { SscdEmbedder } from "./sscd.ts";
import { galleryItems, probeItems, PROBE_TRANSFORMS, type ProbeTransform, type SetItem } from "./setformat.ts";
import { defaultModelsDir, newRunDir, writeJson, writeJsonl } from "./runs.ts";
import { prepareForPdq } from "./prepare.ts";
import { round } from "./metrics.ts";
import {
  POSSIBLE_EVIDENCE_POINTS,
  STRONG_EVIDENCE_POINTS,
  TRACE_TOOL_VERSION,
  traceSignals,
  verdictOf,
  type TraceSignals,
  type Verdict,
  type VerdictResult,
} from "../../../asmita/src/lib/lab/trace/score.ts";
import {
  resizeRgbaNearest,
  workingSize,
  type FaceLandmarks,
  type Rgba,
} from "../../../asmita/src/lib/lab/trace/geometry.ts";

/** Charter E3 targets (docs/lab/charter.md): right source found 95% of the time... */
export const CHARTER_TOP1_TARGET = 0.95;
/** ...with at most 1% wrong-source matches. */
export const CHARTER_WRONG_SOURCE_MAX = 0.01;

export type TraceDeps = {
  /** Face locator (production: HumanFaceLocator; tests inject fakes). */
  faceLocator?: FaceLocator;
  /** SSCD embedder (production: SscdEmbedder; tests inject fakes). */
  sscd?: SscdEmbedder;
};

export type TracePairScore = {
  probe: string;
  gallery: string;
  transform: ProbeTransform;
  /** "source": the gallery original the probe was built from; "other": the rest. */
  kind: "source" | "other";
  /** Rank of this gallery original for this probe, 1 = best. */
  rank: number;
  verdict: Verdict;
  points: number;
  sscdCosine: number | null;
  wholeDistance: number | null;
};

export type TraceStat = {
  probes: number;
  /** Share of probes whose right source (probe.sourceId) ranks first. */
  top1Share: number | null;
  wrongSourcePairs: number;
  /** Share of probe-vs-non-source pairs the tool calls a strong match. */
  wrongSourceStrongRate: number | null;
};

export type TraceResults = {
  kind: "trace";
  createdAt: string;
  set: { dir: string; items: number; gallery: number; probes: number; perTransform: Record<string, number> };
  config: { strongEvidencePoints: number; possibleEvidencePoints: number };
  overall: TraceStat;
  perTransform: Partial<Record<ProbeTransform, TraceStat>>;
  notes: string[];
};

/**
 * The trace tool's working copy: the crawler's decode (EXIF-rotated sRGB
 * RGBA, canvas alpha round trip) capped at the working long edge — never
 * upscaled — with the shared pure geometry helpers, so both sides of every
 * pair and both faces share one pixel frame.
 */
async function workingCopy(buffer: Buffer): Promise<Rgba> {
  const full = await prepareForPdq(buffer);
  const { width, height } = workingSize(full.width, full.height);
  if (width === full.width && height === full.height) return full;
  return resizeRgbaNearest(full, width, height);
}

/** Re-encode a working copy to PNG: the locator takes an encoded image. */
async function workingPng(img: Rgba): Promise<Buffer> {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
    raw: { width: img.width, height: img.height, channels: 4 },
  }).png().toBuffer();
}

/** Per-item trace state: the working copy, its face, its SSCD embedding. */
type TraceItemState = { working: Rgba; face: FaceLandmarks | null; sscd: number[] | null };

export async function runTrace(
  setDir: string,
  deps: TraceDeps = {},
  runsDir?: string,
): Promise<{ runDir: string; results: TraceResults }> {
  const { set, buffers } = await loadSet(setDir);
  const modelsDir = defaultModelsDir();
  const locator = deps.faceLocator;
  const sscd = deps.sscd ?? new SscdEmbedder({ modelsDir });
  // Same availability semantics as runMatch: an init failure is reported,
  // never thrown — the trace core then gets landmarksConfigured false and
  // says so per pair (landmarks_unavailable).
  let faceReady = locator !== undefined;
  let faceReason = "no face locator available";
  if (locator?.init) {
    try {
      await locator.init();
    } catch (err) {
      faceReady = false;
      faceReason = `face locator failed to initialise (${(err as Error).message})`;
    }
  }

  // Faces are located once per item, on the working copy (cached like
  // computeReps caches detections), so coordinates land in the working
  // frame; SSCD embeddings are computed once per item from the item's own
  // bytes (the embedder has its own 320x320 pipeline).
  const faceCache = new Map<string, FaceLandmarks | null>();
  const sscdCache = new Map<string, number[] | null>();
  let faceFailures = 0;
  let sscdFailures = 0;
  const locate = async (item: SetItem): Promise<FaceLandmarks | null> => {
    if (!faceReady) return null;
    if (!faceCache.has(item.id)) {
      try {
        const png = await workingPng(working.get(item.id)!);
        faceCache.set(item.id, (await locator!.detect(png))[0] ?? null);
      } catch {
        faceCache.set(item.id, null);
        faceFailures++;
      }
    }
    return faceCache.get(item.id) ?? null;
  };
  const embed = async (item: SetItem): Promise<number[] | null> => {
    if (!sscd.available) return null;
    if (!sscdCache.has(item.id)) {
      try {
        sscdCache.set(item.id, await sscd.embed(buffers.get(item.id)!));
      } catch {
        sscdCache.set(item.id, null);
        sscdFailures++;
      }
    }
    return sscdCache.get(item.id) ?? null;
  };

  const working = new Map<string, Rgba>();
  const state = new Map<string, TraceItemState>();
  for (const item of set.items) {
    working.set(item.id, await workingCopy(buffers.get(item.id)!));
  }
  for (const item of set.items) {
    state.set(item.id, { working: working.get(item.id)!, face: await locate(item), sscd: await embed(item) });
  }

  // Score every probe against every gallery original, rank per probe:
  // verdict points desc, then SSCD cosine desc, then whole-image PDQ
  // distance asc, then gallery id asc — deterministic down to the last tie.
  const gallery = galleryItems(set.items);
  const probes = probeItems(set.items);
  const rows: TracePairScore[] = [];
  let probesRight = 0;
  let wrongSourcePairs = 0;
  let wrongSourceStrong = 0;
  const perProbes: Record<string, number> = {};
  const perRight: Record<string, number> = {};
  const perWrong: Record<string, number> = {};
  const perWrongStrong: Record<string, number> = {};
  for (const probe of probes) {
    const a = state.get(probe.id)!;
    const scored: Array<{ gallery: SetItem; kind: "source" | "other"; signals: TraceSignals; verdict: VerdictResult }> = [];
    for (const g of gallery) {
      const b = state.get(g.id)!;
      const signals = traceSignals({
        suspect: a.working,
        original: b.working,
        suspectFace: a.face,
        originalFace: b.face,
        suspectSscd: a.sscd,
        originalSscd: b.sscd,
        sscdConfigured: sscd.available,
        landmarksConfigured: faceReady,
      });
      scored.push({ gallery: g, kind: g.id === probe.sourceId ? "source" : "other", signals, verdict: verdictOf(signals) });
    }
    const cosine = (s: TraceSignals): number => (s.sscd ? s.sscd.cosine : -Infinity);
    const distance = (s: TraceSignals): number => (s.whole ? s.whole.distance : Infinity);
    scored.sort((x, y) => {
      if (x.verdict.points !== y.verdict.points) return y.verdict.points - x.verdict.points;
      if (cosine(x.signals) !== cosine(y.signals)) return cosine(y.signals) - cosine(x.signals);
      if (distance(x.signals) !== distance(y.signals)) return distance(x.signals) - distance(y.signals);
      return x.gallery.id < y.gallery.id ? -1 : 1;
    });
    // probeItems filters to probe transforms; its filter is not a type guard.
    const transform = probe.transform as ProbeTransform;
    perProbes[transform] = (perProbes[transform] ?? 0) + 1;
    for (const [i, s] of scored.entries()) {
      rows.push({
        probe: probe.id,
        gallery: s.gallery.id,
        transform,
        kind: s.kind,
        rank: i + 1,
        verdict: s.verdict.verdict,
        points: s.verdict.points,
        sscdCosine: s.signals.sscd ? s.signals.sscd.cosine : null,
        wholeDistance: s.signals.whole ? s.signals.whole.distance : null,
      });
      if (s.kind !== "other") continue;
      perWrong[transform] = (perWrong[transform] ?? 0) + 1;
      wrongSourcePairs++;
      if (s.verdict.verdict === "strong") {
        perWrongStrong[transform] = (perWrongStrong[transform] ?? 0) + 1;
        wrongSourceStrong++;
      }
    }
    if (scored[0] && scored[0].kind === "source") {
      probesRight++;
      perRight[transform] = (perRight[transform] ?? 0) + 1;
    }
  }

  const stat = (probes: number, right: number, pairs: number, strong: number): TraceStat => ({
    probes,
    top1Share: probes === 0 ? null : round(right / probes, 4),
    wrongSourcePairs: pairs,
    wrongSourceStrongRate: pairs === 0 ? null : round(strong / pairs, 4),
  });
  const overall = stat(probes.length, probesRight, wrongSourcePairs, wrongSourceStrong);
  const perTransform: TraceResults["perTransform"] = {};
  for (const t of PROBE_TRANSFORMS) {
    if ((perProbes[t] ?? 0) === 0) continue; // transform absent from this set
    perTransform[t] = stat(perProbes[t]!, perRight[t] ?? 0, perWrong[t] ?? 0, perWrongStrong[t] ?? 0);
  }

  const notes: string[] = [];
  if (!sscd.available) {
    notes.push(
      `SSCD model not configured (${sscd.reason ?? "unavailable"}) — every pair is scored without the sscd signal (sscd_model_not_configured)`,
    );
  }
  if (!faceReady) {
    notes.push(
      `face landmarks unavailable (${faceReason}) — region scores and alignment are skipped on every pair (landmarks_unavailable)`,
    );
  }
  if (faceFailures > 0) notes.push(`${faceFailures} face detection failures`);
  if (sscdFailures > 0) notes.push(`${sscdFailures} SSCD embedding failures`);

  const perTransformCounts: Record<string, number> = {};
  for (const t of PROBE_TRANSFORMS) perTransformCounts[t] = set.items.filter((i) => i.transform === t).length;
  const results: TraceResults = {
    kind: "trace",
    createdAt: new Date().toISOString(),
    set: {
      dir: setDir,
      items: set.items.length,
      gallery: gallery.length,
      probes: probes.length,
      perTransform: perTransformCounts,
    },
    config: { strongEvidencePoints: STRONG_EVIDENCE_POINTS, possibleEvidencePoints: POSSIBLE_EVIDENCE_POINTS },
    overall,
    perTransform,
    notes,
  };

  const runDir = newRunDir("trace", runsDir);
  writeJson(runDir, "results.json", results);
  writeJsonl(runDir, "pairs.jsonl", rows as unknown as Array<Record<string, unknown>>);
  writeFileSync(join(runDir, "trace.md"), `${renderTraceMarkdown(results)}\n`);
  process.stdout.write(`${summaryLines(results, probesRight, wrongSourceStrong).join("\n")}\n`);
  return { runDir, results };
}

const pct = (x: number | null | undefined): string => (x === null || x === undefined ? "—" : `${(100 * x).toFixed(1)}%`);

/** The charter-metric summary lines, for stdout and the bottom of trace.md. */
function summaryLines(results: TraceResults, right: number, strong: number): string[] {
  const { overall } = results;
  const top1Verdict = overall.top1Share === null ? "—" : overall.top1Share >= CHARTER_TOP1_TARGET ? "met" : "below target";
  const wrongVerdict =
    overall.wrongSourceStrongRate === null
      ? "—"
      : overall.wrongSourceStrongRate <= CHARTER_WRONG_SOURCE_MAX
        ? "met"
        : "above target";
  return [
    `right source ranked first: ${right}/${overall.probes} probes (${pct(overall.top1Share)}) — ` +
      `charter target ${pct(CHARTER_TOP1_TARGET)} (${top1Verdict})`,
    `wrong-source strong verdicts: ${strong}/${overall.wrongSourcePairs} pairs (${pct(overall.wrongSourceStrongRate)}) — ` +
      `charter target at most ${pct(CHARTER_WRONG_SOURCE_MAX)} (${wrongVerdict})`,
  ];
}

/** Aggregate tables only — per-pair scores live beside this file in pairs.jsonl. */
export function renderTraceMarkdown(results: TraceResults): string {
  const share = (rate: number | null, n: number): string =>
    rate === null ? "—" : `${Math.round(rate * n)}/${n} (${pct(rate)})`;
  const lines: string[] = [];
  lines.push(`# E3 trace bench report — ${results.kind}`, "");
  lines.push(`- created: ${results.createdAt}`);
  lines.push(`- set: ${results.set.dir} (${results.set.items} items, ${results.set.gallery} gallery, ${results.set.probes} probes)`);
  lines.push(`- tool: ${TRACE_TOOL_VERSION}`);
  lines.push("");
  lines.push(
    `The charter E3 metric on this set: for every probe, the gallery originals are ranked by the trace core's ` +
      `verdict (evidence points, then SSCD cosine, then whole-image PDQ distance, then id) — the share of probes ` +
      `whose right source (${"probe.sourceId"}) ranks first — and the share of probe-vs-non-source pairs the tool ` +
      `calls a strong match, its operating point. Strong needs ${results.config.strongEvidencePoints} evidence ` +
      `points plus one clear signal; possible needs ${results.config.possibleEvidencePoints}.`,
    "",
  );
  lines.push("| transform | probes | right source first | wrong-source strong |");
  lines.push("|---|---|---|---|");
  for (const t of PROBE_TRANSFORMS) {
    const s = results.perTransform[t];
    if (!s) continue; // transform absent from this set
    lines.push(`| ${t} | ${s.probes} | ${share(s.top1Share, s.probes)} | ${share(s.wrongSourceStrongRate, s.wrongSourcePairs)} |`);
  }
  const o = results.overall;
  lines.push(
    `| **overall** | ${o.probes} | ${share(o.top1Share, o.probes)} | ${share(o.wrongSourceStrongRate, o.wrongSourcePairs)} |`,
    "",
  );
  lines.push(
    `Charter targets: the right source found ${pct(CHARTER_TOP1_TARGET)} of the time, at most ${pct(CHARTER_WRONG_SOURCE_MAX)} wrong-source matches.`,
  );
  const right = o.top1Share === null ? 0 : Math.round(o.top1Share * o.probes);
  const strong = o.wrongSourceStrongRate === null ? 0 : Math.round(o.wrongSourceStrongRate * o.wrongSourcePairs);
  for (const line of summaryLines(results, right, strong)) lines.push(`- ${line}`);
  lines.push("");
  for (const note of results.notes) lines.push(`- note: ${note}`);
  lines.push("");
  lines.push("Generated by tools/lab-bench (`trace`). Aggregate numbers only; per-pair scores live beside this file in pairs.jsonl.");
  return lines.join("\n");
}
