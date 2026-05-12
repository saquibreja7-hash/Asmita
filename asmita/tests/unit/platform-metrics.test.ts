import { describe, expect, it } from "vitest";
import { calculatePlatformMetrics } from "@/lib/platform-metrics";

describe("calculatePlatformMetrics", () => {
  it("tracks delivery, acknowledgment, and removal rates", () => {
    const [metrics] = calculatePlatformMetrics([
      {
        platformId: "platform-1",
        platformName: "Platform One",
        sent: true,
        delivered: true,
        acknowledged: true,
      },
      {
        platformId: "platform-1",
        platformName: "Platform One",
        sent: true,
        delivered: true,
        removed: true,
      },
    ]);

    expect(metrics).toMatchObject({
      sent: 2,
      deliverySuccessRate: 1,
      acknowledgmentRate: 0.5,
      removalRate: 0.5,
    });
  });
});
