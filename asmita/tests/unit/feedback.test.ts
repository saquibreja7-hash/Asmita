import { afterEach, describe, expect, it } from "vitest";
import { feedbackRecords, recordFeedback, summarizeFeedback } from "@/lib/feedback";

describe("feedback", () => {
  afterEach(() => feedbackRecords.splice(0, feedbackRecords.length));

  it("records and summarizes feedback without raw URL requirements", () => {
    recordFeedback({ rating: 5, comment: "Helpful and clear." });
    recordFeedback({ rating: 3, caseReference: "ASMITA-2026-00001" });

    expect(summarizeFeedback()).toEqual({ count: 2, averageRating: 4 });
  });
});
