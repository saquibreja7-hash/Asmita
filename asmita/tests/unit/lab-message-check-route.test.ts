import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/lab/message-check route (WP93, docs/lab/beta-spec.md): the gate,
// CSRF, the body cap, Zod payloads, both rate limits, the minor pathway
// from code, the pattern results with and without the Sarvam key — and the
// WP's own rules: no link in the pasted text is ever fetched, and nothing in
// the message is stored or logged. All test text is invented; the Sarvam API
// is never reached (fetch is stubbed everywhere a key is set, and nothing
// without the stub can reach the network either).

import { POST as check } from "@/app/api/lab/message-check/route";
import { createCsrfPair } from "@/lib/csrf";
import { securityEvents } from "@/lib/security-log";
import { countsAsFinding, detectedElements } from "@/lib/lab/message-check/elements";

let ipCounter = 10;

function checkRequest(body: unknown, options: { csrf?: boolean; ip?: string } = {}) {
  const csrf = createCsrfPair();
  ipCounter += 1;
  return new Request("https://asmita.test/api/lab/message-check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.csrf === false ? {} : { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token }),
      "cf-connecting-ip": options.ip ?? `198.51.100.${ipCounter}`,
    },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

function sarvamReply(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

// Invented everyday messages the committed model labels on its own (also in
// tools/lab-sextortion/eval/negatives.jsonl, family shortChat).
const SHORT_HARMLESS = [
  "hi",
  "hi there",
  "good morning",
  "Abhi aata hoon",
  "Hi! Are we still on for lunch tomorrow?",
  "ok",
  "hii",
  "Delhi",
  "Please call me back",
];

const THREAT =
  "I have your nudes. Send 50000 rupees in bitcoin within 24 hours or I send everything to your family. The proof is at https://proof.example.test/x";

describe("/api/lab/message-check", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ENABLE_LAB", "true");
    vi.stubEnv("SARVAM_CHAT_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    securityEvents.splice(0, securityEvents.length);
  });

  it("answers 503 lab_disabled while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const response = await check(checkRequest({ text: "hello" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "lab_disabled" });
  });

  it("refuses a request without a CSRF token", async () => {
    const response = await check(checkRequest({ text: "hello" }, { csrf: false }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "csrf_failed" });
  });

  it("refuses oversized bodies before parsing them", async () => {
    const csrfPair = createCsrfPair();
    const declared = new Request("https://asmita.test/api/lab/message-check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2097152",
        cookie: `asmita_csrf=${csrfPair.nonce}`,
        "x-csrf-token": csrfPair.token,
      },
      body: "{}",
    });
    expect((await check(declared)).status).toBe(413);

    const csrf = createCsrfPair();
    const oversized = new Request("https://asmita.test/api/lab/message-check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `asmita_csrf=${csrf.nonce}`,
        "x-csrf-token": csrf.token,
      },
      body: "x".repeat(20 * 1024),
    });
    const response = await check(oversized);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
  });

  it("validates the payload strictly", async () => {
    expect((await check(checkRequest("{not json"))).status).toBe(400);
    expect((await check(checkRequest({ text: "" }))).status).toBe(400);
    expect((await check(checkRequest({ text: "hello", extra: true }))).status).toBe(400);
    expect((await check(checkRequest({ text: "hello", locale: "fr" }))).status).toBe(400);
    expect((await check(checkRequest({ text: "a".repeat(4001) }))).status).toBe(400);
    // 4,000 characters, the WP's cap, still pass.
    expect((await check(checkRequest({ text: "a".repeat(4000) }))).status).toBe(200);
  });

  it("returns the code results without a key, and never fetches anything", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await check(checkRequest({ text: THREAT }));
    expect(response.status).toBe(200);
    const { matches, summary } = (await response.json()) as { matches: string[]; summary: string | null };
    expect(matches).toContain("paymentDemand");
    expect(matches).toContain("intimateClaim");
    expect(matches).toContain("threatContacts");
    expect(matches).toContain("deadline");
    expect(matches).toContain("cryptoGiftCard");
    expect(summary).toBeNull();
    // A message full of links: not one fetch happened, not even with no key.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs the classifier too: labels, the flag, and stage-chosen advice, never a score", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await check(checkRequest({ text: THREAT }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matches: string[];
      labels: string[];
      flagged: boolean;
      advice: string[];
      summary: string | null;
    };
    // The classifier saw the demand and the clock (WP117 labels).
    expect(body.labels).toContain("DEMAND_MONEY");
    expect(body.labels).toContain("DEADLINE");
    expect(body.flagged).toBe(true);
    // Stage-chosen advice: non-blaming first, reporting last things include.
    expect(body.advice[0]).toBe("notYourFault");
    expect(body.advice).toContain("report");
    // No score, probability or percentage ever leaves the isolate.
    expect(Object.keys(body).sort()).toEqual(["advice", "flagged", "labels", "matches", "summary"]);
    expect(JSON.stringify(body)).not.toMatch(/score|percent|probability/i);
  });

  it("answers a harmless message with no flag, no labels and no advice", async () => {
    const response = await check(checkRequest({ text: "shaadi ki video bhej do na, dekhne ka mann hai." }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matches: string[];
      labels: string[];
      flagged: boolean;
      advice: string[];
    };
    expect(body.flagged).toBe(false);
    expect(body.labels).toEqual([]);
    expect(body.advice).toEqual([]);
    expect(body.matches).toEqual([]);
  });

  // PR #114 review: on short everyday text a single classifier label can
  // cross its threshold with nothing behind it (DEADLINE on "hi", VICTIM_PLEA
  // on "ok"). None of these may show a label, advice or the warning headline.
  it.each(SHORT_HARMLESS)("answers the short harmless message %j with no finding at all", async (text) => {
    const response = await check(checkRequest({ text }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matches: string[];
      labels: string[];
      flagged: boolean;
      advice: string[];
      minor?: boolean;
    };
    expect(body.minor).toBeUndefined();
    expect(body.flagged).toBe(false);
    expect(body.labels).toEqual([]);
    expect(body.advice).toEqual([]);
    expect(body.matches).toEqual([]);
    // What the page would show: no element sentence, so no warning headline.
    const elements = detectedElements(body.matches as never[], body.labels as never[]);
    expect(countsAsFinding(elements, body.flagged)).toBe(false);
  });

  it("routes a stated age under 18 to the minor pathway before anything runs", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SARVAM_CHAT_KEY", "test-key");
    const response = await check(checkRequest({ text: "I am 15 and he is threatening me with my photos" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { minor: boolean; redirectTo: string; matches?: unknown; summary?: unknown };
    expect(body).toEqual({ minor: true, redirectTo: "/minor-support" });
    // The tool did not run: no analysis, no model call, no link fetched.
    expect(body.matches).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("also routes when only the classifier's MINOR_SIGNAL fires (the rule set alone would miss it)", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SARVAM_CHAT_KEY", "test-key");
    // A school statement the WP93 minor rules do not match ("class 10 ki"
    // is not one of their patterns) but the classifier labels MINOR_SIGNAL.
    const text = "main class 10 ki student hoon";
    expect((await import("@/lib/lab/message-check/patterns")).routeToMinorSupport(text)).toBe(false);
    const response = await check(checkRequest({ text }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { minor: boolean; redirectTo: string };
    expect(body).toEqual({ minor: true, redirectTo: "/minor-support" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores and logs nothing about the message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sentinel = "sentinel-mango-tree-93";
    const response = await check(checkRequest({ text: `I have your photos, ${sentinel}, pay now` }));
    expect(response.status).toBe(200);
    const responseBody = await response.text();
    expect(responseBody).not.toContain(sentinel);
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(logged).not.toContain(sentinel);
    expect(JSON.stringify(securityEvents)).not.toContain(sentinel);
  });

  describe("with the model mocked", () => {
    beforeEach(() => {
      vi.stubEnv("SARVAM_CHAT_KEY", "test-key");
    });

    it("makes exactly one Sarvam call, to the chat API only — links in the text are never fetched", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => sarvamReply("This message tries to frighten you into paying."));
      vi.stubGlobal("fetch", fetchMock);
      const response = await check(checkRequest({ text: THREAT }));
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://api.sarvam.ai/v1/chat/completions");
      expect((init as RequestInit).headers).toMatchObject({ "api-subscription-key": "test-key" });
      const sent = JSON.parse((init as RequestInit).body as string) as { messages: { role: string; content: string }[] };
      // Two system prompts, then the pasted message as data, nothing else.
      expect(sent.messages.map((message) => message.role)).toEqual(["system", "system", "user"]);
      expect(sent.messages[2].content).toBe(THREAT);
    });

    it("returns a scrubbed summary and the pattern results together", async () => {
      const reply = "He is pressuring you to pay. Report at https://pay.example.test or call 9876543210.";
      const fetchMock = vi.fn<typeof fetch>(async () => sarvamReply(reply));
      vi.stubGlobal("fetch", fetchMock);
      const response = await check(checkRequest({ text: THREAT, locale: "en" }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { matches: string[]; summary: string };
      expect(body.matches.length).toBeGreaterThan(0);
      // The output guard keeps only links and numbers the site itself publishes.
      expect(body.summary).not.toContain("pay.example.test");
      expect(body.summary).not.toContain("9876543210");
      expect(body.summary).toContain("pressuring");
    });

    it("answers with the code results alone when the model fails", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response("no", { status: 500 }));
      vi.stubGlobal("fetch", fetchMock);
      const response = await check(checkRequest({ text: THREAT }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { matches: string[]; summary: string | null };
      expect(body.matches).toContain("paymentDemand");
      expect(body.summary).toBeNull();
    });
  });

  it("caps checks per IP", async () => {
    const ip = "198.51.100.201";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await check(checkRequest({ text: "hello there" }, { ip }))).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("enforces the site-wide daily cap from LAB_MESSAGE_CHECK_DAILY_LIMIT", async () => {
    // Memory rate-limit buckets are shared across the tests in this file, so
    // move time past every window first and give each request its own IP:
    // only the site-wide daily cap can refuse.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
    try {
      vi.stubEnv("LAB_MESSAGE_CHECK_DAILY_LIMIT", "2");
      const statuses = [
        (await check(checkRequest({ text: "one" }))).status,
        (await check(checkRequest({ text: "two" }))).status,
        (await check(checkRequest({ text: "three" }))).status,
      ];
      expect(statuses.slice(0, 2).every((status) => status === 200)).toBe(true);
      expect(statuses[2]).toBe(429);
    } finally {
      vi.useRealTimers();
    }
  });
});
