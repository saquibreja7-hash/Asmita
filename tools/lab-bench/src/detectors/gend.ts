import { clampScore, truncate, type Detector, type DetectorFactoryResult, type FetchLike } from "./types.ts";

/**
 * The lab-gend inference service (services/lab-gend, WP112) as an E1
 * detector adapter: the open GenD face-swap/reenactment detector
 * (Yermakov, Čech, Matas, Fritz, WACV 2026, MIT) behind the Lab's own
 * bearer-token HTTP service. Like every keyed adapter it is skipped unless
 * LAB_GEND_URL and LAB_GEND_TOKEN are set.
 *
 * The bytes are sent exactly as given — no toUploadJpeg downscale — because
 * the gend-eval command measures what the service sees after a degradation,
 * and the service itself detects and aligns faces on exactly these bytes.
 */
export type GendOptions = {
  url?: string;
  token?: string;
  fetchFn?: FetchLike;
};

export const GEND_SCORE_TIMEOUT_MS = 120_000;

/** The service's no-face answer: an honest result, never a score of 0. */
export function isGendNoFace(r: unknown): boolean {
  const body = r as { status?: unknown; image_p_fake?: unknown };
  return body?.status === "no_face" || body?.image_p_fake === null;
}

/** Sniff the multipart content type from the bytes the service will decode. */
export function gendMime(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return "image/webp";
  return "image/jpeg";
}

export function createGendDetector(opts: GendOptions = {}): DetectorFactoryResult {
  const baseUrl = opts.url ?? process.env.LAB_GEND_URL;
  const token = opts.token ?? process.env.LAB_GEND_TOKEN;
  if (!baseUrl) return { skipped: "LAB_GEND_URL is not set" };
  if (!token) return { skipped: "LAB_GEND_TOKEN is not set" };
  const url = baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((u: string, init?: RequestInit) => fetch(u, init));

  return {
    detector: {
      id: "gend",
      name: "GenD (open model, CTU Prague)",
      async detect(image: Buffer) {
        try {
          const form = new FormData();
          form.append("image", new Blob([new Uint8Array(image)], { type: gendMime(image) }), "image");
          const res = await doFetch(`${url}/v1/score`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            signal: AbortSignal.timeout(GEND_SCORE_TIMEOUT_MS),
          });
          const text = await res.text();
          if (!res.ok) return { error: `gend_http_${res.status}: ${truncate(text, 120)}` };
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return { error: "gend_bad_response" };
          }
          if (isGendNoFace(json)) return { noFace: true };
          const value = (json as { image_p_fake?: unknown }).image_p_fake;
          if (typeof value !== "number" || !Number.isFinite(value)) return { error: "gend_bad_response" };
          return { score: clampScore(value), raw: truncate(text, 200) };
        } catch {
          return { error: "gend_request_failed" };
        }
      },
    },
  };
}
