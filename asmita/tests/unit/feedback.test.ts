import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MEMORY_FEEDBACK, feedbackRecords, recordFeedback, summarizeFeedback } from "@/lib/feedback";
import { POST as postFeedback } from "@/app/api/feedback/route";
import { createCsrfPair } from "@/lib/csrf";

describe("feedback", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    feedbackRecords.splice(0, feedbackRecords.length);
  });

  it("records and summarizes feedback without raw URL requirements", async () => {
    await recordFeedback({ rating: 5, comment: "Helpful and clear." });
    await recordFeedback({ rating: 3, caseReference: "ASMITA-2026-00001" });

    expect(summarizeFeedback()).toEqual({ count: 2, averageRating: 4 });
  });

  it("rejects a pasted synthetic post URL before feedback storage", async () => {
    const csrf = createCsrfPair();
    const response = await postFeedback(new Request("https://asmita.test/api/feedback", {
      method: "POST",
      headers: {
        cookie: `asmita_csrf=${csrf.nonce}`,
        "x-csrf-token": csrf.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ rating: 3, comment: "The form failed for https://example.invalid/post/demo" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "links_not_allowed" });
    expect(feedbackRecords).toHaveLength(0);
    await expect(recordFeedback({ rating: 3, comment: "www.example.invalid/post/demo" })).rejects.toThrow("feedback_url_not_allowed");
  });
});

describe("feedback endpoint protection", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    feedbackRecords.splice(0, feedbackRecords.length);
  });

  function req(body: string, ip: string) {
    const csrf = createCsrfPair();
    return new Request("https://asmita.test/api/feedback", {
      method: "POST",
      headers: {
        cookie: `asmita_csrf=${csrf.nonce}`,
        "x-csrf-token": csrf.token,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      body,
    });
  }

  it("answers 400, not 500, to a malformed body", async () => {
    const response = await postFeedback(req("{not json", "198.51.100.10"));
    expect(response.status).toBe(400);
    expect(feedbackRecords).toHaveLength(0);
  });

  it("rejects an over-long comment", async () => {
    const response = await postFeedback(req(JSON.stringify({ rating: 4, comment: "a".repeat(1001) }), "198.51.100.11"));
    expect(response.status).toBe(400);
  });

  it("rate limits per network", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await postFeedback(req(JSON.stringify({ rating: 4 }), "198.51.100.12"))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toContain(429);
  });

  it("keeps the in-memory list bounded", async () => {
    for (let i = 0; i < MAX_MEMORY_FEEDBACK + 10; i += 1) await recordFeedback({ rating: 3 });
    expect(feedbackRecords).toHaveLength(MAX_MEMORY_FEEDBACK);
  });
});
