import { describe, expect, it, vi } from "vitest";
import {
  buildPlatformApiPayload,
  platformApiEnabled,
  platformApiTimeoutMs,
  sendNoticeToPlatformApi,
  type PlatformApiPayload,
} from "@/lib/platform-api";

const payload: PlatformApiPayload = buildPlatformApiPayload({
  kind: "URL_NOTICE",
  caseReference: "ASMITA-2026-00001",
  noticeBasis: "IT_RULES_2021",
  subject: "NCII takedown request ASMITA-2026-00001",
  body: "Notice body. [Reported URL is in the attached signed notice]",
  fingerprints: [{ algorithm: "PDQ", digest: "a".repeat(64), quality: 90 }],
  signedNoticePdf: Buffer.from("fake-pdf-bytes"),
  idempotencyKey: "idem-key-1",
  now: new Date("2026-11-12T00:00:00.000Z"),
});

describe("buildPlatformApiPayload", () => {
  it("builds a versioned payload carrying the same notice text the email would send", () => {
    expect(payload.schemaVersion).toBe(1);
    expect(payload.kind).toBe("URL_NOTICE");
    expect(payload.caseReference).toBe("ASMITA-2026-00001");
    expect(payload.subject).toContain("ASMITA-2026-00001");
    expect(payload.body).toContain("[Reported URL is in the attached signed notice]");
    expect(payload.idempotencyKey).toBe("idem-key-1");
    expect(payload.sentAt).toBe("2026-11-12T00:00:00.000Z");
  });

  it("carries the real PDQ digests and the signed PDF, never a reported URL", () => {
    expect(payload.fingerprints).toEqual([{ algorithm: "PDQ", digest: "a".repeat(64), quality: 90 }]);
    expect(payload.signedNoticePdfBase64).toBe(Buffer.from("fake-pdf-bytes").toString("base64"));
    expect(JSON.stringify(payload)).not.toContain("http://reported.example");
    expect(JSON.stringify(payload)).not.toContain("https://reported.example");
  });

  it("omits the PDF field when there is none", () => {
    const withoutPdf = buildPlatformApiPayload({
      kind: "HASH_ADVISORY",
      caseReference: "ASMITA-2026-00002",
      noticeBasis: "IT_RULES_2021",
      subject: "s",
      body: "b",
      fingerprints: [],
      idempotencyKey: "idem-key-2",
    });
    expect(withoutPdf.signedNoticePdfBase64).toBeUndefined();
  });
});

describe("platformApiEnabled / platformApiTimeoutMs", () => {
  it("is off unless the env switch is exactly true", () => {
    expect(platformApiEnabled()).toBe(false);
    process.env.ENABLE_PLATFORM_API = "true";
    expect(platformApiEnabled()).toBe(true);
    delete process.env.ENABLE_PLATFORM_API;
  });

  it("clamps the timeout to a sane range", () => {
    expect(platformApiTimeoutMs()).toBe(10_000);
    process.env.TIER1_API_TIMEOUT_MS = "10";
    expect(platformApiTimeoutMs()).toBe(10_000);
    process.env.TIER1_API_TIMEOUT_MS = "2500";
    expect(platformApiTimeoutMs()).toBe(2_500);
    delete process.env.TIER1_API_TIMEOUT_MS;
  });
});

describe("sendNoticeToPlatformApi", () => {
  const input = {
    endpoint: "https://api.partner.example/removals",
    accessToken: "partner-token",
    payload,
  };

  it("posts the payload with bearer auth and the idempotency key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ referenceId: "ref-9" }), { status: 201 }));
    const result = await sendNoticeToPlatformApi({ ...input, fetchImpl: fetchImpl as never });

    expect(result).toEqual({ ok: true, status: 201, referenceId: "ref-9" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.partner.example/removals",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer partner-token",
          "content-type": "application/json",
          "idempotency-key": "idem-key-1",
        }),
      }),
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ schemaVersion: 1, kind: "URL_NOTICE" });
  });

  it("accepts a 2xx without a JSON body", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await sendNoticeToPlatformApi({ ...input, fetchImpl: fetchImpl as never });
    expect(result).toEqual({ ok: true, status: 204, referenceId: undefined });
  });

  it("resolves (never throws) on a non-2xx platform response", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 503 }));
    const result = await sendNoticeToPlatformApi({ ...input, fetchImpl: fetchImpl as never });
    expect(result).toEqual({ ok: false, status: 503 });
  });

  it("resolves on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const result = await sendNoticeToPlatformApi({ ...input, fetchImpl: fetchImpl as never });
    expect(result).toEqual({ ok: false, status: "network_error", error: "ECONNRESET" });
  });

  it("resolves on timeout", async () => {
    const fetchImpl = vi.fn(
      (_endpoint: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const result = await sendNoticeToPlatformApi({
      ...input,
      timeoutMs: 20,
      fetchImpl: fetchImpl as never,
    });
    expect(result).toEqual({ ok: false, status: "timeout" });
  });
});
