import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Detector, DetectorFactoryResult } from "./types.ts";

/**
 * The local open detector: Community Forensics ViT-S/16 384 (MIT; arXiv
 * 2411.04125, Park & Owens, University of Michigan; ONNX export by the
 * onnx-community conversion space). Trained on 2.7M images from 4,803
 * generators — the strongest open "AI-generated image" detector with public
 * weights we could pin. Skipped, like a keyless hosted adapter, when the
 * weights file is missing (`npm run models:fetch`; models/ is gitignored).
 */
export const CF_MODEL_URL =
  "https://huggingface.co/onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX/resolve/main/onnx/model.onnx";
export const CF_MODEL_SHA256 = "55602c73f457858f0b48c19bfa03bc6bd218f37027cb1f6b569ee24e2f954d03";
export const CF_MODEL_BYTES = 143_845_409;

/** The HF ViTImageProcessor's numbers for this export (CLIP mean/std). */
export const CF_INPUT_SIZE = 384;
export const CF_RESIZE = 440;
export const CF_MEAN = [0.48145466, 0.4578275, 0.40821073] as const;
export const CF_STD = [0.26862954, 0.26130258, 0.27577711] as const;

export type OnnxSession = {
  run(inputs: Record<string, unknown>): Promise<Record<string, { data: unknown }>>;
  readonly inputNames: string[];
  readonly outputNames: string[];
};

/** Where fetch-models.mjs puts the weights (relative to the package root). */
export function cfModelPath(modelsDir: string): string {
  return join(modelsDir, "communityforensics-vit-s.onnx");
}

/** RGB raw 384x384 -> NCHW float32, [0,1] rescale + CLIP-channel normalise. */
export function buildCfTensor(rgb: Uint8Array, size = CF_INPUT_SIZE): Float32Array {
  const pixels = size * size;
  if (rgb.length !== pixels * 3) throw new Error("cf: bad rgb length");
  const out = new Float32Array(3 * pixels);
  for (let c = 0; c < 3; c++) {
    const mean = CF_MEAN[c]!;
    const std = CF_STD[c]!;
    const plane = out.subarray(c * pixels, (c + 1) * pixels);
    for (let i = 0; i < pixels; i++) {
      plane[i] = (rgb[i * 3 + c]! / 255 - mean) / std;
    }
  }
  return out;
}

/** Map the model's raw output to P(fake): a single logit is sigmoid'd. */
export function cfScoreFromLogits(data: unknown): number | null {
  if (!(data instanceof Float32Array)) return null;
  if (data.length === 1) return 1 / (1 + Math.exp(-data[0]!));
  if (data.length === 2) {
    const e0 = Math.exp(data[0]!);
    const e1 = Math.exp(data[1]!);
    return e1 / (e0 + e1);
  }
  return null;
}

export type LocalOnnxOptions = {
  modelsDir?: string;
  session?: OnnxSession;
};

export function createLocalOnnxDetector(opts: LocalOnnxOptions = {}): DetectorFactoryResult {
  if (opts.session) {
    return { detector: makeDetector(opts.session) };
  }
  const modelPath = cfModelPath(opts.modelsDir ?? join(import.meta.dirname ?? ".", "..", "..", "models"));
  if (!existsSync(modelPath)) {
    return { skipped: `local model file not found at ${modelPath} (npm run models:fetch)` };
  }
  return {
    detector: {
      id: "communityforensics",
      name: "Community Forensics ViT-S (local ONNX)",
      async detect(image: Buffer) {
        try {
          const ort = await import("onnxruntime-node");
          const session = (await ort.InferenceSession.create(modelPath, {
            executionProviders: ["cpu"],
            executionMode: "sequential",
            intraOpNumThreads: 1,
            graphOptimizationLevel: "all",
          })) as unknown as OnnxSession;
          return await runSession(makeDetector(session), session, image);
        } catch {
          return { error: "cf_inference_failed" };
        }
      },
    },
  };
}

function makeDetector(session: OnnxSession): Detector {
  return {
    id: "communityforensics",
    name: "Community Forensics ViT-S (local ONNX)",
    async detect(image: Buffer) {
      return runSession(this, session, image);
    },
  };
}

async function runSession(_self: Detector, session: OnnxSession, image: Buffer): Promise<ReturnType<Detector["detect"]>> {
  try {
    // HF ViTImageProcessor recipe: bicubic resize to 440x440, centre crop
    // 384x384, RGB.
    const { data } = await sharp(image, { failOn: "none", animated: false, limitInputPixels: 25_000_000 })
      .rotate()
      .resize(CF_RESIZE, CF_RESIZE, { fit: "fill", kernel: "cubic" })
      .extract({
        left: Math.floor((CF_RESIZE - CF_INPUT_SIZE) / 2),
        top: Math.floor((CF_RESIZE - CF_INPUT_SIZE) / 2),
        width: CF_INPUT_SIZE,
        height: CF_INPUT_SIZE,
      })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (data.length !== CF_INPUT_SIZE * CF_INPUT_SIZE * 3) return { error: "cf_preprocess_failed" };
    const ort = await import("onnxruntime-node");
    const tensor = new ort.Tensor(buildCfTensor(new Uint8Array(data)), [1, 3, CF_INPUT_SIZE, CF_INPUT_SIZE]);
    const inputName = session.inputNames[0] ?? "pixel_values";
    const out = await session.run({ [inputName]: tensor });
    const outputName = session.outputNames[0] ?? "logits";
    const score = cfScoreFromLogits(out[outputName]?.data);
    if (score === null) return { error: "cf_bad_output" };
    return { score };
  } catch {
    return { error: "cf_inference_failed" };
  }
}
