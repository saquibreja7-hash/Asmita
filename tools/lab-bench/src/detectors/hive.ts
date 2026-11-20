import { clampScore, truncate, toUploadJpeg, type Detector, type DetectorFactoryResult, type FetchLike } from "./types.ts";

export type HiveOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: FetchLike;
};

type HiveOutput = Record<string, unknown>;

/** Find an ai-generated class score anywhere in Hive's output list. */
export function hiveScoreFromOutput(output: unknown): number | null {
  if (!Array.isArray(output)) return null;
  for (const entry of output as HiveOutput[]) {
    if (!entry || typeof entry !== "object") continue;
    for (const [key, value] of Object.entries(entry)) {
      if (!/ai[-_]?generated/i.test(key) || !value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      if (typeof v.score === "number") return clampScore(v.score);
      const classes = v.classes;
      if (classes && typeof classes === "object") {
        const c = classes as Record<string, unknown>;
        for (const [cls, s] of Object.entries(c)) {
          if (/^ai([-_])?generated$/i.test(cls) && typeof s === "number") return clampScore(s);
        }
      }
    }
  }
  return null;
}

/**
 * Hive's synchronous moderation endpoint: multipart upload of the image with
 * the API key, response parsed defensively for any ai-generated class score
 * (the exact response schema has not been verified against a live key; the
 * raw response is recorded in the run directory for that first check).
 */
export function createHiveDetector(opts: HiveOptions = {}): DetectorFactoryResult {
  const apiKey = opts.apiKey ?? process.env.HIVE_API_KEY;
  if (!apiKey) return { skipped: "HIVE_API_KEY is not set" };
  const baseUrl = (opts.baseUrl ?? process.env.HIVE_BASE_URL ?? "https://api.thehive.ai").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url, init) => fetch(url, init));

  return {
    detector: {
      id: "hive",
      name: "Hive AI-generated detection",
      async detect(image: Buffer) {
        try {
          const { body, mime } = await toUploadJpeg(image);
          const form = new FormData();
          form.append("media", new Blob([new Uint8Array(body)], { type: mime }), "image.jpg");
          const res = await doFetch(`${baseUrl}/api/v2/task/sync`, {
            method: "POST",
            headers: { Authorization: `APIKey ${apiKey}` },
            body: form,
          });
          if (!res.ok) return { error: `hive_http_${res.status}` };
          const text = await res.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return { error: "hive_bad_response" };
          }
          const score = hiveScoreFromOutput((json as { output?: unknown }).output);
          if (score === null) return { error: "hive_bad_response" };
          return { score, raw: truncate(text) };
        } catch {
          return { error: "hive_request_failed" };
        }
      },
    },
  };
}
