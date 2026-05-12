import { processEscalationJob } from "@/jobs/escalation-worker";
import type { NoticeJob } from "@/jobs/queue";

export type EscalationSchedule = {
  level: 1 | 2 | 3;
  runAt: string;
  action: "email_follow_up" | "victim_notification" | "fir_package";
};

export type EscalationStopStatus = "ACKNOWLEDGED" | "REMOVED" | "REJECTED" | "MANUALLY_RESOLVED";

export function createEscalationSchedule(sentAt: Date): EscalationSchedule[] {
  const hours = [24, 48, 24 * 7] as const;
  return hours.map((hour, index) => ({
    level: (index + 1) as 1 | 2 | 3,
    runAt: new Date(sentAt.getTime() + hour * 60 * 60_000).toISOString(),
    action: index === 0 ? "email_follow_up" : index === 1 ? "victim_notification" : "fir_package",
  }));
}

export async function runDueEscalations(input: {
  job: NoticeJob;
  schedule: EscalationSchedule[];
  now: Date;
  completedLevels?: Array<1 | 2 | 3>;
  urlStatus?: string;
  responseType?: string;
  manuallyResolvedAt?: string;
}) {
  if (shouldStopFutureEscalation(input)) {
    return [];
  }
  const completed = new Set(input.completedLevels ?? []);
  const due = input.schedule.filter(
    (item) => new Date(item.runAt).getTime() <= input.now.getTime() && !completed.has(item.level),
  );
  const results = [];
  for (const item of due) {
    results.push(await processEscalationJob(input.job, item.level));
    completed.add(item.level);
  }
  return results;
}

export function shouldStopFutureEscalation(input: {
  urlStatus?: string;
  responseType?: string;
  manuallyResolvedAt?: string;
}) {
  if (input.manuallyResolvedAt) return true;
  return ["ACKNOWLEDGED", "REMOVED", "REJECTED", "MANUALLY_RESOLVED"].includes(input.urlStatus || "") ||
    ["ACKNOWLEDGED", "REMOVED", "REJECTED"].includes(input.responseType || "");
}
