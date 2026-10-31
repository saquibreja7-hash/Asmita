import { afterEach, describe, expect, it } from "vitest";
import { feedbackRecords, recordFeedback, summarizeFeedback } from "@/lib/feedback";
import { POST as postFeedback } from "@/app/api/feedback/route";
import { createCsrfPair } from "@/lib/csrf";

describe("feedback", () => {
  afterEach(() => feedbackRecords.splice(0, feedbackRecords.length));

  it("records and summarizes feedback without raw URL requirements", () => {
    recordFeedback({ rating: 5, comment: "Helpful and clear." });
    recordFeedback({ rating: 3, caseReference: "ASMITA-2026-00001" });

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
    expect(() => recordFeedback({ rating: 3, comment: "www.example.invalid/post/demo" })).toThrow("feedback_url_not_allowed");
  });
});
