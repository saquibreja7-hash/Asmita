import {
  buildDetectorRegistry,
  isDetectionScore,
  isNoFaceResult,
  isSkipped,
  registryOptionsFromEnv,
  type DetectionResult,
  type LabImage,
} from "@/lib/lab/detectors/adapters";

/*
 * The detector panel's core (docs/lab/beta-spec.md WP90): run every
 * configured detector on one image, turn each 0..1 score into a 0..100 score
 * with a verdict band, and flag when the detectors disagree. Pure logic —
 * no fetch of its own, no HTTP, nothing logged: the image never leaves this
 * module except to the adapters the caller built.
 */

export type DetectorBand = "likely_ai" | "unclear" | "likely_camera";

export type DetectorRow = {
  id: string;
  name: string;
  /**
   * "no_face": a face-swap detector (GenD) found no face to score — an
   * honest answer with its own message, never a score.
   */
  status: "scored" | "not_configured" | "no_face" | "error";
  /** 0..100, present only when status is "scored". */
  score?: number;
  /** Present only when status is "scored". */
  band?: DetectorBand;
  /** Fixed error code, present only when status is "error". */
  error?: string;
};

export type DetectorPanelResult = {
  rows: DetectorRow[];
  /** True when at least two scored detectors fall in different bands. */
  disagree: boolean;
};

/** At or above this P(AI) the band is "likely AI". */
export const LIKELY_AI_AT = 0.7;
/** Below this P(AI) the band is "likely camera"; between the two, "unclear". */
export const LIKELY_CAMERA_BELOW = 0.3;

export function verdictBand(score: number): DetectorBand {
  if (score >= LIKELY_AI_AT) return "likely_ai";
  if (score < LIKELY_CAMERA_BELOW) return "likely_camera";
  return "unclear";
}

/**
 * Bands differ among the detectors that actually scored the image.
 * GenD only checks for face swaps, so a low GenD score says nothing about a fully generated
 * image; it counts only when it lands in "likely AI".
 */
export function bandsDisagree(rows: DetectorRow[]): boolean {
  const bands = new Set(
    rows
      .filter((row) => row.status === "scored")
      .filter((row) => row.id !== "gend" || row.band === "likely_ai")
      .map((row) => row.band),
  );
  return bands.size > 1;
}

export type RunPanelOptions = {
  env?: Record<string, string | undefined>;
  fetchFn?: Parameters<typeof registryOptionsFromEnv>[1];
  /** Per-detector wall-clock cap; a detector that exceeds it reports "timeout". */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One panel run. The registry is built per call from the env block, so key
 * changes are picked up without a reload and tests inject their own env.
 * A detector that fails (or times out) becomes an "error" row; the others
 * still answer.
 */
export async function runDetectorPanel(image: LabImage, options: RunPanelOptions = {}): Promise<DetectorPanelResult> {
  const registry = buildDetectorRegistry(registryOptionsFromEnv(options.env ?? process.env, options.fetchFn));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const settled = await Promise.all(
    registry.map(async ({ id, name, result }): Promise<DetectorRow> => {
      if (isSkipped(result)) {
        return { id, name, status: "not_configured" };
      }
      const detector = result.detector;
      const outcome: DetectionResult = await withTimeout(detector.detect(image), timeoutMs, { error: "timeout" });
      if (isDetectionScore(outcome)) {
        const score = Math.round(outcome.score * 100);
        return { id, name, status: "scored", score, band: verdictBand(outcome.score) };
      }
      if (isNoFaceResult(outcome)) {
        return { id, name, status: "no_face" };
      }
      return { id, name, status: "error", error: outcome.error };
    }),
  );

  return { rows: settled, disagree: bandsDisagree(settled) };
}
