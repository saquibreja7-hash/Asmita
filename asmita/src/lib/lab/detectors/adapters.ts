/*
 * Detector adapters for the public detector panel (/lab/detectors,
 * docs/lab/beta-spec.md WP90). The interface and the hosted adapters reuse
 * the E1 detector benchmark's design (tools/lab-bench/src/detectors),
 * which lives in its own offline package the Worker app cannot import: same
 * Detector shape, same provider endpoints and defensive response parsing,
 * same rule that an adapter whose key is unset is skipped ("not
 * configured"), never an error.
 *
 * Differences from lab-bench, on purpose: the app has no sharp, so the image
 * is forwarded exactly as uploaded (already capped at 10 MB and sniffed to
 * JPEG/PNG/WebP by the route) instead of being downscaled to a JPEG; the
 * local ONNX model stays a lab-bench offline tool; and each adapter's options
 * carry a provider-prefixed key name so no two adapters can ever read one
 * another's credential through a shared options object.
 *
 * The fourth adapter (research-tools spec WP113) is Asmita's own lab-gend
 * service (services/lab-gend, WP112): the open GenD face-swap detector
 * (Yermakov, Čech, Matas, Fritz, WACV 2026, MIT) behind a bearer-token HTTP
 * endpoint the owner hosts outside the Worker. Unset LAB_GEND_URL or
 * LAB_GEND_TOKEN leaves its row "not configured" like every keyless adapter.
 *
 * All scores are P(AI-generated / manipulated) in [0, 1]. Unit tests inject a
 * fake fetch: no test or fixture ever contacts a provider, and no key is
 * committed.
 */

/** The image exactly as the route accepted it: sniffed bytes plus their type. */
export type LabImage = { bytes: Uint8Array<ArrayBuffer>; mime: string };

export type DetectionScore = {
  /** P(AI-generated / manipulated), 0..1. */
  score: number;
  /** The provider's own verdict, when it gives one. */
  label?: "ai" | "real";
};

/** A face-swap detector's honest answer when it finds no face to score. */
export type NoFaceResult = { noFace: true };

export function isNoFaceResult(r: DetectionResult): r is NoFaceResult {
  return (r as NoFaceResult).noFace === true;
}

export type DetectionResult = DetectionScore | NoFaceResult | { error: string };

export function isDetectionScore(r: DetectionResult): r is DetectionScore {
  return typeof (r as DetectionScore).score === "number";
}

export interface Detector {
  id: string;
  name: string;
  detect(image: LabImage): Promise<DetectionResult>;
}

/** Injectable fetch: tests pass a fake, production uses the global. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
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

// ── OpenAI vision ──────────────────────────────────────────────────────

export type OpenAiOptions = {
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  fetchFn?: FetchLike;
};

/**
 * OpenAI vision chat model as an "AI-made / manipulated" detector: the image
 * goes up as a data URL with a prompt that demands strict JSON
 * { ai_generated: boolean, confidence: 0..100 }. The score folds the verdict
 * and its stated confidence into one number on the shared 0..1 scale.
 */
export function createOpenAiDetector(opts: OpenAiOptions = {}): DetectorFactoryResult {
  const apiKey = opts.openaiApiKey;
  if (!apiKey) return { skipped: "OPENAI_API_KEY is not set" };
  const model = opts.openaiModel ?? "gpt-4o-mini";
  const baseUrl = (opts.openaiBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init));

  return {
    detector: {
      id: "openai",
      name: "OpenAI vision",
      async detect(image: LabImage) {
        try {
          const dataUrl = `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
          const prompt =
            "You are examining an image for signs it was generated or edited by AI, " +
            "including fully synthetic images, face swaps and other composites. " +
            'Answer strictly as JSON: {"ai_generated": true|false, "confidence": 0-100}. ' +
            "confidence is how sure you are of your answer.";
          const res = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: "You are an image forensics assistant. Reply with JSON only." },
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ],
              temperature: 0,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) return { error: `openai_http_${res.status}` };
          const json = (await res.json().catch(() => null)) as {
            choices?: Array<{ message?: { content?: string } }>;
          } | null;
          const content = json?.choices?.[0]?.message?.content ?? "";
          const parsed = firstJsonObject(content);
          if (!parsed || typeof parsed.ai_generated !== "boolean") return { error: "openai_bad_response" };
          const confidence = clampScore((Number(parsed.confidence ?? 50) || 0) / 100);
          return {
            score: parsed.ai_generated ? confidence : 1 - confidence,
            label: parsed.ai_generated ? "ai" : "real",
          };
        } catch {
          return { error: "openai_request_failed" };
        }
      },
    },
  };
}

// ── Hive ────────────────────────────────────────────────────────────────

export type HiveOptions = {
  hiveApiKey?: string;
  hiveBaseUrl?: string;
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
 * (the exact response schema has not been verified against a live key).
 */
export function createHiveDetector(opts: HiveOptions = {}): DetectorFactoryResult {
  const apiKey = opts.hiveApiKey;
  if (!apiKey) return { skipped: "HIVE_API_KEY is not set" };
  const baseUrl = (opts.hiveBaseUrl ?? "https://api.thehive.ai").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init));

  return {
    detector: {
      id: "hive",
      name: "Hive AI-generated detection",
      async detect(image: LabImage) {
        try {
          const form = new FormData();
          form.append("media", new Blob([image.bytes], { type: image.mime }), "image");
          const res = await doFetch(`${baseUrl}/api/v2/task/sync`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
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
          return { score };
        } catch {
          return { error: "hive_request_failed" };
        }
      },
    },
  };
}

// ── Sightengine ─────────────────────────────────────────────────────────

export type SightengineOptions = {
  sightengineUser?: string;
  sightengineSecret?: string;
  sightengineBaseUrl?: string;
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
 * matched defensively (not verified against a live account).
 */
export function createSightengineDetector(opts: SightengineOptions = {}): DetectorFactoryResult {
  const user = opts.sightengineUser;
  const secret = opts.sightengineSecret;
  if (!user || !secret) return { skipped: "SIGHTENGINE_USER / SIGHTENGINE_SECRET are not set" };
  const baseUrl = (opts.sightengineBaseUrl ?? "https://api.sightengine.com").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init));

  return {
    detector: {
      id: "sightengine",
      name: "Sightengine ai-generated",
      async detect(image: LabImage) {
        try {
          const form = new FormData();
          form.append("user", user);
          form.append("secret", secret);
          form.append("models", "ai-generated");
          form.append("media", new Blob([image.bytes], { type: image.mime }), "image");
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
          return { score };
        } catch {
          return { error: "sightengine_request_failed" };
        }
      },
    },
  };
}

// ── GenD (services/lab-gend, research-tools spec WP113) ────────────────

export type GendOptions = {
  /** Base URL of the lab-gend service, e.g. http://127.0.0.1:8080 (env LAB_GEND_URL). */
  gendUrl?: string;
  /** Shared bearer secret with the service (env LAB_GEND_TOKEN). */
  gendToken?: string;
  fetchFn?: FetchLike;
};

/**
 * The lab-gend inference service (services/lab-gend, WP112) as a panel
 * adapter: multipart upload of the exact bytes, `image_p_fake` read from the
 * service's JSON answer. The service detects and aligns the faces itself, so
 * the panel sends the image untouched — the same request a deployment makes.
 *
 * GenD is a face-swap/reenactment detector: when the service finds no face
 * it answers `status: "no_face"` with a null score, and the adapter reports
 * that honestly as a no-face result, never a score of 0.
 */
export function createGendDetector(opts: GendOptions = {}): DetectorFactoryResult {
  const baseUrl = opts.gendUrl;
  const token = opts.gendToken;
  if (!baseUrl) return { skipped: "LAB_GEND_URL is not set" };
  if (!token) return { skipped: "LAB_GEND_TOKEN is not set" };
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { skipped: "LAB_GEND_URL is not a valid URL" };
  }
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  // Images and the bearer token must never cross the internet in clear text.
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    return { skipped: "LAB_GEND_URL must be https" };
  }
  const url = baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init));

  return {
    detector: {
      id: "gend",
      name: "GenD (open model, CTU Prague)",
      async detect(image: LabImage) {
        try {
          const form = new FormData();
          form.append("image", new Blob([image.bytes], { type: image.mime }), "image");
          const res = await doFetch(`${url}/v1/score`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) return { error: `gend_http_${res.status}` };
          const text = await res.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return { error: "gend_bad_response" };
          }
          const body = json as { status?: unknown; image_p_fake?: unknown };
          if (body.status === "no_face") return { noFace: true };
          if (typeof body.image_p_fake !== "number" || !Number.isFinite(body.image_p_fake)) {
            // The service's no-face answer is a null score; anything else
            // non-numeric is a protocol break, never a silent 0.
            if (body.image_p_fake === null) return { noFace: true };
            return { error: "gend_bad_response" };
          }
          return { score: clampScore(body.image_p_fake) };
        } catch {
          return { error: "gend_request_failed" };
        }
      },
    },
  };
}

// ── Registry ────────────────────────────────────────────────────────────

export type DetectorRegistryOptions = OpenAiOptions & HiveOptions & SightengineOptions & GendOptions;

/**
 * One row of the fixed panel order. The id and display name are known even
 * for a skipped adapter, so the "not configured" row can be rendered without
 * parsing the skip reason.
 */
export type RegistryRow = {
  id: string;
  name: string;
  result: DetectorFactoryResult;
};

/** Every adapter in its fixed panel order; keyless ones come back skipped. */
export function buildDetectorRegistry(opts: DetectorRegistryOptions = {}): RegistryRow[] {
  const openai = createOpenAiDetector(opts);
  const hive = createHiveDetector(opts);
  const sightengine = createSightengineDetector(opts);
  const gend = createGendDetector(opts);
  return [
    { id: "openai", name: detectorName(openai, "OpenAI vision"), result: openai },
    { id: "hive", name: detectorName(hive, "Hive AI-generated detection"), result: hive },
    { id: "sightengine", name: detectorName(sightengine, "Sightengine ai-generated"), result: sightengine },
    { id: "gend", name: detectorName(gend, "GenD (open model, CTU Prague)"), result: gend },
  ];
}

function detectorName(result: DetectorFactoryResult, skipped: string) {
  return "detector" in result ? result.detector.name : skipped;
}

/** Read the registry's credentials from an env block (process.env in the route). */
export function registryOptionsFromEnv(
  env: Record<string, string | undefined>,
  fetchFn?: FetchLike,
): DetectorRegistryOptions {
  return {
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    openaiModel: env.OPENAI_VISION_MODEL || undefined,
    openaiBaseUrl: env.OPENAI_BASE_URL || undefined,
    hiveApiKey: env.HIVE_API_KEY || undefined,
    hiveBaseUrl: env.HIVE_BASE_URL || undefined,
    sightengineUser: env.SIGHTENGINE_USER || undefined,
    sightengineSecret: env.SIGHTENGINE_SECRET || undefined,
    sightengineBaseUrl: env.SIGHTENGINE_BASE_URL || undefined,
    gendUrl: env.LAB_GEND_URL || undefined,
    gendToken: env.LAB_GEND_TOKEN || undefined,
    fetchFn,
  };
}
