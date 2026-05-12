import type { EscalationSchedule } from "@/lib/escalation-engine";

export function summarizeEscalationBacklog(
  schedules: Array<{ caseId: string; urlId: string; schedule: EscalationSchedule[]; completedLevels?: number[] }>,
  now = new Date(),
) {
  const due = schedules.flatMap((item) => {
    const completed = new Set(item.completedLevels || []);
    return item.schedule
      .filter((entry) => new Date(entry.runAt).getTime() <= now.getTime() && !completed.has(entry.level))
      .map((entry) => ({ caseId: item.caseId, urlId: item.urlId, level: entry.level, action: entry.action }));
  });

  return {
    dueCount: due.length,
    due,
    healthy: due.length === 0,
  };
}
