import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/lab/detectors route (docs/lab/beta-spec.md WP90): the Lab gate,
// CSRF, the body cap, the strict consent field, the image type and
// magic-byte checks, both rate limits, and the in-memory-only panel run.
// Invented data only; the panel's own adapters are exercised in
// lab-detectors.test.ts against injected fakes.

import { createCsrfPair } from "@/lib/csrf";
import * as detectorsRoute from "@/app/api/lab/detectors/route";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const MAX_BYTES = 10 * 1024 * 1024;

function pngBlob() {
  return new Blob([PNG_HEAD], { type: "image/png" });
}

function panelRequest(
  overrides: {
    file?: Blob;
    consent?: string | null;
    csrf?: boolean;
    ip?: string;
    contentLength?: number;
    rawBody?: string;
  } = {},
) {
  const { nonce, token } = createCsrfPair();
  const file = overrides.file ?? pngBlob();
  const headers: Record<string, string> = {
    "x-forwarded-for": overrides.ip ?? "203.0.113.10",
    ...(overrides.csrf === false ? {} : { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token }),
    ...(overrides.contentLength !== undefined ? { "content-length": String(overrides.contentLength) } : {}),
  };
  if (overrides.rawBody !== undefined) {
    return new Request("https://asmita.test/api/lab/detectors", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: overrides.rawBody,
    });
  }
  const form = new FormData();
  form.append("file", file, "synthetic.png");
  if (overrides.consent !== null) form.append("consent", overrides.consent ?? "true");
  return new Request("https://asmita.test/api/lab/detectors", { method: "POST", headers, body: form });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_LAB", "true");
  // No detector is configured unless a test opts in: an ambient key in the
  // shell must never turn the "not_configured" assertions into network calls.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("HIVE_API_KEY", "");
  vi.stubEnv("SIGHTENGINE_USER", "");
  vi.stubEnv("SIGHTENGINE_SECRET", "");
  vi.stubEnv("LAB_GEND_URL", "");
  vi.stubEnv("LAB_GEND_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("/api/lab/detectors", () => {
  it("refuses with 503 lab_disabled while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const refused = await detectorsRoute.POST(panelRequest());
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: "lab_disabled" });
  });

  it("refuses a POST without a valid CSRF pair", async () => {
    const refused = await detectorsRoute.POST(panelRequest({ csrf: false }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "csrf_failed" });
  });

  it("rejects an oversized declared body before reading it", async () => {
    const refused = await detectorsRoute.POST(panelRequest({ contentLength: MAX_BYTES + 64 * 1024 + 1 }));
    expect(refused.status).toBe(413);
    expect(await refused.json()).toEqual({ error: "payload_too_large" });
  });

  it("rejects a body that is not multipart form data", async () => {
    const refused = await detectorsRoute.POST(panelRequest({ rawBody: "not a form" }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "invalid_payload" });
  });

  it("requires the explicit consent tick", async () => {
    const refused = await detectorsRoute.POST(panelRequest({ consent: null }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "consent_required" });
  });

  it("refuses a missing file, an unsupported type, and an oversize file", async () => {
    // A valid multipart form that simply carries no file.
    const { nonce, token } = createCsrfPair();
    const emptyForm = new FormData();
    emptyForm.append("consent", "true");
    const noFile = await detectorsRoute.POST(
      new Request("https://asmita.test/api/lab/detectors", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.11", cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
        body: emptyForm,
      }),
    );
    expect(noFile.status).toBe(400);
    expect(await noFile.json()).toEqual({ error: "no_file" });

    const wrongType = await detectorsRoute.POST(
      panelRequest({ file: new Blob([PNG_HEAD], { type: "image/gif" }), ip: "203.0.113.12" }),
    );
    expect(wrongType.status).toBe(415);
    expect(await wrongType.json()).toEqual({ error: "unsupported_type" });

    const tooBig = await detectorsRoute.POST(
      panelRequest({ file: new Blob([PNG_HEAD, new Uint8Array(MAX_BYTES)], { type: "image/png" }), ip: "203.0.113.13" }),
    );
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: "invalid_size" });
  });

  it("refuses bytes whose magic numbers do not match the declared type", async () => {
    const mismatch = await detectorsRoute.POST(
      panelRequest({ file: new Blob([JPEG_HEAD], { type: "image/png" }), ip: "203.0.113.14" }),
    );
    expect(mismatch.status).toBe(415);
    expect(await mismatch.json()).toEqual({ error: "not_an_image" });
  });

  it("answers the panel with not_configured rows and no network call", async () => {
    const fetchSpy = vi.fn(async () => new Response("must not be called"));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await detectorsRoute.POST(panelRequest({ ip: "203.0.113.15" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { rows: Array<{ id: string; status: string }>; disagree: boolean };
    expect(body.rows.map((row) => row.id)).toEqual(["openai", "hive", "sightengine", "gend"]);
    expect(body.rows.every((row) => row.status === "not_configured")).toBe(true);
    expect(body.disagree).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("scores through a configured adapter and marks the others not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ai_generated": true, "confidence": 80}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const response = await detectorsRoute.POST(panelRequest({ ip: "203.0.113.16" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rows: Array<{ id: string; status: string; score?: number; band?: string }>;
    };
    expect(body.rows.find((row) => row.id === "openai")).toMatchObject({
      status: "scored",
      score: 80,
      band: "likely_ai",
    });
    expect(body.rows.filter((row) => row.id !== "openai").every((row) => row.status === "not_configured")).toBe(true);
  });

  it("scores through the GenD service and reports its no-face answer honestly", async () => {
    vi.stubEnv("LAB_GEND_URL", "http://127.0.0.1:8099");
    vi.stubEnv("LAB_GEND_TOKEN", "test-token");
    // The first call scores a face, the second finds none: the fake answers
    // by counting calls, exactly like the real service's two answers.
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response(
          JSON.stringify(
            calls === 1
              ? { model: "GenD_CLIP_L_14@test", detector: "YuNet@2023mar", faces: [{ box: [1, 2, 3, 4], p_fake: 0.912 }], image_p_fake: 0.912, status: "ok", timings_ms: {} }
              : { model: "GenD_CLIP_L_14@test", detector: "YuNet@2023mar", faces: [], image_p_fake: null, status: "no_face", timings_ms: {} },
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const first = await detectorsRoute.POST(panelRequest({ ip: "203.0.113.17" }));
    const bodyOne = (await first.json()) as { rows: Array<{ id: string; status: string; score?: number; band?: string }> };
    expect(bodyOne.rows.find((row) => row.id === "gend")).toMatchObject({
      status: "scored",
      score: 91,
      band: "likely_ai",
    });
    expect(bodyOne.rows.filter((row) => row.id !== "gend").every((row) => row.status === "not_configured")).toBe(true);

    const second = await detectorsRoute.POST(panelRequest({ ip: "203.0.113.18" }));
    const bodyTwo = (await second.json()) as { rows: Array<{ id: string; status: string }> };
    expect(bodyTwo.rows.find((row) => row.id === "gend")).toMatchObject({ status: "no_face" });
  });

  it("caps runs per IP", async () => {
    // Memory rate-limit buckets are shared across the tests in this file, so
    // every request here comes from its own address — only the per-IP rule
    // can refuse the eleventh request from one address.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
    try {
      const ip = "198.51.100.200";
      const statuses: number[] = [];
      for (let i = 0; i <= 10; i += 1) {
        statuses.push((await detectorsRoute.POST(panelRequest({ ip }))).status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a site-wide daily cap that only valid requests spend", async () => {
    // Move time past every earlier window, then set a cap of one: the first
    // valid request runs, the second from a different address is refused by
    // the daily budget alone.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 26 * 60 * 60 * 1000));
    try {
      vi.stubEnv("LAB_DETECTOR_DAILY_LIMIT", "1");
      const first = await detectorsRoute.POST(panelRequest({ ip: "198.51.100.201" }));
      expect(first.status).toBe(200);
      const second = await detectorsRoute.POST(panelRequest({ ip: "198.51.100.202" }));
      expect(second.status).toBe(429);
      expect(await second.json()).toEqual({ error: "rate_limited" });

      // A request that fails validation never spends the budget: the
      // refused one above kept the counter at its cap, and this bad payload
      // is rejected by the consent rule before the daily check.
      const badPayload = await detectorsRoute.POST(panelRequest({ consent: null, ip: "198.51.100.203" }));
      expect(badPayload.status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });
});
