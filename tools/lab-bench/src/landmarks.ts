/**
 * Face location for E1: one interface, one production implementation.
 *
 * Package choice (recorded per the WP): @vladmandic/human 3.3.6 — the only
 * maintained npm package that runs a face-detection + 68→468-point landmark
 * model in plain Node (face-api.js, the alternative, is unmaintained since
 * 2019). Human is actively released, MIT-licensed, and runs here on its
 * node-wasm build: tfjs-core + tfjs-converter + tfjs-backend-wasm, pure JS
 * and WASM, no native TensorFlow binding, CPU only. The model files are
 * fetched from the author's CDN on first use and cached by the browser cache
 * dir; nothing is committed (models/ is gitignored).
 *
 * Tests never load human: they inject a deterministic fake locator, so the
 * suite stays fast, offline and synthetic-only.
 */
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import sharp from "sharp";

/** What E1 needs from a face: a box and one point per eye. */
export type DetectedFace = {
  /** Axis-aligned pixel box. */
  box: { x: number; y: number; w: number; h: number };
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  /** Detector confidence 0..1. */
  score: number;
};

export interface FaceLocator {
  /** All faces found in the image, largest first. */
  detect(buffer: Buffer): Promise<DetectedFace[]>;
  /** Load models / warm up; if this throws the locator counts as unavailable. */
  init?(): Promise<void>;
  close?(): Promise<void>;
}

/** Eye midpoint between the two landmark centroids. */
function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

/** Largest-face-first order, deterministic. */
export function toDetectedFaces(faces: DetectedFace[]): DetectedFace[] {
  return [...faces].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h || a.box.x - b.box.x);
}

/**
 * The eye-centre landmark points of one side of a human face result.
 * Human 3.3.6 annotates the mesh with contours — `leftEyeUpper0`,
 * `leftEyeLower0`, … — and an iris ring `leftEyeIris`; a combined
 * `leftEye` key does not exist (the first real locator run found every
 * face silently dropped by the old `annotations.leftEye` lookup). The
 * iris ring is the pupil: the best centre; otherwise the lid contours
 * (never the eyebrow) centroid to the same place.
 */
export function eyePointsOf(
  annotations: Record<string, Array<{ x: number; y: number }> | undefined> | undefined,
  side: "left" | "right",
): Array<{ x: number; y: number }> {
  // Human 3.3.6 annotates points as [x, y, z] triples, and emits an
  // `*EyeIris` key of null placeholders when the iris model is off, so
  // every candidate is normalised and validated, not just length-checked.
  const valid = (pts: ReadonlyArray<unknown> | undefined): Array<{ x: number; y: number }> => {
    const out: Array<{ x: number; y: number }> = [];
    for (const p of pts ?? []) {
      const point = Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as { x: number; y: number });
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) out.push(point);
    }
    return out;
  };
  const iris = valid(annotations?.[`${side}EyeIris`]);
  if (iris.length) return iris;
  const direct = valid(annotations?.[`${side}Eye`]);
  if (direct.length) return direct;
  const ring: Array<{ x: number; y: number }> = [];
  for (const [key, value] of Object.entries(annotations ?? {})) {
    if (key.startsWith(`${side}Eye`) && !key.includes("brow") && key !== `${side}EyeIris`) {
      ring.push(...valid(value));
    }
  }
  return ring;
}

export type HumanLocatorOptions = {
  /**
   * Where human's model files live. Default: the author's CDN (fetched once
   * per machine). Override with a local directory or a mirror via
   * LAB_HUMAN_MODEL_BASE so an offline bench can run from a warmed cache.
   */
  modelBasePath?: string;
  /** Minimum detection score to keep (human default 0.5 is too lax for swaps). */
  minScore?: number;
};

/** The slice of human's API this locator uses (kept minimal on purpose). */
type HumanInstance = {
  config: {
    face: Record<string, unknown> & { detector: Record<string, unknown>; mesh: Record<string, unknown>; iris: Record<string, unknown>; description: Record<string, unknown>; emotion: Record<string, unknown>; antispoof: Record<string, unknown>; liveness: Record<string, unknown> };
    body: Record<string, unknown>;
    hand: Record<string, unknown>;
    object: Record<string, unknown>;
    gesture: Record<string, unknown>;
    segmentation: Record<string, unknown>;
    modelBasePath: string;
  };
  tf: { tensor: (data: Uint8Array | Float32Array, shape: number[]) => unknown; dispose: (t: unknown) => void };
  detect: (input: unknown) => Promise<{
    face: Array<{
      score: number;
      box: [number, number, number, number];
      annotations: Record<string, Array<{ x: number; y: number }>>;
    }>;
  }>;
  load: () => Promise<void>;
};

/**
 * The production locator: human's face detector + mesh. Eye positions come
 * from the mesh annotations' eye contours (their centroids), which is what
 * the face-swap alignment aligns on.
 */
export class HumanFaceLocator implements FaceLocator {
  private readonly minScore: number;
  private human: HumanInstance | null = null;
  private loading: Promise<HumanInstance> | null = null;

  constructor(private readonly opts: HumanLocatorOptions = {}) {
    this.minScore = opts.minScore ?? 0.4;
  }

  /** Load human lazily: importing it pulls in the whole tfjs wasm stack. */
  private async getHuman(): Promise<HumanInstance> {
    if (this.human) return this.human;
    if (!this.loading) {
      this.loading = (async () => {
        // node-wasm build: pure WASM, no native binding, CPU only. The
        // package's exports map misdeclares its dist subpaths (keys without a
        // "./" prefix are conditions, not subpaths), so the node-wasm build
        // is reached by direct path — exactly what human's own node demos do.
        const mod = (await import("../node_modules/@vladmandic/human/dist/human.node-wasm.js")) as unknown as {
          default: new (config?: Record<string, unknown>) => HumanInstance;
        };
        // human seals its config and resolves every model URL at construction,
        // so the whole configuration must ride the constructor: the model base
        // (default in node is a file:// path that node's fetch cannot read),
        // the tfjs WASM binary location (human calls setWasmPaths with
        // config.wasmPath at backend init; the default is a CDN URL that
        // node's fs cannot read), and the face-only pipeline selection.
        const backendEntry = createRequire(import.meta.url).resolve("@tensorflow/tfjs-backend-wasm");
        const human = new mod.default({
          modelBasePath: this.opts.modelBasePath ?? process.env.LAB_HUMAN_MODEL_BASE ?? "https://vladmandic.github.io/human-models/models",
          wasmPath: join(dirname(backendEntry), "..", "wasm-out") + sep,
          face: { enabled: true, detector: { enabled: true, return: true }, mesh: { enabled: true }, iris: { enabled: false }, description: { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          gesture: { enabled: false },
          segmentation: { enabled: false },
        });
        this.human = human;
        await human.load();
        return human;
      })();
    }
    return this.loading;
  }

  async detect(buffer: Buffer): Promise<DetectedFace[]> {
    const human = await this.getHuman();
    // Decode exactly like the PDQ path does (EXIF-rotated sRGB) so the
    // coordinates are in the same frame the rest of the tool uses. Human's
    // Node examples take raw RGBA, so alpha is ensured.
    const { data, info } = await sharp(buffer, { failOn: "none", animated: false })
      .rotate()
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`expected RGBA, got ${info.channels} channels`);
    const tensor = human.tf.tensor(new Uint8Array(data), [info.height, info.width, 4]);
    try {
      const res = await human.detect(tensor);
      const faces: DetectedFace[] = [];
      for (const f of res.face) {
        if (f.score < this.minScore) continue;
        const leftEyePts = eyePointsOf(f.annotations, "left");
        const rightEyePts = eyePointsOf(f.annotations, "right");
        if (!leftEyePts.length || !rightEyePts.length) continue;
        faces.push({
          box: { x: f.box[0], y: f.box[1], w: f.box[2], h: f.box[3] },
          leftEye: centroid(leftEyePts),
          rightEye: centroid(rightEyePts),
          score: f.score,
        });
      }
      return toDetectedFaces(faces);
    } finally {
      human.tf.dispose(tensor);
    }
  }

  async close(): Promise<void> {
    // Nothing to release beyond the in-memory graphs; kept for symmetry.
  }

  async init(): Promise<void> {
    await this.getHuman();
  }
}
