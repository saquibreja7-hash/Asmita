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
    // blob: is allowed for MEDIA on every page (WP18: the fingerprint picker
    // reads her video from a same-origin object URL under whatever document
    // the filing flow runs on), but the SCRIPT worklet stays /talk-only.
    expect(directive(home, "script-src")).not.toContain("blob:");
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

  it("allows the same-origin PDQ hashing worker, never a blob worker (WP42)", () => {
    // The hashing worker is a real script file the bundler emits (dev,
    // next build, vinext build), so 'self' covers it on every page; blob:
    // would only be needed for an inline worker, which this is not.
    for (const options of [
      { nonce: "abc123", env: "production" },
      { env: "production" },
      { nonce: "abc123", voice: true, env: "production" },
      { nonce: "abc123", env: "development" },
    ]) {
      const policy = buildCsp(options);
      expect(directive(policy, "worker-src")).toBe("worker-src 'self'");
    }
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

  it("allows blob: media for vPDQ video fingerprinting on every page, scripts never (WP18)", () => {
    // The fingerprint picker runs under whatever document the filing flow is
    // on (soft navigations keep the source document's CSP), so media-src
    // must allow the object URL everywhere; script-src stays closed to blob:.
    for (const pathname of ["/", "/submit", "/case/abc", "/review-sign"]) {
      const { policy } = withPageCsp(new Request(`https://meriasmita.org${pathname}`), pathname);
      expect(directive(policy!, "media-src")).toBe("media-src 'self' blob:");
      expect(directive(policy!, "script-src")).not.toContain("blob:");
    }
    // /talk keeps its worklet exception in script-src (pinned by the test
    // above) and gains the same media-src as every other page.
    const talk = withPageCsp(new Request("https://meriasmita.org/talk"), "/talk");
    expect(directive(talk.policy!, "media-src")).toBe("media-src 'self' blob:");
    // The nonce-less policy (API routes, PDFs, next.config headers) is the same.
    expect(directive(buildCsp({ env: "production" }), "media-src")).toBe("media-src 'self' blob:");
  });

  it("allows the first-party C2PA engine on /check-image only (WP38)", () => {
    // The on-device Content Credentials reader compiles our own /c2pa/c2pa.wasm
    // on the page's main thread, which needs 'wasm-unsafe-eval' — WebAssembly
    // only, never JS eval. Its worker is same-origin in production and an
    // inline blob: worker in plain-http development, so worker-src allows
    // both, on this page only.
    const page = buildCsp({ nonce: "abc123", c2pa: true, env: "production" });
    expect(directive(page, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'wasm-unsafe-eval'");
    expect(directive(page, "worker-src")).toBe("worker-src 'self' blob:");

    const dev = buildCsp({ c2pa: true, env: "development" });
    expect(directive(dev, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive(dev, "worker-src")).toBe("worker-src 'self' blob:");

    // Every other page keeps the untouched policy.
    for (const options of [
      { nonce: "abc123", env: "production" } as const,
      { env: "production" } as const,
      { env: "development" } as const,
    ]) {
      const policy = buildCsp(options);
      expect(policy).not.toContain("wasm-unsafe-eval");
      expect(directive(policy, "worker-src")).toBeUndefined();
    }
  });

  it("withPageCsp gives /check-image and the /c2pa engine assets the reader policy, other pages not", () => {
    for (const pathname of ["/check-image", "/c2pa/c2pa_worker.js", "/c2pa/c2pa.wasm"]) {
      const { policy } = withPageCsp(new Request(`https://meriasmita.org${pathname}`), pathname);
      expect(policy).toContain("'wasm-unsafe-eval'");
      expect(directive(policy!, "worker-src")).toBe("worker-src 'self' blob:");
    }
    for (const pathname of ["/", "/talk", "/submit", "/case/abc"]) {
      const { policy } = withPageCsp(new Request(`https://meriasmita.org${pathname}`), pathname);
      expect(policy).not.toContain("wasm-unsafe-eval");
      expect(directive(policy!, "worker-src")).toBeUndefined();
    }
    // API routes still carry no page policy at all.
    expect(withPageCsp(new Request("https://meriasmita.org/api/csrf"), "/api/csrf").policy).toBeNull();
  });
});
