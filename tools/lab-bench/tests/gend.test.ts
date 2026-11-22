import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createGendDetector, gendMime, isGendNoFace } from "../src/detectors/gend.ts";
import { isNoFaceResult, isDetectionScore, type FetchLike } from "../src/detectors/types.ts";
import { gaussianBlur, GEND_EVAL_CONDITIONS, jpegQuality, maxSide, whatsappReencode } from "../src/degrade.ts";
import { bootstrapCi, conditionStats, mulberry32 } from "../src/gendstats.ts";
import { evalItems, renderGendEvalTable, runGendEval } from "../src/gendeval.ts";
import { buildSet } from "../src/buildset.ts";
import { loadSet } from "../src/matchcmd.ts";
import { gradient, shape, stripes } from "../src/synthetic.ts";
import { FakeLocator } from "./support/fakes.ts";

// WP113: the lab-gend adapter, the degradation ladder, the bootstrap stats
// and the gend-eval command — all against invented data and an injected
// fake service. Nothing here contacts a network or needs weights.

const tmp = mkdtempSync(join(tmpdir(), "lab-bench-gend-"));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// The suite must never depend on the real service; scrub the env the factory reads.
const KEYS = ["LAB_GEND_URL", "LAB_GEND_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
for (const k of KEYS) delete process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function gendResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const OK_BODY = {
  model: "GenD_CLIP_L_14@test",
  detector: "YuNet@2023mar",
  faces: [{ box: [10, 12, 140, 140], p_fake: 0.87 }],
  image_p_fake: 0.87,
  status: "ok",
  timings_ms: { decode: 5, detect: 3, score: 900, total: 908 },
};

const NO_FACE_BODY = {
  model: "GenD_CLIP_L_14@test",
  detector: "YuNet@2023mar",
  faces: [],
  image_p_fake: null,
  status: "no_face",
  timings_ms: { decode: 5, detect: 3, score: 0, total: 8 },
};

describe("GenD adapter (lab-bench)", () => {
  it("is skipped without the service URL or the token", () => {
    const r = createGendDetector({});
    expect("skipped" in r && r.skipped).toBe("LAB_GEND_URL is not set");
    const noToken = createGendDetector({ url: "http://127.0.0.1:8099" });
    expect("skipped" in noToken && noToken.skipped).toBe("LAB_GEND_TOKEN is not set");
    const fromEnv = createGendDetector({ url: process.env.LAB_GEND_URL ?? undefined });
    expect("skipped" in fromEnv).toBe(true);
  });

  it("sends the exact bytes and maps image_p_fake, no downscale", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return gendResponse(OK_BODY);
    };
    const built = createGendDetector({ url: "http://127.0.0.1:8099/", token: "test-token", fetchFn });
    expect("skipped" in built).toBe(false);
    if ("skipped" in built) throw new Error("unreachable");
    const bytes = await stripes();
    const result = await built.detector.detect(bytes);
    expect(isDetectionScore(result) && result.score).toBe(0.87);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:8099/v1/score");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const form = calls[0]!.init!.body as FormData;
    const sent = form.get("image") as Blob;
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it("maps the no-face answer and the error codes", async () => {
    const noFace: FetchLike = async () => gendResponse(NO_FACE_BODY);
    const built = createGendDetector({ url: "http://127.0.0.1:8099", token: "t", fetchFn: noFace });
    if ("skipped" in built) throw new Error("unreachable");
    const result = await built.detector.detect(await stripes());
    expect(isNoFaceResult(result)).toBe(true);

    const busy: FetchLike = async () => gendResponse({ error: "busy" }, 429);
    const other = createGendDetector({ url: "http://127.0.0.1:8099", token: "t", fetchFn: busy });
    if ("skipped" in other) throw new Error("unreachable");
    const refused = await other.detector.detect(await stripes());
    expect(!isDetectionScore(refused) && !isNoFaceResult(refused) && refused.error).toContain("gend_http_429");

    const junk: FetchLike = async () => new Response("not json", { status: 200 });
    const third = createGendDetector({ url: "http://127.0.0.1:8099", token: "t", fetchFn: junk });
    if ("skipped" in third) throw new Error("unreachable");
    const bad = await third.detector.detect(await stripes());
    expect(!isDetectionScore(bad) && !isNoFaceResult(bad) && bad.error).toBe("gend_bad_response");
  });

  it("sniffs the multipart type and the no-face reply shapes", () => {
    expect(gendMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toBe("image/png");
    expect(gendMime(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(gendMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toBe("image/jpeg");
    expect(isGendNoFace(NO_FACE_BODY)).toBe(true);
    expect(isGendNoFace({ status: "ok", image_p_fake: null })).toBe(true);
    expect(isGendNoFace(OK_BODY)).toBe(false);
    expect(isGendNoFace({ status: "ok", image_p_fake: 0.5 })).toBe(false);
  });
});

describe("the WP113 degradation ladder", () => {
  it("lists clean plus the ten degradations, in report order", () => {
    expect(GEND_EVAL_CONDITIONS.map((c) => c.id)).toEqual([
      "clean",
      "jpeg-95",
      "jpeg-75",
      "jpeg-50",
      "jpeg-30",
      "jpeg-10",
      "whatsapp-1600",
      "whatsapp-1280",
      "maxside-128",
      "blur-1",
      "blur-2",
    ]);
  });

  it("re-encodes JPEG at the asked quality, smaller file at lower quality", async () => {
    const src = await sharp(await gradient(400, 300)).jpeg({ quality: 95 }).toBuffer();
    const q95 = await jpegQuality(src, 95);
    const q10 = await jpegQuality(src, 10);
    expect((await sharp(q95).metadata()).format).toBe("jpeg");
    expect(q95.length).toBeGreaterThan(q10.length);
    // The clean condition never re-encodes.
    expect(await GEND_EVAL_CONDITIONS[0]!.apply(src)).toBe(src);
  });

  it("caps the long edge for the WhatsApp re-encode and never upscales", async () => {
    const big = await gradient(2000, 1000);
    const out = await whatsappReencode(big, 1600);
    const meta = await sharp(out).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
    const small = await gradient(200, 100);
    const kept = await whatsappReencode(small, 1600);
    const keptMeta = await sharp(kept).metadata();
    expect(Math.max(keptMeta.width ?? 0, keptMeta.height ?? 0)).toBe(200);
  });

  it("collapses the long side to 128 and blurs deterministically", async () => {
    // A shape, not a gradient: a linear ramp is invariant under Gaussian
    // blur, so the gradient fixture could not show the blur at all.
    const src = await shape(640, 480, 5);
    const tiny = await maxSide(src, 128);
    const meta = await sharp(tiny).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(128);
    const blurred1 = await gaussianBlur(src, 1);
    const blurred2 = await gaussianBlur(src, 1);
    expect(blurred1.equals(blurred2)).toBe(true);
    const heavier = await gaussianBlur(src, 2);
    expect(blurred1.equals(heavier)).toBe(false);
    expect(blurred1.equals(src)).toBe(false);
  });
});

describe("bootstrap statistics", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  it("gives a degenerate CI for a perfectly separated set", () => {
    const items = [
      { label: false, outcome: { score: 0.1 } },
      { label: false, outcome: { score: 0.2 } },
      { label: true, outcome: { score: 0.8 } },
      { label: true, outcome: { score: 0.9 } },
    ] as const;
    const ci = bootstrapCi([...items], (sample) => {
      const pos = sample.filter((i) => i.label).map((i) => (i.outcome as { score: number }).score);
      const neg = sample.filter((i) => !i.label).map((i) => (i.outcome as { score: number }).score);
      // A resample can lose a class; the statistic returns null there and
      // the CI covers the replicates where it is defined.
      return pos.length && neg.length ? 1 : null;
    }, 500, 1);
    expect(ci).toEqual({ lo: 1, hi: 1 });
  });

  it("counts no-face answers per class and scores over the rest", () => {
    const items = [
      { label: false, outcome: { score: 0.1 } },
      { label: false, outcome: { noFace: true } as const },
      { label: false, outcome: { score: 0.3 } },
      { label: false, outcome: { noFace: true } as const },
      { label: true, outcome: { score: 0.8 } },
      { label: true, outcome: { score: 0.9 } },
      { label: true, outcome: { noFace: true } as const },
    ];
    const stat = conditionStats("clean", "as stored", items, 200, 7);
    expect(stat.nReal).toBe(4);
    expect(stat.nFake).toBe(3);
    expect(stat.scored).toBe(4);
    expect(stat.auc).toBe(1);
    expect(stat.accuracy).toBe(1);
    expect(stat.noFaceReal).toBe(0.5);
    expect(stat.noFaceFake).toBeCloseTo(0.3333, 3);
    expect(stat.noFaceRealCi!.lo).toBeLessThanOrEqual(0.5);
    expect(stat.noFaceRealCi!.hi).toBeGreaterThanOrEqual(0.5);
  });
});

describe("gend-eval command", () => {
  it("refuses honestly when the service is not configured", async () => {
    const portraits = join(tmp, "unconfig-p");
    const setDir = join(tmp, "set-unconfigured");
    mkdirSync(portraits, { recursive: true });
    writeFileSync(join(portraits, "p1.png"), await stripes());
    writeFileSync(join(portraits, "p2.png"), await shape(96, 64, 7));
    await buildSet(portraits, setDir, { locator: new FakeLocator() });
    // The set is valid; only the service is missing, and the command says so.
    await expect(runGendEval(setDir, { url: undefined, token: undefined }, join(tmp, "runs"))).rejects.toThrow(
      /LAB_GEND_URL is not set/,
    );
  });

  it("needs both classes: a set without faceswaps is refused", async () => {
    const portraits = join(tmp, "solo");
    const setDir = join(tmp, "set-solo");
    mkdirSync(portraits, { recursive: true });
    writeFileSync(join(portraits, "solo.png"), await shape(96, 64, 5));
    const emptyLocator = { detect: async () => [] as never };
    await buildSet(portraits, setDir, { locator: emptyLocator });
    await expect(
      runGendEval(setDir, { url: "http://127.0.0.1:8099", token: "t" }, join(tmp, "runs")),
    ).rejects.toThrow(/needs both originals and faceswap composites/);
  });

  it("scores every item under every condition and aggregates honestly", async () => {
    const portraits = join(tmp, "eval-p");
    const setDir = join(tmp, "set-eval");
    mkdirSync(portraits, { recursive: true });
    writeFileSync(join(portraits, "p1.png"), await stripes());
    writeFileSync(join(portraits, "p2.png"), await shape(96, 64, 6));
    writeFileSync(join(portraits, "p3.png"), await gradient());
    await buildSet(portraits, setDir, { locator: new FakeLocator() });

    const { set } = await loadSet(setDir);
    const items = evalItems(set.items);
    expect(items.every((i) => i.transform === "original" || i.transform === "faceswap")).toBe(true);
    const nOriginals = items.filter((i) => i.transform === "original").length;
    const nFaceswaps = items.filter((i) => i.transform === "faceswap").length;
    expect(nOriginals).toBe(3);
    expect(nFaceswaps).toBe(3);

    // A fake service that answers by position: conditions run outer, items
    // inner, so call k is item k % items.length under condition
    // conditions[floor(k / items.length)]. Faceswaps score high, originals
    // low, and every item under blur-2 answers no-face (the honest collapse).
    let call = 0;
    const fetchFn: FetchLike = async () => {
      const within = call % items.length;
      const conditionIdx = Math.floor(call / items.length);
      const item = items[within]!;
      call += 1;
      if (conditionIdx === GEND_EVAL_CONDITIONS.length - 1) return gendResponse(NO_FACE_BODY);
      const p = item.transform === "faceswap" ? 0.9 : 0.1;
      return gendResponse({ ...OK_BODY, faces: [{ box: [1, 2, 3, 4], p_fake: p }], image_p_fake: p, status: "ok" });
    };

    const { runDir, results } = await runGendEval(
      setDir,
      { url: "http://127.0.0.1:8099", token: "t", fetchFn, replicates: 200, seed: 3 },
      join(tmp, "runs"),
    );
    expect(results.kind).toBe("gend-eval");
    expect(results.conditions).toHaveLength(GEND_EVAL_CONDITIONS.length);
    const clean = results.conditions[0]!;
    expect(clean.condition).toBe("clean");
    expect(clean.nReal).toBe(3);
    expect(clean.nFake).toBe(3);
    expect(clean.auc).toBe(1);
    expect(clean.accuracy).toBe(1);
    expect(clean.noFaceReal).toBe(0);
    expect(clean.noFaceFake).toBe(0);
    // The last condition (blur-2) is the no-face collapse: nothing scored.
    const blur2 = results.conditions[results.conditions.length - 1]!;
    expect(blur2.noFaceReal).toBe(1);
    expect(blur2.noFaceFake).toBe(1);
    expect(blur2.auc).toBeNull();
    expect(blur2.accuracy).toBeNull();
    // The per-item records exist for every condition x item.
    const lines = readFileSync(join(runDir, "scores.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(GEND_EVAL_CONDITIONS.length * items.length);
    expect(JSON.parse(lines[0]!).condition).toBe("clean");
    // The aggregate table renders with CIs.
    const table = renderGendEvalTable(results);
    expect(table).toContain("| condition | real n | fake n | AUC (95% CI) | accuracy @0.5 (95% CI) | no-face real | no-face fake | errors |");
    expect(table).toContain("| as stored (no degradation) | 3 | 3 | 100.0%");
    expect(table).toContain("Gaussian blur, sigma 2");
  });
});
