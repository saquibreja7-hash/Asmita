import { describe, expect, it } from "vitest";
import { createEscalationSchedule, runDueEscalations, shouldStopFutureEscalation } from "@/lib/escalation-engine";

describe("escalation-engine", () => {
  it("creates UTC escalation windows at 24h, 48h, and 7d", () => {
    const sentAt = new Date("2026-05-12T00:00:00.000Z");
    const schedule = createEscalationSchedule(sentAt);
    expect(schedule.map((item) => item.runAt)).toEqual([
      "2026-05-13T00:00:00.000Z",
      "2026-05-14T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
    ]);
  });

  it("runs only due, uncompleted escalations", async () => {
    const sentAt = new Date("2026-05-12T00:00:00.000Z");
    const schedule = createEscalationSchedule(sentAt);
    const results = await runDueEscalations({
      job: { caseId: "case-1", urlId: "url-1" },
      schedule,
      now: new Date("2026-05-14T01:00:00.000Z"),
      completedLevels: [1],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ level: 2 });
  });

  it("stops future escalation for terminal platform or victim-resolution states", async () => {
    const sentAt = new Date("2026-05-12T00:00:00.000Z");
    const schedule = createEscalationSchedule(sentAt);
    const results = await runDueEscalations({
      job: { caseId: "case-1", urlId: "url-1" },
      schedule,
      now: new Date("2026-05-20T01:00:00.000Z"),
      urlStatus: "REMOVED",
    });

    expect(results).toHaveLength(0);
    expect(shouldStopFutureEscalation({ responseType: "ACKNOWLEDGED" })).toBe(true);
    expect(shouldStopFutureEscalation({ manuallyResolvedAt: "2026-05-12T00:00:00.000Z" })).toBe(true);
  });
});
