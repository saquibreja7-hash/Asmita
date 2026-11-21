import { clampScore, truncate, toUploadJpeg, type Detector, type DetectorFactoryResult, type FetchLike } from "./types.ts";

export type SightengineOptions = {
  user?: string;
  secret?: string;
  baseUrl?: string;
  fetchFn?: FetchLike;
};

/** Find an ai-generated score anywhere in Sightengine's response. */
export function sightengineScoreFromResponse(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!/^(ai([-_])?generated|genai)$/i.test(key)) continue;
    if (typeof value === "number") return clampScore(value);
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (typeof v.score === "number") return clampScore(v.score);
    }
  }
  return null;
}

/**
 * Sightengine's check endpoint with the ai-generated model: multipart upload
 * with the account credentials. The response key for the model's score is
 * matched defensively and the raw response recorded in the run directory
 * (not verified against a live account).
 */
export function createSightengineDetector(opts: SightengineOptions = {}): DetectorFactoryResult {
  const user = opts.user ?? process.env.SIGHTENGINE_USER;
  const secret = opts.secret ?? process.env.SIGHTENGINE_SECRET;
  if (!user || !secret) return { skipped: "SIGHTENGINE_USER / SIGHTENGINE_SECRET are not set" };
  const baseUrl = (opts.baseUrl ?? process.env.SIGHTENGINE_BASE_URL ?? "https://api.sightengine.com").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url, init) => fetch(url, init));

  return {
    detector: {
      id: "sightengine",
      name: "Sightengine ai-generated",
      async detect(image: Buffer) {
        try {
          const { body, mime } = await toUploadJpeg(image);
          const form = new FormData();
          form.append("user", user);
          form.append("secret", secret);
          form.append("models", "ai-generated");
          form.append("media", new Blob([new Uint8Array(body)], { type: mime }), "image.jpg");
          const res = await doFetch(`${baseUrl}/1.0/check.json`, { method: "POST", body: form });
          if (!res.ok) return { error: `sightengine_http_${res.status}` };
          const text = await res.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return { error: "sightengine_bad_response" };
          }
          const score = sightengineScoreFromResponse(json);
          if (score === null) return { error: "sightengine_bad_response" };
          return { score, raw: truncate(text) };
        } catch {
          return { error: "sightengine_request_failed" };
        }
      },
    },
  };
}
