import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-equal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-equal")>();
  return { ...actual, safeEqual: vi.fn(actual.safeEqual) };
});

import { NextResponse } from "next/server";
import { attachCsrfCookie, createCsrfPair, verifyCsrfRequest } from "@/lib/csrf";
import { safeEqual } from "@/lib/safe-equal";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(safeEqual).mockClear();
});

function csrfRequest(cookieName: string, tokenOverride?: string) {
  const pair = createCsrfPair();
  const request = new Request("https://asmita.test/api", {
    method: "POST",
    headers: { cookie: `${cookieName}=${pair.nonce}`, "x-csrf-token": tokenOverride ?? pair.token },
  });
  return { pair, request };
}

describe("csrf", () => {
  it("accepts a matching double-submit token", () => {
    const pair = createCsrfPair();
    const request = new Request("https://asmita.test/api", {
      method: "POST",
      headers: {
        cookie: `${COOKIE_BASE_NAMES.csrf}=${pair.nonce}`,
        "x-csrf-token": pair.token,
      },
    });
    expect(verifyCsrfRequest(request)).toBe(true);
  });

  it("rejects a missing token", () => {
    const request = new Request("https://asmita.test/api", { method: "POST" });
    expect(verifyCsrfRequest(request)).toBe(false);
  });

  it("rejects a token that does not match the nonce", () => {
    const pair = createCsrfPair();
    // Same length as the real token, different content.
    const wrongToken = pair.token.slice(0, -1) + (pair.token.endsWith("0") ? "1" : "0");
    const request = new Request("https://asmita.test/api", {
      method: "POST",
      headers: { cookie: `${COOKIE_BASE_NAMES.csrf}=${pair.nonce}`, "x-csrf-token": wrongToken },
    });
    expect(verifyCsrfRequest(request)).toBe(false);
  });

  it("compares the submitted token with the constant-time helper", () => {
    const { pair, request } = csrfRequest(COOKIE_BASE_NAMES.csrf);
    expect(verifyCsrfRequest(request)).toBe(true);
    expect(safeEqual).toHaveBeenCalledTimes(1);
    expect(safeEqual).toHaveBeenCalledWith(pair.token, pair.token);
  });

  it("does not reach the comparison without a token", () => {
    const { request } = csrfRequest(COOKIE_BASE_NAMES.csrf);
    request.headers.delete("x-csrf-token");
    expect(verifyCsrfRequest(request)).toBe(false);
    expect(safeEqual).not.toHaveBeenCalled();
  });
});

describe("csrf cookie names", () => {
  it("sets and reads the plain name outside production", () => {
    const pair = createCsrfPair();
    const response = attachCsrfCookie(NextResponse.json({}), pair.nonce);
    const setCookie = response.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("asmita_csrf=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Secure");
    expect(verifyCsrfRequest(csrfRequest("asmita_csrf").request)).toBe(true);
  });

  it("sets and reads the __Host- name in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CSRF_SECRET", "synthetic-csrf-secret-0123456789abcdef");
    const pair = createCsrfPair();
    const response = attachCsrfCookie(NextResponse.json({}), pair.nonce);
    const setCookie = response.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("__Host-asmita_csrf=");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Path=/");
    expect(verifyCsrfRequest(csrfRequest("__Host-asmita_csrf").request)).toBe(true);
  });

  it("accepts the pre-__Host- name as well, for one release", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CSRF_SECRET", "synthetic-csrf-secret-0123456789abcdef");
    expect(verifyCsrfRequest(csrfRequest("asmita_csrf").request)).toBe(true);
  });

  it("prefers the __Host- cookie when both names are present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CSRF_SECRET", "synthetic-csrf-secret-0123456789abcdef");
    const pair = createCsrfPair();
    const stale = createCsrfPair();
    const request = new Request("https://asmita.test/api", {
      method: "POST",
      headers: {
        // The stale nonce under the legacy name must not win.
        cookie: `asmita_csrf=${stale.nonce}; __Host-asmita_csrf=${pair.nonce}`,
        "x-csrf-token": pair.token,
      },
    });
    expect(verifyCsrfRequest(request)).toBe(true);
  });
});
