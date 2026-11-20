import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * csrfFetch mints the double-submit pair (token + asmita_csrf cookie) right
 * before every mutating request, and the server only accepts the request if
 * the two still match (web audit WP53). The mint must be trusted — a 5xx or
 * a tokenless body must never become the literal header "undefined" — and it
 * must not race a second mint in the same tab, because the second mint's
 * Set-Cookie invalidates the first POST's token.
 */

type Recorded = { url: string; headers: Record<string, string> };

let calls: Recorded[];
let queue: Response[];

beforeEach(() => {
  calls = [];
  queue = [];
  vi.resetModules();
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id?: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      calls.push({ url: String(input), headers });
      return queue.shift() ?? new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importCsrfFetch() {
  const { csrfFetch } = await import("@/lib/client-csrf");
  return csrfFetch;
}

describe("csrfFetch", () => {
  it("sends the freshly minted token on the mutating request", async () => {
    const csrfFetch = await importCsrfFetch();
    queue.push(new Response(JSON.stringify({ token: "token-a" }), { status: 200 }));
    queue.push(new Response("{}", { status: 200 }));

    const response = await csrfFetch("/api/example", { method: "POST" });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.url)).toEqual(["/api/csrf", "/api/example"]);
    expect(calls[1].headers["x-csrf-token"]).toBe("token-a");
  });

  it("retries the mint once when /api/csrf answers non-OK, and never sends a garbage token", async () => {
    const csrfFetch = await importCsrfFetch();
    queue.push(new Response("Internal Server Error", { status: 500 }));
    queue.push(new Response(JSON.stringify({ token: "token-b" }), { status: 200 }));
    queue.push(new Response("{}", { status: 200 }));

    const response = await csrfFetch("/api/example", { method: "POST" });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.url)).toEqual(["/api/csrf", "/api/csrf", "/api/example"]);
    expect(calls[2].headers["x-csrf-token"]).toBe("token-b");
    expect(Object.values(calls[2].headers).join(" ")).not.toContain("undefined");
  });

  it("treats a 200 body without a token as a failed mint, not as a token", async () => {
    const csrfFetch = await importCsrfFetch();
    queue.push(new Response(JSON.stringify({ error: "csrf_failed" }), { status: 200 }));
    queue.push(new Response("Not Found", { status: 404 }));

    await expect(csrfFetch("/api/example", { method: "POST" })).rejects.toThrow(/csrf_mint/);

    // Nothing reached the mutating route: a refused mint must not send a
    // request the server would answer with a misleading 403.
    expect(calls.map((call) => call.url)).toEqual(["/api/csrf", "/api/csrf"]);
  });

  it("sends nothing after two failed mints", async () => {
    const csrfFetch = await importCsrfFetch();
    queue.push(new Response("unavailable", { status: 503 }));
    queue.push(new Response("unavailable", { status: 503 }));

    await expect(csrfFetch("/api/example", { method: "POST" })).rejects.toThrow(/csrf_mint_http_503/);

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.url === "/api/csrf")).toBe(true);
  });

  it("mints one token at a time per tab: the second mint waits for the first POST to leave", async () => {
    const csrfFetch = await importCsrfFetch();
    // Both requests start together. With the queue the call order is
    // mint, POST A, mint, POST B; without it both mints run first, and
    // POST A can leave carrying a token the cookie no longer matches.
    queue.push(new Response(JSON.stringify({ token: "token-1" }), { status: 200 }));
    queue.push(new Response("{}", { status: 200 }));
    queue.push(new Response(JSON.stringify({ token: "token-2" }), { status: 200 }));
    queue.push(new Response("{}", { status: 200 }));

    const [first, second] = await Promise.all([
      csrfFetch("/api/a", { method: "POST" }),
      csrfFetch("/api/b", { method: "POST" }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls.map((call) => call.url)).toEqual(["/api/csrf", "/api/a", "/api/csrf", "/api/b"]);
    expect(calls[1].headers["x-csrf-token"]).toBe("token-1");
    expect(calls[3].headers["x-csrf-token"]).toBe("token-2");
  });

  it("keeps the mint queue usable after a failed mint", async () => {
    const csrfFetch = await importCsrfFetch();
    queue.push(new Response("no", { status: 500 }));
    queue.push(new Response("no", { status: 500 }));
    await expect(csrfFetch("/api/a", { method: "POST" })).rejects.toThrow(/csrf_mint/);

    queue.push(new Response(JSON.stringify({ token: "token-c" }), { status: 200 }));
    queue.push(new Response("{}", { status: 200 }));
    const response = await csrfFetch("/api/b", { method: "POST" });
    expect(response.status).toBe(200);
    expect(calls[calls.length - 1].headers["x-csrf-token"]).toBe("token-c");
  });
});
