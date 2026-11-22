/*
 * The browser half of the trace tool (experiment E3, docs/lab/charter.md).
 *
 * Cloudflare Workers cannot run onnxruntime-node or native image libraries,
 * so the whole analysis runs in the visitor's browser on this page — the
 * images never leave the device, which the page states. Everything that
 * decides anything lives in the pure modules (geometry.ts, score.ts,
 * sscd.ts); this file only gathers pixel data and model outputs for them:
 *
 *   - decode: createImageBitmap + canvas, the same decode path the site's
 *     client-side PDQ hashing (WatchForm) uses, capped at the working-copy
 *     long edge;
 *   - face landmarks: @vladmandic/human's browser build (the same landmark
 *     tool the E1 harness uses in Node), loaded lazily and degrading to
 *     "landmarks unavailable" — never a failed analysis;
 *   - SSCD: onnxruntime-web (the pinned sscd_disc_mixup ONNX, loaded exactly
 *     as the crawler loads it through onnxruntime-node), fetched from a
 *     configurable URL (LAB_SSCD_MODEL_URL); when no URL is configured the
 *     tool says so and scores with PDQ only. The runtime's WASM binary is
 *     served same-origin from /ort/ (copied from node_modules at install
 *     time, never committed), single-threaded, no proxy worker, so the
 *     page's CSP needs only 'wasm-unsafe-eval'.
 */

import {
  workingSize,
  WORKING_LONG_EDGE,
  type FaceLandmarks,
  type Rgba,
} from "./geometry";
import { buildSscdTensor, SSCD_INPUT_SIZE } from "./sscd";
import { traceSignals, verdictOf, TRACE_TOOL_VERSION, type TraceSignals, type VerdictResult } from "./score";

/** Where the page and the lab-bench harness both cap the working copy. */
export { WORKING_LONG_EDGE };

/** The human model CDN the E1 harness also defaults to (LAB_HUMAN_MODEL_BASE overrides). */
export const DEFAULT_HUMAN_MODEL_BASE = "https://vladmandic.github.io/human-models/models";

export type DecodedImage = {
  name: string;
  rgba: Rgba;
  /** Display/PDF PNG bytes (long edge <= 1024). */
  png: Uint8Array;
  pngWidth: number;
  pngHeight: number;
};

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  return { canvas, ctx };
}

function toRgba(imageData: ImageData): Rgba {
  return { data: new Uint8ClampedArray(imageData.data), width: imageData.width, height: imageData.height };
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png_encode_failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decode a chosen file into the working-copy RGBA plus a display PNG. */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = workingSize(bitmap.width, bitmap.height);
    const { canvas, ctx } = canvasOf(width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const rgba = toRgba(ctx.getImageData(0, 0, width, height));

    // The display/PDF copy: capped at 1024, small enough to embed in a PDF.
    const thumbScale = Math.min(1, 1024 / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * thumbScale));
    const th = Math.max(1, Math.round(height * thumbScale));
    const thumb = canvasOf(tw, th);
    thumb.ctx.imageSmoothingEnabled = true;
    thumb.ctx.imageSmoothingQuality = "high";
    thumb.ctx.drawImage(canvas, 0, 0, tw, th);
    const png = await pngBytes(thumb.canvas);
    return { name: file.name, rgba, png, pngWidth: tw, pngHeight: th };
  } finally {
    bitmap.close();
  }
}

// ─── Face landmarks (browser build of the E1 landmark tool) ────────────────

type HumanFaceResult = {
  face: Array<{
    score: number;
    box: [number, number, number, number];
    annotations: Record<string, Array<{ x: number; y: number }>>;
  }>;
};

type HumanInstance = {
  config: Record<string, unknown>;
  detect: (input: unknown) => Promise<HumanFaceResult>;
  load: () => Promise<void>;
};

export type FaceLocator = {
  detect(img: Rgba): Promise<FaceLandmarks[]>;
};

function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Load the landmark model once. Human resolves every model URL at
 * construction, so the model base and the face-only pipeline selection ride
 * the constructor config, exactly as the E1 harness does it in Node.
 */
export async function loadFaceLocator(modelBase: string): Promise<FaceLocator> {
  // The landmark library's package exports map misdeclares its dist
  // subpaths, so importing it through a bundler resolves to the Node build
  // (which needs a native TensorFlow binding) on any server-side compile
  // pass — the same quirk the E1 harness works around in Node. Instead the
  // IIFE browser build is served from our own origin (copied from
  // node_modules at install time by scripts/copy-lab-assets.mjs, never
  // committed) and loaded here as a plain same-origin script; it defines
  // the global Human. CSP script-src 'self' covers it.
  const HumanCtor = await new Promise<(new (config?: Record<string, unknown>) => HumanInstance) | null>(
    (resolve) => {
      const existing = (globalThis as { Human?: new (config?: Record<string, unknown>) => HumanInstance }).Human;
      if (existing) {
        resolve(existing);
        return;
      }
      const script = document.createElement("script");
      script.src = "/human/human.js";
      script.async = false;
      script.onload = () => {
        const loaded = (globalThis as { Human?: new (config?: Record<string, unknown>) => HumanInstance }).Human;
        resolve(loaded ?? null);
      };
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    },
  );
  if (!HumanCtor) throw new Error("landmarks_script_unavailable");
  const human = new HumanCtor({
    modelBasePath: modelBase,
    backend: "webgl",
    face: { enabled: true, detector: { enabled: true, return: true }, mesh: { enabled: true }, iris: { enabled: false }, description: { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  });
  await human.load();
  return {
    async detect(img: Rgba): Promise<FaceLandmarks[]> {
      const { canvas, ctx } = canvasOf(img.width, img.height);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
      try {
        const res = await human.detect(canvas);
        const faces: FaceLandmarks[] = [];
        for (const f of res.face) {
          if (f.score < 0.4) continue;
          const leftEyePts = f.annotations["leftEye"];
          const rightEyePts = f.annotations["rightEye"];
          if (!leftEyePts?.length || !rightEyePts?.length) continue;
          faces.push({
            box: { x: f.box[0], y: f.box[1], w: f.box[2], h: f.box[3] },
            leftEye: centroid(leftEyePts),
            rightEye: centroid(rightEyePts),
          });
        }
        // Largest first, deterministic (the E1 harness's order).
        return faces.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h || a.box.x - b.box.x);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
  };
}

/** Run `fn`, but never longer than `ms` — a hung model load must not hang the page. */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what}_timeout`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ─── SSCD through onnxruntime-web ──────────────────────────────────────────

type OrtTensor = unknown;
type OrtSession = {
  run(feed: Record<string, OrtTensor>): Promise<Record<string, { data: unknown }>>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
};
type OrtModule = {
  env: { wasm: { wasmPaths: string; proxy: boolean; numThreads: number; simd: boolean } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(uri: string, options: Record<string, unknown>): Promise<OrtSession> };
};

/** One SSCD session; construction is skipped (never thrown) without a URL. */
export class BrowserSscd {
  readonly available: boolean;
  readonly reason?: string;
  private session: OrtSession | null = null;
  private loading: Promise<OrtSession> | null = null;

  constructor(private readonly modelUrl: string | null) {
    this.available = Boolean(modelUrl);
    if (!modelUrl) this.reason = "sscd_model_not_configured";
  }

  private async getSession(): Promise<OrtSession> {
    if (this.session) return this.session;
    if (!this.loading) {
      this.loading = (async () => {
        const ort = (await import("onnxruntime-web/wasm")) as unknown as OrtModule;
        // Same-origin WASM (scripts/copy-ort-assets.mjs), main thread, one
        // thread: no proxy worker and no pthreads, so the page CSP needs
        // only 'wasm-unsafe-eval'.
        ort.env.wasm.wasmPaths = "/ort/";
        ort.env.wasm.proxy = false;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;
        return ort.InferenceSession.create(this.modelUrl!, { executionProviders: ["wasm"] });
      })();
    }
    const session = await this.loading;
    this.session = session;
    return session;
  }

  /** The L2-normalised 512-dim embedding of a working-copy image. */
  async embed(img: Rgba): Promise<number[]> {
    const ort = (await import("onnxruntime-web/wasm")) as unknown as OrtModule;
    const session = await this.getSession();
    const { canvas, ctx } = canvasOf(SSCD_INPUT_SIZE, SSCD_INPUT_SIZE);
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const source = canvasOf(img.width, img.height);
      source.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
      // The SSCD square-tensor recipe: resize straight to the square, aspect
      // skewed on purpose (the crawler and the E1 harness do the same).
      ctx.drawImage(source.canvas, 0, 0, SSCD_INPUT_SIZE, SSCD_INPUT_SIZE);
      const rgba = toRgba(ctx.getImageData(0, 0, SSCD_INPUT_SIZE, SSCD_INPUT_SIZE));
      const tensorData = buildSscdTensor(rgba);
      const input = new ort.Tensor("float32", tensorData, [1, 3, SSCD_INPUT_SIZE, SSCD_INPUT_SIZE]);
      const inputName = session.inputNames[0] ?? "images";
      const out = await session.run({ [inputName]: input });
      const outputName = session.outputNames[0] ?? "embeddings";
      const data = out[outputName]?.data;
      if (!(data instanceof Float32Array) || data.length !== 512) throw new Error("sscd_bad_embedding");
      return Array.from(data);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

// ─── The trace run ─────────────────────────────────────────────────────────

export type OriginalComparison = {
  name: string;
  png: Uint8Array;
  pngWidth: number;
  pngHeight: number;
  /** Face box in the original's working-copy pixels, for the region highlight. */
  faceBox: { x: number; y: number; w: number; h: number } | null;
  signals: TraceSignals;
  verdict: VerdictResult;
};

export type TraceRunResult = {
  toolVersion: string;
  generatedAt: string;
  suspect: {
    name: string;
    png: Uint8Array;
    pngWidth: number;
    pngHeight: number;
    faceBox: { x: number; y: number; w: number; h: number } | null;
  };
  comparisons: OriginalComparison[];
  /** Index of the strongest comparison (ties: more evidence points first). */
  bestIndex: number;
  capabilities: { sscd: boolean; sscdReason: string | null; landmarks: boolean; landmarksReason: string | null };
};

export type TraceRunOptions = {
  sscdModelUrl: string | null;
  humanModelBase: string;
  /** Test seam: decode step (defaults to decodeFile). */
  decode?: (file: File) => Promise<DecodedImage>;
  /** Test seam: face locator factory (defaults to loadFaceLocator). */
  faceLocator?: (modelBase: string) => Promise<FaceLocator>;
  /** Test seam: SSCD embedder (defaults to BrowserSscd). */
  sscd?: { embed(img: Rgba): Promise<number[]>; available: boolean; reason?: string };
};

/**
 * The face box in the display/PDF thumbnail's pixel frame (the overlay and
 * the evidence PDF draw on the thumbnail, so the box is scaled once here).
 */
function faceBoxOf(
  rgba: Rgba,
  face: FaceLandmarks | null,
  pngWidth: number,
  pngHeight: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!face) return null;
  const sx = pngWidth / rgba.width;
  const sy = pngHeight / rgba.height;
  const x = Math.max(0, Math.round(face.box.x * sx));
  const y = Math.max(0, Math.round(face.box.y * sy));
  return {
    x,
    y,
    w: Math.max(1, Math.round(face.box.w * sx)),
    h: Math.max(1, Math.round(face.box.h * sy)),
  };
}

/**
 * The whole comparison, in the browser. Nothing is uploaded: every byte this
 * touches came from the visitor's own files. Model failures degrade into
 * honest notes instead of failing the run.
 */
export async function runTrace(suspectFile: File, originalFiles: File[], opts: TraceRunOptions): Promise<TraceRunResult> {
  if (originalFiles.length === 0) throw new Error("no_originals");
  const decode = opts.decode ?? decodeFile;
  const decodeMany = async (files: File[]) => {
    const out: DecodedImage[] = [];
    for (const file of files) out.push(await decode(file));
    return out;
  };
  const [suspectDecoded, ...originalDecoded] = await decodeMany([suspectFile, ...originalFiles]);

  // Face landmarks: load once, reuse for every image; degrade on failure.
  let locator: FaceLocator | null = null;
  let landmarksReason: string | null = null;
  try {
    const load = opts.faceLocator ?? loadFaceLocator;
    locator = await withTimeout(() => load(opts.humanModelBase), 30_000, "landmarks");
  } catch {
    locator = null;
    landmarksReason = "landmarks_unavailable";
  }

  // SSCD: only when a model URL is configured.
  const sscd = opts.sscd ?? new BrowserSscd(opts.sscdModelUrl);
  const sscdReason = sscd.available ? null : sscd.reason ?? "sscd_model_not_configured";

  const embedSscd = async (img: Rgba): Promise<number[] | null> => {
    if (!sscd.available) return null;
    try {
      return await withTimeout(() => sscd.embed(img), 120_000, "sscd");
    } catch {
      return null;
    }
  };

  const locate = async (img: Rgba): Promise<FaceLandmarks | null> => {
    if (!locator) return null;
    try {
      const faces = await withTimeout(() => locator!.detect(img), 60_000, "face");
      return faces[0] ?? null;
    } catch {
      return null;
    }
  };

  const suspectFace = await locate(suspectDecoded.rgba);
  const suspectSscd = await embedSscd(suspectDecoded.rgba);

  const comparisons: OriginalComparison[] = [];
  for (const original of originalDecoded) {
    const originalFace = await locate(original.rgba);
    const originalSscd = await embedSscd(original.rgba);
    const signals = traceSignals({
      suspect: suspectDecoded.rgba,
      original: original.rgba,
      suspectFace,
      originalFace,
      suspectSscd,
      originalSscd,
      sscdConfigured: sscd.available,
      landmarksConfigured: locator !== null,
    });
    comparisons.push({
      name: original.name,
      png: original.png,
      pngWidth: original.pngWidth,
      pngHeight: original.pngHeight,
      faceBox: faceBoxOf(original.rgba, originalFace, original.pngWidth, original.pngHeight),
      signals,
      verdict: verdictOf(signals),
    });
  }

  let bestIndex = 0;
  for (let i = 1; i < comparisons.length; i++) {
    const best = comparisons[bestIndex]!;
    const cand = comparisons[i]!;
    const better =
      cand.verdict.points > best.verdict.points ||
      (cand.verdict.points === best.verdict.points &&
        (cand.signals.sscd?.cosine ?? -1) > (best.signals.sscd?.cosine ?? -1));
    if (better) bestIndex = i;
  }

  return {
    toolVersion: TRACE_TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    suspect: {
      name: suspectDecoded.name,
      png: suspectDecoded.png,
      pngWidth: suspectDecoded.pngWidth,
      pngHeight: suspectDecoded.pngHeight,
      faceBox: faceBoxOf(suspectDecoded.rgba, suspectFace, suspectDecoded.pngWidth, suspectDecoded.pngHeight),
    },
    comparisons,
    bestIndex,
    capabilities: {
      sscd: sscd.available,
      sscdReason,
      landmarks: locator !== null,
      landmarksReason,
    },
  };
}
