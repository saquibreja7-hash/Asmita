/*
 * Where the Lab's browser-side model configuration is read (one place, like
 * crawler-flags.ts reads the crawler's switches).
 *
 * The trace tool (E3) runs its analysis in the visitor's browser, so two
 * model locations are operator configuration, never code constants:
 *
 *   - LAB_SSCD_MODEL_URL: where the pinned sscd_disc_mixup ONNX lives
 *     (the same artifact the crawler's second matching layer uses; the
 *     weights are never committed). Unset means the trace tool says so and
 *     scores with image hashing only.
 *   - LAB_HUMAN_MODEL_BASE: where the face-landmark model files live. The
 *     default is the landmark library author's own model host — the same
 *     place the E1 harness (tools/lab-bench) fetches them from.
 *
 * This module is deliberately NOT under src/lib/lab/ (the charter's import
 * boundary would stop the CSP builder reading it, and nothing here is
 * secret): it is shared configuration, read by the /lab/trace server page,
 * the CSP builder (src/lib/csp.ts) and the browser glue.
 */

/** The landmark library author's model host (the E1 harness's default too). */
export const DEFAULT_LAB_HUMAN_MODEL_BASE = "https://vladmandic.github.io/human-models/models";

export type LabEnv = Record<string, string | undefined>;

export function labHumanModelBase(env: LabEnv = process.env): string {
  return env.LAB_HUMAN_MODEL_BASE || DEFAULT_LAB_HUMAN_MODEL_BASE;
}

/** The configured SSCD model URL, or null when the tool runs PDQ-only. */
export function labSscdModelUrl(env: LabEnv = process.env): string | null {
  const url = env.LAB_SSCD_MODEL_URL;
  return url && url.trim() ? url.trim() : null;
}

/**
 * The origins the /lab/trace page must be allowed to CONNECT to for its
 * models: the SSCD model URL and the landmark model base, cross-origin ones
 * only (same-origin URLs need nothing). Used by buildCsp({ labTrace: true }).
 */
export function labTraceConnectOrigins(env: LabEnv = process.env): string[] {
  const candidates = [labSscdModelUrl(env), labHumanModelBase(env)];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.origin !== "null" && parsed.origin.startsWith("http")) origins.add(parsed.origin);
    } catch {
      // A relative model path (same-origin hosting) needs no CSP addition.
    }
  }
  return [...origins];
}
