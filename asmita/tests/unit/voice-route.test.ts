import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as voice } from "@/app/api/voice/[...path]/route";
import { createCsrfPair } from "@/lib/csrf";
import { VOICE_AGENT, VOICE_AGENT_PATH } from "@/lib/helpline";

/*
 * The /api/voice session route with Sarvam mocked: it answers only the pinned
 * agent path, behind CSRF and the same caps as everything else, and hands
 * back only a fresh signed URL from Sarvam. The real Sarvam API is never
 * reached in this file.
 */

let ipCounter = 120;

function voiceRequest(path = VOICE_AGENT_PATH, ip?: string) {
  const csrf = createCsrfPair();
  ipCounter += 1;
  const csrfCookie = `asmita_csrf=${csrf.nonce}`;
  return new Request(`https://asmita.test/api/voice/${path}`, {
    headers: {
      "x-csrf-token": csrf.token,
      "cf-connecting-ip": ip ?? `198.51.100.${ipCounter}`,
      cookie: csrfCookie,
    },
  });
}

function voiceParams(path: string[] = VOICE_AGENT_PATH.split("/")) {
  return { params: Promise.resolve({ path }) };
}

function sarvamSignedUrl(url = "wss://apps.sarvam.ai/session?sig=abc") {
  return new Response(JSON.stringify({ url, reference_id: "ref-123" }), { status: 200 });
}

describe("voice session route", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SARVAM_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers only the pinned agent path", async () => {
    expect((await voice(voiceRequest("wrong/path"), voiceParams(["wrong", "path"]))).status).toBe(404);
    const wrongApp = `orgs/${VOICE_AGENT.orgId}/workspaces/${VOICE_AGENT.workspaceId}/apps/another-app/url`;
    expect((await voice(voiceRequest(wrongApp), voiceParams(wrongApp.split("/")))).status).toBe(404);
  });

  it("refuses a request without a CSRF token", async () => {
    const response = await voice(
      new Request(`https://asmita.test/api/voice/${VOICE_AGENT_PATH}`, { headers: { "cf-connecting-ip": "198.51.100.3" } }),
      voiceParams(),
    );
    expect(response.status).toBe(403);
  });

  it("says the voice line is unavailable when no key is configured", async () => {
    const response = await voice(voiceRequest(), voiceParams());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "voice_unavailable" });
  });

  it("issues a fresh signed URL from Sarvam, once per request, and stores nothing", async () => {
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => sarvamSignedUrl());
    vi.stubGlobal("fetch", fetchMock);

    const first = await voice(voiceRequest(), voiceParams());
    expect(first.status).toBe(200);
    expect((await first.json()) as object).toEqual({ url: "wss://apps.sarvam.ai/session?sig=abc", reference_id: "ref-123" });
    expect(first.headers.get("cache-control")).toBe("no-store");

    const second = await voice(voiceRequest(), voiceParams());
    expect(second.status).toBe(200);
    // Every session start asks Sarvam for its own single-use URL; nothing is reused.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sentHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sentHeaders["X-API-Key"]).toBe("test-key");
  });

  it("refuses a signed URL that is not a Sarvam socket", async () => {
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => sarvamSignedUrl("wss://not-sarvam.example/session")));
    expect((await voice(voiceRequest(), voiceParams())).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("junk", { status: 200 })));
    expect((await voice(voiceRequest(), voiceParams())).status).toBe(502);
  });

  it("stays calm when Sarvam fails", async () => {
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => { throw new Error("down"); }));
    expect((await voice(voiceRequest(), voiceParams())).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("no", { status: 500 })));
    expect((await voice(voiceRequest(), voiceParams())).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("no", { status: 429 })));
    const limited = await voice(voiceRequest(), voiceParams());
    expect(limited.status).toBe(429);
    // The retry-after hint belongs to our own cap, not to Sarvam's.
    expect(limited.headers.get("x-retry-after")).toBeNull();
  });

  it("caps session starts per IP", async () => {
    // Five starts an hour per IP; the sixth from the same address is refused
    // before Sarvam is asked for anything.
    const fetchMock = vi.fn<typeof fetch>(async () => sarvamSignedUrl());
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    const ip = "198.51.100.200";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await voice(voiceRequest(VOICE_AGENT_PATH, ip), voiceParams())).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("caps session starts for the whole site", async () => {
    // Memory rate-limit buckets are shared across the tests in this file, so
    // move time past every window first and give each request its own IP:
    // only the site-wide daily cap can refuse.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
    try {
      vi.stubEnv("VOICE_DAILY_SESSION_LIMIT", "2");
      vi.stubEnv("SARVAM_API_KEY", "test-key");
      vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => sarvamSignedUrl()));
      const statuses = [
        (await voice(voiceRequest(), voiceParams())).status,
        (await voice(voiceRequest(), voiceParams())).status,
        (await voice(voiceRequest(), voiceParams())).status,
      ];
      expect(statuses.slice(0, 2).every((status) => status === 200)).toBe(true);
      expect(statuses[2]).toBe(429);
    } finally {
      vi.useRealTimers();
    }
  });
});
