import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildDetectors, createHiveDetector, createLocalOnnxDetector, createOpenAiDetector, createSightengineDetector, firstJsonObject, hiveScoreFromOutput, isDetectionScore, sightengineScoreFromResponse, toUploadJpeg } from "../src/detectors/index.ts";
import { stripes } from "../src/synthetic.ts";

/** Records calls and answers with a canned Response. */
function recordingFetch(status: number, body: string) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchFn };
}

const img = async () => stripes(80, 60, 5);

// The suite must never depend on real keys; scrub the env the factories read.
const KEYS = ["OPENAI_API_KEY", "HIVE_API_KEY", "SIGHTENGINE_USER", "SIGHTENGINE_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
for (const k of KEYS) delete process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("firstJsonObject", () => {
  it("extracts the first balanced object, tolerating fences and prose", () => {
    expect(firstJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(firstJsonObject('```json\n{"a": {"b": 2}}\n```')).toEqual({ a: { b: 2 } });
    expect(firstJsonObject('Sure! {"a": "} no }" } hope that helps')).toEqual({ a: "} no }" });
    expect(firstJsonObject("no json here")).toBeNull();
    expect(firstJsonObject('{"a":')).toBeNull();
  });
});

describe("OpenAI adapter", () => {
  it("is skipped without a key", () => {
    const r = createOpenAiDetector({ baseUrl: "https://api.example.test/v1" });
    expect("skipped" in r ? r.skipped : "").toMatch(/OPENAI_API_KEY/);
  });

  it("sends a vision request and folds verdict + confidence into one score", async () => {
    const { calls, fetchFn } = recordingFetch(200, JSON.stringify({
      choices: [{ message: { content: '{"ai_generated": true, "confidence": 80}' } }],
    }));
    const r = createOpenAiDetector({ apiKey: "test-key", model: "vision-model-x", baseUrl: "https://api.example.test/v1", fetchFn });
    expect("detector" in r).toBe(true);
    if (!("detector" in r)) return;
    const out = await r.detector.detect(await img());
    expect(isDetectionScore(out)).toBe(true);
    if (isDetectionScore(out)) {
      expect(out.score).toBeCloseTo(0.8, 6);
      expect(out.label).toBe("ai");
    }
    expect(calls[0]!.url).toBe("https://api.example.test/v1/chat/completions");
    const init = calls[0]!.init!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("vision-model-x");
    expect(body.messages[1].content[0].type).toBe("text");
    const dataUrl: string = body.messages[1].content[1].image_url.url;
    expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("maps a not-AI verdict to a low score", async () => {
    const { fetchFn } = recordingFetch(200, JSON.stringify({
      choices: [{ message: { content: '```json\n{"ai_generated": false, "confidence": 30}\n```' } }],
    }));
    const r = createOpenAiDetector({ apiKey: "k", baseUrl: "https://api.example.test/v1", fetchFn });
    if (!("detector" in r)) throw new Error("unreachable");
    const out = await r.detector.detect(await img());
    expect(isDetectionScore(out)).toBe(true);
    if (isDetectionScore(out)) {
      expect(out.score).toBeCloseTo(0.7, 6);
      expect(out.label).toBe("real");
    }
  });

  it("turns http errors and bad payloads into error codes", async () => {
    const http = recordingFetch(500, "{}");
    const rHttp = createOpenAiDetector({ apiKey: "k", baseUrl: "https://api.example.test/v1", fetchFn: http.fetchFn });
    if ("detector" in rHttp) {
      const out = await rHttp.detector.detect(await img());
      expect("error" in out && out.error).toBe("openai_http_500");
    }
    const bad = recordingFetch(200, JSON.stringify({ choices: [{ message: { content: "not json" } }] }));
    const rBad = createOpenAiDetector({ apiKey: "k", baseUrl: "https://api.example.test/v1", fetchFn: bad.fetchFn });
    if ("detector" in rBad) {
      const out = await rBad.detector.detect(await img());
      expect("error" in out && out.error).toBe("openai_bad_response");
    }
    const throwing = async () => {
      throw new Error("offline");
    };
    const rThrow = createOpenAiDetector({ apiKey: "k", baseUrl: "https://api.example.test/v1", fetchFn: throwing });
    if ("detector" in rThrow) {
      const out = await rThrow.detector.detect(await img());
      expect("error" in out && out.error).toBe("openai_request_failed");
    }
  });
});

describe("Hive adapter", () => {
  it("is skipped without a key", () => {
    const r = createHiveDetector({ baseUrl: "https://api.example.test" });
    expect("skipped" in r ? r.skipped : "").toMatch(/HIVE_API_KEY/);
  });

  it("parses an ai_generated class score out of the output list", async () => {
    const { calls, fetchFn } = recordingFetch(200, JSON.stringify({
      status: 200,
      output: [{ ai_generated_detection: { classes: { ai_generated: 0.42, not_ai_generated: 0.58 }, time_ms: 12 } }],
    }));
    const r = createHiveDetector({ apiKey: "hive-key", baseUrl: "https://api.example.test", fetchFn });
    if (!("detector" in r)) throw new Error("unreachable");
    const out = await r.detector.detect(await img());
    expect(isDetectionScore(out)).toBe(true);
    if (isDetectionScore(out)) expect(out.score).toBeCloseTo(0.42, 6);
    expect(calls[0]!.url).toBe("https://api.example.test/api/v2/task/sync");
    const init = calls[0]!.init!;
    expect((init.headers as Record<string, string>).Authorization).toBe("APIKey hive-key");
    expect(init.body).toBeInstanceOf(FormData);
    expect(hiveScoreFromOutput([{ "ai-generated": { score: 0.2 } }])).toBe(0.2);
    expect(hiveScoreFromOutput([])).toBeNull();
  });
});

describe("Sightengine adapter", () => {
  it("is skipped without credentials", () => {
    const r = createSightengineDetector({ baseUrl: "https://api.example.test" });
    expect("skipped" in r ? r.skipped : "").toMatch(/SIGHTENGINE/);
  });

  it("uploads multipart with the account, models and media", async () => {
    const { calls, fetchFn } = recordingFetch(200, JSON.stringify({ ai_generated: { score: 0.31 } }));
    const r = createSightengineDetector({ user: "u", secret: "s", baseUrl: "https://api.example.test", fetchFn });
    if (!("detector" in r)) throw new Error("unreachable");
    const out = await r.detector.detect(await img());
    expect(isDetectionScore(out)).toBe(true);
    if (isDetectionScore(out)) expect(out.score).toBeCloseTo(0.31, 6);
    expect(calls[0]!.url).toBe("https://api.example.test/1.0/check.json");
    const form = calls[0]!.init!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("user")).toBe("u");
    expect(form.get("secret")).toBe("s");
    expect(form.get("models")).toBe("ai-generated");
    expect(form.get("media")).toBeInstanceOf(Blob);
    expect(sightengineScoreFromResponse({ genai: 0.5 })).toBe(0.5);
    expect(sightengineScoreFromResponse({ other: 1 })).toBeNull();
  });
});

describe("local ONNX adapter", () => {
  it("is skipped without the weights file", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "lab-bench-models-"));
    try {
      const r = createLocalOnnxDetector({ modelsDir: emptyDir });
      expect("skipped" in r ? r.skipped : "").toMatch(/models:fetch/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("registry", () => {
  it("skips every keyless adapter instead of erroring", () => {
    // An empty models directory keeps this independent of locally fetched
    // weights: the local ONNX detector counts as keyless there too.
    const emptyModels = mkdtempSync(join(tmpdir(), "lab-bench-models-"));
    try {
      const { detectors, skipped } = buildDetectors({ modelsDir: emptyModels });
      expect(detectors).toHaveLength(0);
      expect(skipped.map((s) => s.id)).toEqual(["openai", "hive", "sightengine", "communityforensics"]);
      expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
    } finally {
      rmSync(emptyModels, { recursive: true, force: true });
    }
  });
});

describe("upload downscale", () => {
  it("caps the long edge and re-encodes as JPEG", async () => {
    const big = await sharp(await stripes(400, 200)).png().toBuffer();
    const { body, mime } = await toUploadJpeg(big);
    expect(mime).toBe("image/jpeg");
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
  });
});
