/**
 * Detector adapters for E1: one interface, four implementations, every
 * adapter skipped unless its key (or, for the local model, its weights
 * file) is present. The three hosted services are the charter's names;
 * the local model is the Community Forensics ViT-S (MIT, arXiv 2411.04125,
 * "Community Forensics: Using Thousands of Generators to Train Fake Image
 * Detectors", Park & Owens, University of Michigan) through onnxruntime-node.
 *
 * All scores are P(AI-generated / manipulated) in [0, 1]: accuracy is scored
 * at 0.5 and AUC over the same direction for every adapter.
 *
 * The hosted adapters were written from each provider's public API docs and
 * are exercised here against invented fixtures (example.test hosts) with an
 * injected fetch — no key is required or used by the test suite, and none is
 * ever committed. A first keyed run should spot-check `results.json`'s
 * recorded raw responses.
 */

export type DetectionScore = {
  /** P(AI-generated / manipulated), 0..1. */
  score: number;
  /** The provider's own verdict, when it gives one. */
  label?: "ai" | "real";
  /** Recorded response summary for the run directory (no image bytes). */
  raw?: string;
};

/**
 * A face-swap detector's honest answer when the image has no detectable
 * face: not a score, not an error — counted separately by the commands.
 */
export type NoFaceResult = { noFace: true };

export type DetectionResult = DetectionScore | NoFaceResult | { error: string };

export function isDetectionScore(r: DetectionResult): r is DetectionScore {
  return typeof (r as DetectionScore).score === "number";
}

export function isNoFaceResult(r: DetectionResult): r is NoFaceResult {
  return (r as NoFaceResult).noFace === true;
}

export interface Detector {
  id: string;
  name: string;
  detect(image: Buffer): Promise<DetectionResult>;
}

/** Injectable fetch: tests pass a fake, production uses the global. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export function truncate(s: string, n = 500): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Downscale for upload: long edge 1024, JPEG quality 85 — bounded payloads. */
export async function toUploadJpeg(buffer: Buffer, longEdge = 1024, quality = 85): Promise<{ body: Buffer; mime: string }> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("unreadable image");
  let img = sharp(buffer, { failOn: "none", animated: false }).rotate();
  if (Math.max(w, h) > longEdge) {
    img = img.resize({ width: w >= h ? longEdge : undefined, height: h > w ? longEdge : undefined, kernel: "lanczos3" });
  }
  const body = await img.jpeg({ quality }).toBuffer();
  return { body, mime: "image/jpeg" };
}

/** Extract the first JSON object in a string (fences, prose, or bare). */
export function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export type Skipped = { skipped: string };
export type DetectorFactoryResult = { detector: Detector } | Skipped;

export function isSkipped(r: DetectorFactoryResult): r is Skipped {
  return typeof (r as Skipped).skipped === "string";
}
