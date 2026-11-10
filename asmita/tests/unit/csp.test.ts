import { describe, expect, it } from "vitest";
import { buildCsp, createCspNonce, withPageCsp } from "@/lib/csp";

function directive(policy: string, name: string) {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

describe("buildCsp", () => {
  it("allows only the nonce for inline scripts on production pages", () => {
    const policy = buildCsp({ nonce: "abc123", env: "production" });
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'nonce-abc123'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("'strict-dynamic'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("keeps the blob: worklet and Sarvam socket on /talk only", () => {
    const talk = buildCsp({ nonce: "abc123", voice: true, env: "production" });
    expect(directive(talk, "script-src")).toBe("script-src 'self' 'nonce-abc123' blob:");
    expect(directive(talk, "connect-src")).toBe("connect-src 'self' wss://apps.sarvam.ai");
    const home = buildCsp({ nonce: "abc123", env: "production" });
    expect(home).not.toContain("blob:");
    expect(home).not.toContain("sarvam.ai");
  });

  it("leaves the nonce-less policy (API routes, PDFs) as it was", () => {
    const policy = buildCsp({ env: "production" });
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp({ frameAncestors: "'self'", env: "production" }), "frame-ancestors")).toBe(
      "frame-ancestors 'self'",
    );
  });

  it("keeps inline scripts and eval in development and ignores a nonce there", () => {
    const policy = buildCsp({ nonce: "abc123", env: "development" });
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).not.toContain("nonce-");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("always locks down plugins, base URI, form targets and framing", () => {
    for (const env of ["production", "development"]) {
      const policy = buildCsp({ nonce: "abc123", env });
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'self'");
      expect(policy).toContain("form-action 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
    }
  });
});

describe("createCspNonce", () => {
  it("returns a fresh base64 value of 128 bits each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createCspNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});

describe("withPageCsp", () => {
  it("puts the same nonce policy on the forwarded request and the response", () => {
    const { request, policy } = withPageCsp(new Request("https://meriasmita.org/talk"), "/talk");
    expect(policy).toBeTruthy();
    expect(request.headers.get("content-security-policy")).toBe(policy);
    expect(policy).toContain("wss://apps.sarvam.ai");
  });

  it("gives each request its own nonce in production", () => {
    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const a = withPageCsp(new Request("https://meriasmita.org/"), "/").policy;
      const b = withPageCsp(new Request("https://meriasmita.org/"), "/").policy;
      expect(a).toMatch(/'nonce-[^']+'/);
      expect(a?.match(/'nonce-[^']+'/)?.[0]).not.toBe(b?.match(/'nonce-[^']+'/)?.[0]);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  });

  it("never lets the client choose the nonce", () => {
    const incoming = new Request("https://meriasmita.org/api/health", {
      headers: {
        "content-security-policy": "script-src 'nonce-attacker'",
        "content-security-policy-report-only": "script-src 'nonce-attacker'",
      },
    });
    const api = withPageCsp(incoming, "/api/health");
    expect(api.policy).toBeNull();
    expect(api.request.headers.get("content-security-policy")).toBeNull();
    expect(api.request.headers.get("content-security-policy-report-only")).toBeNull();

    const page = withPageCsp(
      new Request("https://meriasmita.org/", { headers: { "content-security-policy": "script-src 'nonce-attacker'" } }),
      "/",
    );
    expect(page.request.headers.get("content-security-policy")).not.toContain("attacker");
  });
});
