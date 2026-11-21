/**
 * SSCD embedding for E1, loaded exactly the way the crawler branch
 * `origin/feat/crawler-sscd` loads it (crawler/src/image/sscd-pool.ts and
 * sscd-model.ts, not merged here): the pinned ONNX export of Meta's
 * `sscd_disc_mixup` through onnxruntime-node on CPU —
 *
 *   model  sscd_disc_mixup.onnx, 98,156,202 bytes,
 *   sha256 e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8
 *   input  `images`   float32 NCHW [1, 3, 320, 320]
 *   output `embeddings` float32 [1, 512], L2-normalised (cosine = dot)
 *
 * The preprocessing is the SSCD repo's square-tensor recipe, as in the
 * crawler: convert to RGB, resize straight to 320x320 (aspect skewed on
 * purpose), scale to [0,1], normalise per channel with the ImageNet
 * mean/std. Licence: MIT (Meta Platforms, Inc. and affiliates; verified in
 * asmita/docs/adr/008-sscd-second-layer.md on that branch, which also pins
 * the artifact's provenance).
 *
 * Two differences from the crawler, on purpose: this is an offline research
 * tool, so the model runs in-process (no isolated child process, no
 * permission model — that machinery guards a service that fetches
 * attacker-controlled bytes) and the weights are fetched once by
 * `npm run models:fetch` (never committed; models/ is gitignored).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export const SSCD_MODEL_URL = "https://huggingface.co/nutszebra/sscd_onnx/resolve/main/sscd_disc_mixup.onnx";
export const SSCD_MODEL_SHA256 = "e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8";
export const SSCD_MODEL_BYTES = 98_156_202;
export const SSCD_INPUT_SIZE = 320;
export const SSCD_EMBED_DIM = 512;
/** ImageNet channel statistics the SSCD repo normalises with (RGB order). */
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

export type SscdSession = {
  run(inputs: Record<string, unknown>): Promise<Record<string, { data: unknown }>>;
  readonly inputNames: string[];
  readonly outputNames: string[];
};

/** Where fetch-models.mjs puts the weights (relative to the package root). */
export function sscdModelPath(modelsDir: string): string {
  return join(modelsDir, "sscd_disc_mixup.onnx");
}

/**
 * Decode and shrink to the model's square input, the crawler's recipe:
 * failOn "none", 25 MP cap, sRGB, then a plain resize to 320x320.
 */
export async function prepareSscdInput(bytes: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 25_000_000 })
    .rotate()
    .resize(SSCD_INPUT_SIZE, SSCD_INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (data.length !== SSCD_INPUT_SIZE * SSCD_INPUT_SIZE * 3) throw new Error("sscd: bad raw size");
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * HWC interleaved RGB bytes -> NCHW float32 tensor, scaled to [0,1] and
 * normalised per channel. Pure, so a test can pin every value.
 */
export function buildSscdTensor(rgb: Uint8Array, size = SSCD_INPUT_SIZE): Float32Array {
  const pixels = size * size;
  if (rgb.length !== pixels * 3) throw new Error("sscd: bad rgb length");
  const out = new Float32Array(3 * pixels);
  for (let c = 0; c < 3; c++) {
    const mean = MEAN[c]!;
    const std = STD[c]!;
    const plane = out.subarray(c * pixels, (c + 1) * pixels);
    for (let i = 0; i < pixels; i++) {
      plane[i] = (rgb[i * 3 + c]! / 255 - mean) / std;
    }
  }
  return out;
}

/** Cosine of two L2-normalised vectors: a plain dot product. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i]! * b[i]!;
  return s;
}

export type SscdOptions = {
  /** Directory holding sscd_disc_mixup.onnx. Default: <package>/models. */
  modelsDir?: string;
  /** Test hook: an already-loaded inference session. */
  session?: SscdSession;
};

/** In-process SSCD embedder; unavailable (never throwing) when weights are missing. */
export class SscdEmbedder {
  private session: SscdSession | null;
  private readonly modelPath: string;
  readonly available: boolean;
  readonly reason?: string;

  constructor(opts: SscdOptions = {}) {
    this.session = opts.session ?? null;
    this.modelPath = sscdModelPath(opts.modelsDir ?? join(import.meta.dirname ?? ".", "..", "models"));
    if (opts.session) {
      this.available = true;
    } else if (existsSync(this.modelPath)) {
      this.available = true;
    } else {
      this.available = false;
      this.reason = `SSCD model file not found at ${this.modelPath} (npm run models:fetch)`;
    }
  }

  async embed(bytes: Buffer): Promise<number[]> {
    if (!this.session) {
      const ort = await import("onnxruntime-node");
      const session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ["cpu"],
        executionMode: "sequential",
        intraOpNumThreads: 1,
        graphOptimizationLevel: "all",
      });
      this.session = session as unknown as SscdSession;
    }
    const s = this.session;
    const rgb = await prepareSscdInput(bytes);
    const tensorData = buildSscdTensor(rgb);
    const ort = await import("onnxruntime-node");
    const input = new ort.Tensor(tensorData, [1, 3, SSCD_INPUT_SIZE, SSCD_INPUT_SIZE]);
    const inputName = s.inputNames[0] ?? "images";
    const out = await s.run({ [inputName]: input });
    const outputName = s.outputNames[0] ?? "embeddings";
    const data = out[outputName]?.data;
    if (!(data instanceof Float32Array) || data.length !== SSCD_EMBED_DIM) throw new Error("sscd: unexpected embedding shape");
    return Array.from(data);
  }
}
