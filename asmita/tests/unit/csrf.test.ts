import { describe, expect, it } from "vitest";
import { createCsrfPair, verifyCsrfRequest } from "@/lib/csrf";

describe("csrf", () => {
  it("accepts a matching double-submit token", () => {
    const pair = createCsrfPair();
    const request = new Request("https://asmita.test/api", {
      method: "POST",
      headers: {
        cookie: `asmita_csrf=${pair.nonce}`,
        "x-csrf-token": pair.token,
      },
    });
    expect(verifyCsrfRequest(request)).toBe(true);
  });

  it("rejects a missing token", () => {
    const request = new Request("https://asmita.test/api", { method: "POST" });
    expect(verifyCsrfRequest(request)).toBe(false);
  });
});
