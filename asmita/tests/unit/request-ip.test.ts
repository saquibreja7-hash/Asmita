import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp, MISSING_CLIENT_IP } from "@/lib/request-ip";

describe("getClientIp outside production", () => {
  it("prefers the first x-forwarded-for address", () => {
    const request = new Request("https://asmita.test", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("falls back without exposing unknown network details", () => {
    expect(getClientIp(new Request("https://asmita.test"))).toBe("unknown");
  });
});

describe("getClientIp in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses cf-connecting-ip and ignores a spoofed x-forwarded-for or x-real-ip", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = (forwarded: string) =>
      new Request("https://asmita.test", {
        headers: {
          "cf-connecting-ip": "198.51.100.7",
          "x-forwarded-for": forwarded,
          "x-real-ip": forwarded,
        },
      });

    expect(getClientIp(request("203.0.113.1"))).toBe("198.51.100.7");
    expect(getClientIp(request("203.0.113.2"))).toBe("198.51.100.7");
  });

  it("uses one fixed bucket when cf-connecting-ip is missing, whatever else is sent", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spoofed = (ip: string) =>
      new Request("https://asmita.test", { headers: { "x-forwarded-for": ip, "x-real-ip": ip } });

    expect(getClientIp(spoofed("203.0.113.1"))).toBe(MISSING_CLIENT_IP);
    expect(getClientIp(spoofed("203.0.113.2"))).toBe(MISSING_CLIENT_IP);
  });
});
