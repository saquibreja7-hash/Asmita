import { describe, expect, it } from "vitest";
import { calculatePlatformResponseRates } from "@/lib/response-rates";

describe("calculatePlatformResponseRates", () => {
  it("recommends strategy review for low-response platforms", () => {
    const samples = Array.from({ length: 5 }, (_, index) => ({
      platformId: "platform-1",
      platformName: "Platform One",
      noticeSentAt: `2026-05-${10 + index}T00:00:00.000Z`,
    }));

    const [row] = calculatePlatformResponseRates(samples, new Date("2026-05-15T00:00:00.000Z"));

    expect(row).toMatchObject({
      noticesSent: 5,
      responded: 0,
      responseRate: 0,
      recommendation: "Review escalation strategy and contact freshness",
    });
  });
});
