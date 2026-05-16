import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/alerts");

import * as alerts from "@/lib/alerts";
import { dispatchOpsAlerts } from "@/lib/alerts-dispatch";

describe("dispatchOpsAlerts", () => {
  beforeEach(() => {
    vi.mocked(alerts.sendOnCallAlert).mockResolvedValue({
      delivered: true,
      status: 200,
      payload: { id: "x", severity: "warning", title: "t", description: "d", createdAt: new Date().toISOString(), service: "asmita" },
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("sends no alerts when ops health is clean", async () => {
    const result = await dispatchOpsAlerts({ noticeBounceRate: 0.01 });
    expect(result).toEqual([]);
    expect(alerts.sendOnCallAlert).not.toHaveBeenCalled();
  });

  it("fires one alert per breached metric", async () => {
    await dispatchOpsAlerts({
      noticeDispatchP95Minutes: 180,
      noticeBounceRate: 0.10,
    });
    expect(alerts.sendOnCallAlert).toHaveBeenCalledTimes(2);
  });

  it("maps bounce rate to critical severity", async () => {
    await dispatchOpsAlerts({ noticeBounceRate: 0.20 });
    const call = vi.mocked(alerts.sendOnCallAlert).mock.calls[0][0];
    expect(call.severity).toBe("critical");
    expect(call.route).toBe("notice_bounce_rate");
  });

  it("maps dispatch latency to warning severity", async () => {
    await dispatchOpsAlerts({ noticeDispatchP95Minutes: 200 });
    const call = vi.mocked(alerts.sendOnCallAlert).mock.calls[0][0];
    expect(call.severity).toBe("warning");
  });

  it("includes the current value in the description", async () => {
    await dispatchOpsAlerts({ deletionJobBacklog: 7 });
    const call = vi.mocked(alerts.sendOnCallAlert).mock.calls[0][0];
    expect(call.description).toContain("current=7");
  });
});
