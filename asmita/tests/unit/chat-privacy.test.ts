import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chat } from "@/app/api/chat/route";
import { GET as voice } from "@/app/api/voice/[...path]/route";
import { createCsrfPair } from "@/lib/csrf";
import { VOICE_AGENT_PATH } from "@/lib/helpline";
import { securityEvents } from "@/lib/security-log";

/*
 * Nothing she types may reach a log or an audit record. The chat and voice
 * routes log only fixed event names and reasons, and the only place her
 * words go is the fetch to Sarvam. These tests watch every console method
 * and the in-memory security log while the routes run, with a marker string
 * planted in the conversation text, and assert the marker never appears
 * anywhere except inside the outbound Sarvam request.
 */

const MARKER = "ZZPHRASE7q2";

let ipCounter = 60;

function request(path: string, body?: unknown) {
  const csrf = createCsrfPair();
  ipCounter += 1;
  const csrfCookie = `asmita_csrf=${csrf.nonce}`;
  const headers: Record<string, string> = {
    "x-csrf-token": csrf.token,
    "cf-connecting-ip": `198.51.100.${ipCounter}`,
    cookie: csrfCookie,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    return new Request(`https://asmita.test${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  }
  return new Request(`https://asmita.test${path}`, { headers });
}

function voiceParams() {
  return { params: Promise.resolve({ path: VOICE_AGENT_PATH.split("/") }) };
}

describe("chat and voice routes never log conversation text", () => {
  let logs: unknown[][];

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SARVAM_CHAT_KEY", "");
    logs = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => logs.push(args));
    }
    securityEvents.splice(0, securityEvents.length);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function everyLoggedText() {
    return logs.map((args) => args.map((arg) => String(arg)).join(" ")).concat(securityEvents.map((entry) => JSON.stringify(entry)));
  }

  it("keeps a chat message out of every log when the chat is unavailable", async () => {
    const response = await chat(request("/api/chat", { locale: "en", messages: [{ role: "user", content: `my story ${MARKER} ends here` }] }));
    expect(response.status).toBe(503);
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
  });

  it("keeps a chat message out of every log when Sarvam itself fails", async () => {
    vi.stubEnv("SARVAM_CHAT_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("socket closed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await chat(request("/api/chat", { locale: "en", messages: [{ role: "user", content: `please help ${MARKER}` }] }));
    expect(response.status).toBe(502);
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
    // Her words went to exactly one place: the outbound Sarvam request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain(MARKER);
  });

  it("keeps a malformed chat body out of every log", async () => {
    const response = await chat(request("/api/chat", `{broken ${MARKER}`));
    expect(response.status).toBe(400);
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
  });

  it("keeps a rejected image payload out of every log", async () => {
    const response = await chat(
      request("/api/chat", { locale: "en", messages: [{ role: "user", content: `data:image/png;base64,${"A".repeat(300)} ${MARKER}` }] }),
    );
    expect(response.status).toBe(400);
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
    expect(securityEvents.some((entry) => entry.event === "media_payload_rejected")).toBe(true);
  });

  it("records only fixed reasons when rate limits hit", async () => {
    // Same IP five times: the sixth request hits the per-IP voice limit.
    const csrf = createCsrfPair();
    const csrfCookie = `asmita_csrf=${csrf.nonce}`;
    const headers = { "x-csrf-token": csrf.token, "cf-connecting-ip": "198.51.100.90", cookie: csrfCookie };
    let lastStatus = 0;
    for (let i = 0; i < 6; i += 1) {
      const response = await voice(new Request(`https://asmita.test/api/voice/${VOICE_AGENT_PATH}`, { headers }), voiceParams());
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
    expect(securityEvents.some((entry) => entry.event === "rate_limit_exceeded")).toBe(true);
    // No event field carries anything she or the caller wrote.
    for (const entry of securityEvents) {
      const text = JSON.stringify(entry);
      expect(text.includes(MARKER)).toBe(false);
      expect(entry.route).toBe("/api/voice");
    }
  });

  it("keeps the signed voice URL out of every log", async () => {
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    const signedUrl = `wss://apps.sarvam.ai/session?token=${MARKER}`;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("upstream reset");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await voice(request(`/api/voice/${VOICE_AGENT_PATH}`), voiceParams());
    expect(response.status).toBe(502);
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain(VOICE_AGENT_PATH);
    expect(String(fetchMock.mock.calls[0][0]).includes(MARKER)).toBe(false);

    // A successful issuance hands the URL to her browser and nowhere else.
    const ok = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ url: signedUrl, reference_id: "ref-xyz" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", ok);
    const issued = await voice(request(`/api/voice/${VOICE_AGENT_PATH}`), voiceParams());
    expect(issued.status).toBe(200);
    expect(((await issued.json()) as { url: string }).url).toBe(signedUrl);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    logs.length = 0;
    expect(everyLoggedText().some((text) => text.includes(MARKER))).toBe(false);
  });
});
