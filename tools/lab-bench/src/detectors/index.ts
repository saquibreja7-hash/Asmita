import { createHiveDetector, type HiveOptions } from "./hive.ts";
import { createLocalOnnxDetector, type LocalOnnxOptions } from "./local-onnx.ts";
import { createOpenAiDetector, type OpenAiOptions } from "./openai.ts";
import { createSightengineDetector, type SightengineOptions } from "./sightengine.ts";
import type { Detector, DetectorFactoryResult } from "./types.ts";

export type DetectorRegistryOptions = OpenAiOptions & HiveOptions & SightengineOptions & LocalOnnxOptions;

export type RegistryEntry = { detector: Detector } | { skippedId: string; reason: string };

export type BuiltDetectors = {
  detectors: Detector[];
  /** Adapters skipped in this environment, with the reason (the run report shows them). */
  skipped: Array<{ id: string; reason: string }>;
};

/** Instantiate every adapter; keyless ones come back as skipped, never as errors. */
export function buildDetectors(opts: DetectorRegistryOptions = {}): BuiltDetectors {
  const entries: Array<{ id: string; result: DetectorFactoryResult }> = [
    { id: "openai", result: createOpenAiDetector(opts) },
    { id: "hive", result: createHiveDetector(opts) },
    { id: "sightengine", result: createSightengineDetector(opts) },
    { id: "communityforensics", result: createLocalOnnxDetector(opts) },
  ];
  const detectors: Detector[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const { id, result } of entries) {
    if ("detector" in result) detectors.push(result.detector);
    else skipped.push({ id, reason: result.skipped });
  }
  return { detectors, skipped };
}

export * from "./types.ts";
export { createOpenAiDetector, type OpenAiOptions } from "./openai.ts";
export { createHiveDetector, hiveScoreFromOutput, type HiveOptions } from "./hive.ts";
export { createSightengineDetector, sightengineScoreFromResponse, type SightengineOptions } from "./sightengine.ts";
export {
  createLocalOnnxDetector,
  cfModelPath,
  CF_MODEL_SHA256,
  CF_MODEL_URL,
  CF_MODEL_BYTES,
  buildCfTensor,
  cfScoreFromLogits,
  type LocalOnnxOptions,
  type OnnxSession,
} from "./local-onnx.ts";
