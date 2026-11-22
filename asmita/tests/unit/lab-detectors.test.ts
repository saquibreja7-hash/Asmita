import { describe, expect, it, vi } from "vitest";
import {
  buildDetectorRegistry,
  clampScore,
  createGendDetector,
  createHiveDetector,
  createOpenAiDetector,
  createSightengineDetector,
  firstJsonObject,
  hiveScoreFromOutput,
  isNoFaceResult,
  isSkipped,
  sightengineScoreFromResponse,
  type FetchLike,
  type LabImage,
} from "@/lib/lab/detectors/adapters";
import { bandsDisagree, runDetectorPanel, verdictBand, type DetectorRow } from "@/lib/lab/detectors/panel";

// The detector adapters and the panel runner (docs/lab/beta-spec.md WP90).
// Every adapter is exercised against an injected fake fetch with invented
// provider-shaped responses: no test contacts a network, and no key is
// needed or committed. The parsing rules are the E1 lab-bench ones, reused.

const IMAGE: LabImage = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
  mime: "image/png",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Unwraps a configured detector; a skipped one fails the test. */
function detectorOf(result: import("@/lib/lab/detectors/adapters").DetectorFactoryResult) {
  if (isSkipped(result)) throw new Error(`expected a configured detector, got: ${result.skipped}`);
  return result.detector;
}

/** An OpenAI chat completion whose message content is the given string. */
function openaiContent(content: string, status = 200): Response {
  return jsonResponse({ choices: [{ message: { content } }] }, status);
}

describe("score helpers", () => {
  it("clamps non-finite and out-of-range scores", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(0.42)).toBe(0.42);
  });

  it("extracts the first JSON object from prose or fences", () => {
    expect(firstJsonObject('Sure! {"ai_generated": true, "confidence": 55} hope that helps')).toEqual({
      ai_generated: true,
      confidence: 55,
    });
    expect(firstJsonObject("no json here")).toBeNull();
    expect(firstJsonObject('{"broken": ')).toBeNull();
  });
});

describe("OpenAI vision adapter", () => {
  it("is skipped without a key, like every adapter", () => {
    const result = createOpenAiDetector({});
    expect(isSkipped(result)).toBe(true);
    if (isSkipped(result)) expect(result.skipped).toBe("OPENAI_API_KEY is not set");
  });

  it("folds an AI verdict and its confidence into one score", async () => {
    const fetchFn: FetchLike = vi.fn(async () => openaiContent('{"ai_generated": true, "confidence": 80}'));
    const detector = detectorOf(createOpenAiDetector({ openaiApiKey: "test-key", fetchFn }));
    const result = await detector.detect(IMAGE);
    expect(result).toEqual({ score: 0.8, label: "ai" });
    // The image travels as a data URL inside the chat request.
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(String(init.body)).toContain('"image_url"');
  });

  it("folds a real verdict the other way", async () => {
    const detector = detectorOf(createOpenAiDetector({ openaiApiKey: "test-key" }));
    vi.stubGlobal("fetch", vi.fn(async () => openaiContent('{"ai_generated": false, "confidence": 90}')));
    const result = await detector.detect(IMAGE);
    expect(result).toEqual({ score: expect.closeTo(0.1, 10), label: "real" });
    vi.unstubAllGlobals();
  });

  it("reads JSON wrapped in the model's prose", async () => {
    const detector = detectorOf(createOpenAiDetector({ openaiApiKey: "test-key" }));
    vi.stubGlobal("fetch", vi.fn(async () => openaiContent('Here you go: {"ai_generated": true, "confidence": 55}!')));
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.55, label: "ai" });
    vi.unstubAllGlobals();
  });

  it("turns provider failures into fixed error codes", async () => {
    const detector = detectorOf(createOpenAiDetector({ openaiApiKey: "test-key" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "openai_http_500" });

    vi.stubGlobal("fetch", vi.fn(async () => openaiContent("I cannot answer that")));
    expect(await detector.detect(IMAGE)).toEqual({ error: "openai_bad_response" });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await detector.detect(IMAGE)).toEqual({ error: "openai_request_failed" });
    vi.unstubAllGlobals();
  });
});

describe("Hive adapter", () => {
  it("is skipped without a key", () => {
    const result = createHiveDetector({});
    expect(isSkipped(result)).toBe(true);
  });

  it("finds the ai-generated score wherever Hive nests it", async () => {
    const detector = detectorOf(createHiveDetector({ hiveApiKey: "test-key" }));
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ output: [{ classes: { nsfw: 0.1 }, "ai-generated": { score: 0.12 } }] }),
    ));
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.12 });

    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ output: [{ "ai_generated": { classes: { ai_generated: 0.94 } } }] }),
    ));
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.94 });
    vi.unstubAllGlobals();
  });

  it("refuses responses without a usable score", async () => {
    const detector = detectorOf(createHiveDetector({ hiveApiKey: "test-key" }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ output: [{ nsfw: { score: 0.9 } }] })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "hive_bad_response" });
    vi.unstubAllGlobals();
  });

  it("extracts scores defensively in the pure helper", () => {
    expect(hiveScoreFromOutput(undefined)).toBeNull();
    expect(hiveScoreFromOutput("nope")).toBeNull();
    expect(hiveScoreFromOutput([{ "ai-generated": { score: 2 } }])).toBe(1);
  });
});

describe("Sightengine adapter", () => {
  it("is skipped without both credentials", () => {
    expect(isSkipped(createSightengineDetector({}))).toBe(true);
    expect(isSkipped(createSightengineDetector({ sightengineUser: "u" }))).toBe(true);
  });

  it("finds the ai-generated score under either key spelling", async () => {
    const detector = detectorOf(createSightengineDetector({ sightengineUser: "u", sightengineSecret: "s" }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ai_generated: { score: 0.91 } })));
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.91 });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ genai: 0.07 })));
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.07 });
    vi.unstubAllGlobals();
  });

  it("refuses responses without a usable score", async () => {
    const detector = detectorOf(createSightengineDetector({ sightengineUser: "u", sightengineSecret: "s" }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ type: "nope" })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "sightengine_bad_response" });
    vi.unstubAllGlobals();
  });

  it("extracts scores defensively in the pure helper", () => {
    expect(sightengineScoreFromResponse(null)).toBeNull();
    expect(sightengineScoreFromResponse({ weapons: 0.5 })).toBeNull();
    expect(sightengineScoreFromResponse({ "ai_generated": 9 })).toBe(1);
  });
});

describe("GenD adapter (WP113)", () => {
  it("is skipped without the service URL or the token", () => {
    const both = createGendDetector({});
    expect(isSkipped(both)).toBe(true);
    if (isSkipped(both)) expect(both.skipped).toBe("LAB_GEND_URL is not set");
    const noToken = createGendDetector({ gendUrl: "http://127.0.0.1:8099" });
    expect(isSkipped(noToken)).toBe(true);
    if (isSkipped(noToken)) expect(noToken.skipped).toBe("LAB_GEND_TOKEN is not set");
    const noUrl = createGendDetector({ gendToken: "test-token" });
    expect(isSkipped(noUrl)).toBe(true);
    if (isSkipped(noUrl)) expect(noUrl.skipped).toBe("LAB_GEND_URL is not set");
  });

  it("posts the exact bytes with the bearer token and maps image_p_fake", async () => {
    const fetchFn: FetchLike = vi.fn(async () =>
      jsonResponse({
        model: "GenD_CLIP_L_14@test",
        detector: "YuNet@2023mar",
        faces: [{ box: [10, 12, 140, 140], p_fake: 0.87 }],
        image_p_fake: 0.87,
        status: "ok",
        timings_ms: { decode: 5, detect: 3, score: 900, total: 908 },
      }),
    );
    const detector = detectorOf(
      createGendDetector({ gendUrl: "http://127.0.0.1:8099/", gendToken: "test-token", fetchFn }),
    );
    expect(await detector.detect(IMAGE)).toEqual({ score: 0.87 });
    // One request to the service's score endpoint, trailing slash normalised.
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8099/v1/score");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    // The image travels as multipart form data, exactly as the route sniffed it.
    const body = init.body as FormData;
    expect(body.get("image")).toBeInstanceOf(Blob);
  });

  it("reports the service's no-face answer, never a zero score", async () => {
    const fetchFn: FetchLike = vi.fn(async () =>
      jsonResponse({
        model: "GenD_CLIP_L_14@test",
        detector: "YuNet@2023mar",
        faces: [],
        image_p_fake: null,
        status: "no_face",
        timings_ms: { decode: 5, detect: 3, score: 0, total: 8 },
      }),
    );
    const detector = detectorOf(createGendDetector({ gendUrl: "http://127.0.0.1:8099", gendToken: "t", fetchFn }));
    const result = await detector.detect(IMAGE);
    expect(result).toEqual({ noFace: true });
    expect(isNoFaceResult(result)).toBe(true);

    // The null-score spelling of the same answer.
    const nullScore: FetchLike = vi.fn(async () => jsonResponse({ faces: [], image_p_fake: null, status: "ok" }));
    const other = detectorOf(createGendDetector({ gendUrl: "http://127.0.0.1:8099", gendToken: "t", fetchFn: nullScore }));
    expect(await other.detect(IMAGE)).toEqual({ noFace: true });
  });

  it("turns provider failures into fixed error codes, 429 included", async () => {
    const detector = detectorOf(createGendDetector({ gendUrl: "http://127.0.0.1:8099", gendToken: "t" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error": "busy"}', { status: 429 })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "gend_http_429" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "gend_bad_response" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ faces: [{ box: [0, 0, 10, 10], p_fake: 0.5 }], status: "ok" })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "gend_bad_response" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ image_p_fake: "0.9", status: "ok" })));
    expect(await detector.detect(IMAGE)).toEqual({ error: "gend_bad_response" });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await detector.detect(IMAGE)).toEqual({ error: "gend_request_failed" });
    vi.unstubAllGlobals();
  });

  it("clamps an out-of-range score rather than trusting the wire", async () => {
    const fetchFn: FetchLike = vi.fn(async () => jsonResponse({ faces: [], image_p_fake: 1.4, status: "ok" }));
    const detector = detectorOf(createGendDetector({ gendUrl: "http://127.0.0.1:8099", gendToken: "t", fetchFn }));
    expect(await detector.detect(IMAGE)).toEqual({ score: 1 });
  });
});

describe("the registry", () => {
  it("keeps the fixed panel order and names skipped rows", () => {
    const rows = buildDetectorRegistry({});
    expect(rows.map((row) => row.id)).toEqual(["openai", "hive", "sightengine", "gend"]);
    expect(rows.map((row) => row.name)).toEqual([
      "OpenAI vision",
      "Hive AI-generated detection",
      "Sightengine ai-generated",
      "GenD (open model, CTU Prague)",
    ]);
    expect(rows.every((row) => isSkipped(row.result))).toBe(true);
  });

  it("builds only the adapters whose keys are set", () => {
    const rows = buildDetectorRegistry({ hiveApiKey: "test-key" });
    expect(isSkipped(rows[0]!.result)).toBe(true);
    expect(isSkipped(rows[1]!.result)).toBe(false);
    expect(isSkipped(rows[2]!.result)).toBe(true);
    expect(isSkipped(rows[3]!.result)).toBe(true);
  });

  it("builds the GenD adapter when both its env values are set", () => {
    const rows = buildDetectorRegistry({ gendUrl: "http://127.0.0.1:8099", gendToken: "test-token" });
    expect(isSkipped(rows[3]!.result)).toBe(false);
    if (!isSkipped(rows[3]!.result)) expect(rows[3]!.result.detector.id).toBe("gend");
  });
});

describe("verdict bands", () => {
  it("bands a 0..1 score into the three WP90 labels", () => {
    expect(verdictBand(0)).toBe("likely_camera");
    expect(verdictBand(0.29)).toBe("likely_camera");
    expect(verdictBand(0.3)).toBe("unclear");
    expect(verdictBand(0.69)).toBe("unclear");
    expect(verdictBand(0.7)).toBe("likely_ai");
    expect(verdictBand(1)).toBe("likely_ai");
  });

  it("flags disagreement only among detectors that scored", () => {
    const row = (band: DetectorRow["band"], status: DetectorRow["status"] = "scored"): DetectorRow => ({
      id: "x", name: "X", status, band,
    });
    expect(bandsDisagree([row("likely_ai"), row("likely_ai")])).toBe(false);
    expect(bandsDisagree([row("likely_ai"), row("unclear")])).toBe(true);
    expect(bandsDisagree([row("likely_ai"), row(undefined, "not_configured")])).toBe(false);
    expect(bandsDisagree([row("likely_ai"), row(undefined, "error")])).toBe(false);
    expect(bandsDisagree([row(undefined, "error"), row(undefined, "not_configured")])).toBe(false);
  });
});

describe("runDetectorPanel", () => {
  it("answers not_configured for every adapter when no key is set, without any network", async () => {
    const fetchSpy = vi.fn(async () => new Response("must not be called"));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runDetectorPanel(IMAGE, { env: {}, fetchFn: fetchSpy });
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((row) => row.status === "not_configured")).toBe(true);
    expect(result.disagree).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("scores with the one configured detector, keeps the others honest", async () => {
    const fetchFn: FetchLike = vi.fn(async () => openaiContent('{"ai_generated": true, "confidence": 80}'));
    const result = await runDetectorPanel(IMAGE, { env: { OPENAI_API_KEY: "test-key" }, fetchFn });
    const openai = result.rows.find((row) => row.id === "openai");
    expect(openai).toMatchObject({ status: "scored", score: 80, band: "likely_ai" });
    expect(result.rows.filter((row) => row.status === "not_configured")).toHaveLength(3);
    expect(result.disagree).toBe(false);
  });

  it("rounds the 0..1 score to the panel's 0..100 scale", async () => {
    const fetchFn: FetchLike = vi.fn(async () => openaiContent('{"ai_generated": true, "confidence": 67.8}'));
    const result = await runDetectorPanel(IMAGE, { env: { OPENAI_API_KEY: "test-key" }, fetchFn });
    expect(result.rows[0]).toMatchObject({ status: "scored", score: 68, band: "unclear" });
  });

  it("notes when two detectors fall in different bands", async () => {
    const fetchFn: FetchLike = vi.fn(async (url: string) => {
      if (url.includes("thehive.ai")) return jsonResponse({ output: [{ "ai-generated": { score: 0.02 } }] });
      return openaiContent('{"ai_generated": true, "confidence": 80}');
    });
    const result = await runDetectorPanel(IMAGE, {
      env: { OPENAI_API_KEY: "test-key", HIVE_API_KEY: "test-key" },
      fetchFn,
    });
    expect(result.rows.find((row) => row.id === "openai")).toMatchObject({ band: "likely_ai" });
    expect(result.rows.find((row) => row.id === "hive")).toMatchObject({ status: "scored", score: 2, band: "likely_camera" });
    expect(result.disagree).toBe(true);
  });

  it("turns a failing detector into an error row without sinking the others", async () => {
    const fetchFn: FetchLike = vi.fn(async (url: string) => {
      if (url.includes("thehive.ai")) return new Response("down", { status: 503 });
      return openaiContent('{"ai_generated": true, "confidence": 80}');
    });
    const result = await runDetectorPanel(IMAGE, {
      env: { OPENAI_API_KEY: "test-key", HIVE_API_KEY: "test-key" },
      fetchFn,
    });
    expect(result.rows.find((row) => row.id === "openai")).toMatchObject({ status: "scored" });
    expect(result.rows.find((row) => row.id === "hive")).toMatchObject({ status: "error", error: "hive_http_503" });
    expect(result.disagree).toBe(false);
  });

  it("gives up on a detector that runs past the panel timeout", async () => {
    const fetchFn: FetchLike = () => new Promise(() => {});
    const result = await runDetectorPanel(IMAGE, {
      env: { OPENAI_API_KEY: "test-key" },
      fetchFn,
      timeoutMs: 10,
    });
    expect(result.rows.find((row) => row.id === "openai")).toMatchObject({ status: "error", error: "timeout" });
  });

  it("bands a GenD score through the same 0..100 scale as every other row", async () => {
    const fetchFn: FetchLike = vi.fn(async () =>
      jsonResponse({ faces: [{ box: [0, 0, 50, 50], p_fake: 0.724 }], image_p_fake: 0.724, status: "ok" }),
    );
    const result = await runDetectorPanel(IMAGE, {
      env: { LAB_GEND_URL: "http://127.0.0.1:8099", LAB_GEND_TOKEN: "test-token" },
      fetchFn,
    });
    expect(result.rows.find((row) => row.id === "gend")).toMatchObject({
      status: "scored",
      score: 72,
      band: "likely_ai",
    });
    // The three keyless rows stay honest.
    expect(result.rows.filter((row) => row.status === "not_configured")).toHaveLength(3);
  });

  it("shows a GenD no-face answer as its own row status, not a score and not an error", async () => {
    const fetchFn: FetchLike = vi.fn(async () =>
      jsonResponse({ faces: [], image_p_fake: null, status: "no_face" }),
    );
    const result = await runDetectorPanel(IMAGE, {
      env: { LAB_GEND_URL: "http://127.0.0.1:8099", LAB_GEND_TOKEN: "test-token" },
      fetchFn,
    });
    const gend = result.rows.find((row) => row.id === "gend");
    expect(gend).toMatchObject({ status: "no_face" });
    expect(gend?.score).toBeUndefined();
    // A no-face answer is not a disagreement: nothing scored against it.
    expect(result.disagree).toBe(false);
  });

  it("times a hung GenD service out without sinking the panel", async () => {
    const fetchFn: FetchLike = () => new Promise(() => {});
    const result = await runDetectorPanel(IMAGE, {
      env: { LAB_GEND_URL: "http://127.0.0.1:8099", LAB_GEND_TOKEN: "test-token" },
      fetchFn,
      timeoutMs: 10,
    });
    expect(result.rows.find((row) => row.id === "gend")).toMatchObject({ status: "error", error: "timeout" });
  });
});
