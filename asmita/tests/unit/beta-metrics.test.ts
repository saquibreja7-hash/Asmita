import { describe, expect, it } from "vitest";
import { calculateBetaMetrics } from "@/lib/beta-metrics";

describe("calculateBetaMetrics", () => {
  it("tracks beta launch KPIs without URL strings or victim PII", () => {
    const metrics = calculateBetaMetrics({
      cases: [
        { caseId: "case-1", registeredAt: "2026-05-12T00:00:00.000Z" },
        { caseId: "case-2", registeredAt: "2026-05-12T01:00:00.000Z" },
      ],
      notices: [
        {
          caseId: "case-1",
          noticeSentAt: "2026-05-12T02:00:00.000Z",
          deliveredAt: "2026-05-12T02:01:00.000Z",
          acknowledgedAt: "2026-05-12T03:00:00.000Z",
          removedAt: "2026-05-13T02:00:00.000Z",
        },
        {
          caseId: "case-2",
          noticeSentAt: "2026-05-12T05:00:00.000Z",
          legalPackageRequestedAt: "2026-05-19T05:00:00.000Z",
        },
      ],
      feedback: [{ rating: 5 }, { rating: 3 }],
      deliveryEvents: [
        { type: "delivered", messageId: "m1", createdAt: "2026-05-12T02:01:00.000Z" },
        { type: "bounced", messageId: "m2", createdAt: "2026-05-12T05:01:00.000Z" },
      ],
      scheduler: { expectedRuns: 4, completedRuns: 4, duplicateRuns: 0, lagMinutes: 10 },
    });

    expect(metrics).toMatchObject({
      totalCases: 2,
      noticesSent: 2,
      noticeDeliverySuccessRate: 0.5,
      acknowledgmentRate: 0.5,
      removalWithin72hRate: 0.5,
      medianRegistrationToNoticeHours: 3,
      legalPackageRequests: 1,
      victimFeedbackCount: 2,
      averageVictimFeedbackRating: 4,
      schedulerCorrectnessRate: 1,
      schedulerHealthy: true,
    });
    expect(JSON.stringify(metrics)).not.toContain("https://");
  });
});
