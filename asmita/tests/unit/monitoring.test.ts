import { describe, expect, it } from "vitest";
import { summarizeDeliverability } from "@/lib/deliverability-monitor";
import { createEscalationSchedule } from "@/lib/escalation-engine";
import { summarizeEscalationBacklog } from "@/lib/escalation-monitor";
import { inMemoryAuditLog, writeAuditLog } from "@/lib/audit";
import { summarizeNoFetchInvariant } from "@/lib/no-fetch-monitor";

describe("monitoring", () => {
  it("marks deliverability unhealthy when bounce rate exceeds 2 percent", () => {
    const events = [
      { type: "bounced" as const, messageId: "1", createdAt: "2026-05-12T00:00:00.000Z" },
      ...Array.from({ length: 9 }, (_, index) => ({
        type: "delivered" as const,
        messageId: `delivered-${index}`,
        createdAt: "2026-05-12T00:00:00.000Z",
      })),
    ];

    expect(summarizeDeliverability(events)).toMatchObject({ bounceRate: 0.1, healthy: false });
  });

  it("summarizes due escalation backlog", () => {
    const schedule = createEscalationSchedule(new Date("2026-05-12T00:00:00.000Z"));
    const summary = summarizeEscalationBacklog(
      [{ caseId: "case-1", urlId: "url-1", schedule, completedLevels: [1] }],
      new Date("2026-05-14T01:00:00.000Z"),
    );

    expect(summary).toMatchObject({ dueCount: 1, healthy: false });
    expect(summary.due[0]).toMatchObject({ level: 2 });
  });

  it("reports no-fetch invariant health from audit events", async () => {
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1" });

    expect(summarizeNoFetchInvariant(inMemoryAuditLog)).toEqual({ violations: 0, healthy: true });
  });
});
