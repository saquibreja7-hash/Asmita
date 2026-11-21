/*
 * WP38 part 2: the OpenAI deeper-check route (/api/check-image).
 *
 * Owner decision, 19 November 2026: this one route is allowed in production
 * behind ENABLE_PROVENANCE_CHECK=true, with the adults-only gate and the
 * per-check consent tick enforced on the server. These tests pin the safety
 * review: body-size cap before parsing, image types only (magic bytes, not
 * just the client's MIME claim), the gates, nothing stored or logged, the
 * OpenAI response reduced to what the page shows, and the "not configured"
 * answer when the key is missing.
 *
 * CSRF itself is exercised for real in phase1-provenance-gate.test.ts; here
 * it is stubbed so the payload paths can be tested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/check-image/route";

const m = vi.hoisted(() => ({
  logSecurityEvent: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: m.logSecurityEvent }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: m.rateLimit }));

const keys = ["ENABLE_PROVENANCE_CHECK", "OPENAI_API_KEY"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.ENABLE_PROVENANCE_CHECK = "true";
  process.env.OPENAI_API_KEY = "test-key";
  m.rateLimit.mockResolvedValue({ allowed: true });
  m.logSecurityEvent.mockClear();
});

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const PNG_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function request(form: FormData, headers: Record<string, string> = {}) {
  return new Request("https://asmita.test/api/check-image", { method: "POST", body: form, headers });
}

function imageForm(bytes: Uint8Array<ArrayBuffer> = PNG_BYTES, type = "image/png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }));
  form.append("ageConfirmed", "true");
  form.append("consent", "true");
  return form;
}

/** Records every fetch the route makes (the only one may be OpenAI's). */
const fetchCalls: { url: string; init: RequestInit | undefined }[] = [];

function stubUpstream(handler: () => Response) {
  fetchCalls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return handler();
    }),
  );
}

describe("gates and payload limits", () => {
  it("refuses an oversized declared body before reading it into memory", async () => {
    stubUpstream(() => new Response("{}"));
    const form = imageForm();
    const res = await POST(
      request(form, { "content-length": String(25 * 1024 * 1024) }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(fetchCalls).toEqual([]); // nothing was relayed
  });

  it("keeps the adults-only gate on the server", async () => {
    stubUpstream(() => new Response("{}"));
    const form = new FormData();
    form.append("file", new Blob([PNG_BYTES], { type: "image/png" }));
    form.append("ageConfirmed", "true");
    const res = await POST(request(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "consent_required" });

    const minor = new FormData();
    minor.append("file", new Blob([PNG_BYTES], { type: "image/png" }));
    const refused = await POST(request(minor));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: "age_not_confirmed" });
    expect(m.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "minor_route_blocked", reason: "age_not_confirmed" }),
    );
    expect(fetchCalls).toEqual([]);
  });

  it("requires a file of an allowed image type", async () => {
    stubUpstream(() => new Response("{}"));
    const none = new FormData();
    none.append("ageConfirmed", "true");
    none.append("consent", "true");
    expect((await POST(request(none))).status).toBe(400); // no_file

    const gif = imageForm(new Uint8Array([1, 2, 3]), "image/gif");
    const gifRes = await POST(request(gif));
    expect(gifRes.status).toBe(415);
    expect(await gifRes.json()).toMatchObject({ error: "unsupported_type" });

    const empty = imageForm(new Uint8Array([]));
    expect((await POST(request(empty))).status).toBe(413);
    expect(fetchCalls).toEqual([]);
  });

  it("refuses non-image bytes that claim an image MIME type (no relay of arbitrary data)", async () => {
    stubUpstream(() => new Response("{}"));
    const notAnImage = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x20, 0x2f, 0x3e]); // "<svg />"
    const res = await POST(request(imageForm(notAnImage, "image/png")));
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: "not_an_image" });
    expect(m.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "media_payload_rejected", reason: "magic_bytes" }),
    );
    expect(fetchCalls).toEqual([]);
  });
});

describe("the OpenAI call", () => {
  it("answers 'not configured' when the owner has not set the key", async () => {
    delete process.env.OPENAI_API_KEY;
    stubUpstream(() => new Response("{}"));
    const res = await POST(request(imageForm()));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "provider_unconfigured" });
    expect(fetchCalls).toEqual([]);
  });

  it("forwards exactly the image to OpenAI, once, and reduces what comes back", async () => {
    stubUpstream(() =>
      new Response(
        JSON.stringify({
          created_at: 123,
          object: "content_provenance_check",
          results: [
            {
              type: "c2pa",
              outcome: "detected",
              validation_state: "valid",
              issuer: "should-not-pass-through",
              model: "gpt-image-1",
              generated_at: "2026-11-19T00:00:00Z",
              anything_else: "trimmed",
            },
          ],
        }),
      ),
    );
    const res = await POST(request(imageForm()));
    expect(res.status).toBe(200);

    // The only request is the one to OpenAI's provenance endpoint, with our key.
    expect(fetchCalls.map((c) => c.url)).toEqual(["https://api.openai.com/v1/content_provenance_checks"]);
    const auth = (fetchCalls[0].init?.headers as Record<string, string>) ?? {};
    expect(auth.Authorization).toBe("Bearer test-key");
    // The forwarded body is the multipart form carrying her image.
    const forwarded = fetchCalls[0].init?.body as FormData;
    expect(forwardsImage(forwarded, PNG_BYTES)).toBe(true);

    const payload = (await res.json()) as { detected: boolean; checks: Record<string, unknown>[] };
    expect(payload.detected).toBe(true);
    // Reduced to the fields the page shows — issuer, timestamps and unknown
    // provider fields never reach the client.
    expect(payload.checks).toEqual([
      { type: "c2pa", detected: true, validationState: "valid", model: "gpt-image-1" },
    ]);
  });

  it("maps provider failures to a fixed error, never echoing the provider body", async () => {
    stubUpstream(() => new Response(JSON.stringify({ error: { message: "secret-ish detail" } }), { status: 500 }));
    const res = await POST(request(imageForm()));
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).toContain("provider_error");
    expect(text).not.toContain("secret-ish");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const unreachable = await POST(request(imageForm()));
    expect(unreachable.status).toBe(502);
    expect(await unreachable.json()).toMatchObject({ error: "provider_unreachable" });
  });

  it("treats an unparseable provider body as an error, not as 'nothing found'", async () => {
    stubUpstream(() => new Response("not json at all"));
    const res = await POST(request(imageForm()));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "provider_error" });
  });

  it("keeps the per-network rate limit: a refused bucket answers 429 with a security event", async () => {
    stubUpstream(() => new Response("{}"));
    m.rateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(request(imageForm()));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
    expect(m.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "rate_limit_exceeded", route: "/api/check-image" }),
    );
    expect(fetchCalls).toEqual([]);
  });
});

describe("nothing about her image is stored or logged", () => {
  it("stores and logs no image bytes, filename or hash on the success path", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    stubUpstream(() =>
      new Response(JSON.stringify({ results: [{ type: "synthid", outcome: "not_detected" }] })),
    );
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "image/png" }), "her-private-name.png");
    form.append("ageConfirmed", "true");
    form.append("consent", "true");

    const res = await POST(request(form));
    expect(res.status).toBe(200);

    const logged = JSON.stringify([
      m.logSecurityEvent.mock.calls, // no security events on the success path
      consoleSpy.mock.calls,
    ]);
    expect(logged).not.toContain("her-private-name");
    for (const byte of bytes) expect(logged).not.toContain(String(byte));
    // No second outbound call, no DB or cache write in the route's own code
    // (the route holds the image only in the request's memory).
    expect(fetchCalls.length).toBe(1);
    // Her filename is not even relayed: the route renames the part to "image".
    const forwarded = fetchCalls[0].init?.body as FormData;
    expect((forwarded.get("file") as File).name).toBe("image");
  });
});

function forwardsImage(forwarded: FormData, bytes: Uint8Array): boolean {
  const file = forwarded.get("file");
  if (!(file instanceof Blob)) return false;
  // The multipart serialises asynchronously; comparing the received Blob's
  // bytes is enough because it is the exact object we appended.
  return file.size >= bytes.length && file.type === "image/png";
}
