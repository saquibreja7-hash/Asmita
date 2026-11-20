import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/check-image/route";
import { createCsrfPair } from "@/lib/csrf";

const keys = ["ENABLE_PROVENANCE_CHECK", "CSRF_SECRET"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("server-side provenance feature flag", () => {
  it("rejects requests when the provenance check is disabled", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "false";

    const response = await POST(new Request("https://asmita.test/api/check-image", {
      method: "POST",
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });

  it("enforces CSRF when the provenance check is enabled", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "true";
    const response = await POST(new Request("https://asmita.test/api/check-image", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "csrf_failed" });
  });

  it("accepts the CSRF pair and moves on to the server-side gates", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "true";
    const { nonce, token } = createCsrfPair();
    const response = await POST(
      new Request("https://asmita.test/api/check-image", {
        method: "POST",
        headers: { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
        body: new FormData(),
      }),
    );
    // Past the flag, past CSRF: the adults-only gate is what refuses next.
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "age_not_confirmed" });
  });

  // WP38, owner decision 19 November 2026: production follows
  // ENABLE_PROVENANCE_CHECK for this one route (ADR 002 "Decision recorded");
  // the old NODE_ENV=production force-off is gone.
  it("no longer force-disables the check in production: with the flag on, a production request passes the flag gate", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "true";
    process.env.CSRF_SECRET = "x".repeat(32);
    const previousEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const response = await POST(new Request("https://asmita.test/api/check-image", { method: "POST" }));
      // Not the 404 the old force-off produced: the request reaches the
      // CSRF gate like any enabled route.
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "csrf_failed" });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousEnv;
    }
  });

  it("still refuses production requests when the flag is off", async () => {
    delete process.env.ENABLE_PROVENANCE_CHECK;
    process.env.CSRF_SECRET = "x".repeat(32);
    const previousEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const response = await POST(new Request("https://asmita.test/api/check-image", { method: "POST" }));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: "not_found" });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousEnv;
    }
  });
});
