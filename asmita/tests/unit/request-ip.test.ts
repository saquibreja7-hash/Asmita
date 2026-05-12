import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/request-ip";

describe("getClientIp", () => {
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
