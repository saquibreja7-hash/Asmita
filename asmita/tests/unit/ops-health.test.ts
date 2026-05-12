import { describe, expect, it } from "vitest";
import { evaluateOpsHealth } from "@/lib/ops-health";

describe("evaluateOpsHealth", () => {
  it("returns healthy when all operational metrics are below alert thresholds", () => {
    expect(
      evaluateOpsHealth({
        noticeDispatchP95Minutes: 90,
        noticeBounceRate: 0.01,
        escalationQueueItemsOlderThan4h: 0,
        humanReviewOldestAgeHours: 2,
        otpDeliveryFailureRate: 0.01,
        api5xxRate5m: 0,
        schedulerLagMinutes: 10,
        deletionJobBacklog: 0,
      }),
    ).toEqual({ healthy: true, alerts: [] });
  });

  it("reports the TRD alert thresholds", () => {
    const result = evaluateOpsHealth({
      noticeDispatchP95Minutes: 121,
      noticeBounceRate: 0.06,
      escalationQueueItemsOlderThan4h: 11,
      humanReviewOldestAgeHours: 5,
      otpDeliveryFailureRate: 0.03,
      api5xxRate5m: 0.02,
      schedulerLagMinutes: 31,
      deletionJobBacklog: 1,
    });

    expect(result.healthy).toBe(false);
    expect(result.alerts.map((alert) => alert.key)).toEqual([
      "notice_dispatch_latency",
      "notice_bounce_rate",
      "escalation_queue_backlog",
      "human_review_sla",
      "otp_delivery_failure",
      "api_5xx_rate",
      "scheduler_lag",
      "deletion_backlog",
    ]);
  });
});
