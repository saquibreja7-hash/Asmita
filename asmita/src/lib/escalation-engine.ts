import { processEscalationJob } from "@/jobs/escalation-worker";
import type { NoticeJob } from "@/jobs/queue";
import { db } from "@/lib/db";

export type EscalationSchedule = {
  level: 1 | 2 | 3;
  runAt: string;
  action: EscalationAction;
};

export type EscalationAction = "email_follow_up" | "victim_notification" | "fir_package";
export type EscalationLevel = 1 | 2 | 3;

const ESCALATION_HOURS: Record<EscalationLevel, number> = { 1: 24, 2: 48, 3: 24 * 7 };
const ESCALATION_ACTION: Record<EscalationLevel, EscalationAction> = {
  1: "email_follow_up",
  2: "victim_notification",
  3: "fir_package",
};

export type EscalationStopStatus = "ACKNOWLEDGED" | "REMOVED" | "REJECTED" | "MANUALLY_RESOLVED";

export function createEscalationSchedule(sentAt: Date): EscalationSchedule[] {
  return ([1, 2, 3] as const).map((level) => ({
    level,
    runAt: new Date(sentAt.getTime() + ESCALATION_HOURS[level] * 60 * 60_000).toISOString(),
    action: ESCALATION_ACTION[level],
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

export type DueEscalationSummary = {
  swept: number;
  fired: Array<{ noticeId: string; level: EscalationLevel; action: EscalationAction }>;
  skipped: Array<{ noticeId: string; reason: "stopped" | "no_due_level" }>;
  errors: Array<{ noticeId: string; error: string }>;
};

export async function runDueEscalationsFromDb(now: Date = new Date()): Promise<DueEscalationSummary> {
  const summary: DueEscalationSummary = { swept: 0, fired: [], skipped: [], errors: [] };

  const cutoff = new Date(now.getTime() - ESCALATION_HOURS[1] * 60 * 60_000);
  const candidates = await db.notice.findMany({
    where: {
      sentAt: { not: null, lte: cutoff },
      escalationLevel: { lt: 3 },
      removedAt: null,
    },
    select: {
      id: true,
      sentAt: true,
      escalationLevel: true,
      responseType: true,
      submittedUrl: {
        select: { id: true, caseId: true, status: true },
      },
    },
  });

  summary.swept = candidates.length;

  for (const notice of candidates) {
    if (!notice.sentAt) continue;
    try {
      if (
        shouldStopFutureEscalation({
          urlStatus: notice.submittedUrl.status,
          responseType: notice.responseType ?? undefined,
        })
      ) {
        summary.skipped.push({ noticeId: notice.id, reason: "stopped" });
        continue;
      }

      const dueLevel = highestDueLevel({
        sentAt: notice.sentAt,
        completedLevel: notice.escalationLevel,
        now,
      });
      if (!dueLevel) {
        summary.skipped.push({ noticeId: notice.id, reason: "no_due_level" });
        continue;
      }

      const action = ESCALATION_ACTION[dueLevel];

      await db.$transaction([
        db.escalation.create({
          data: { noticeId: notice.id, level: dueLevel, actionType: action, completedAt: now },
        }),
        db.notice.update({
          where: { id: notice.id },
          data: { escalationLevel: dueLevel },
        }),
      ]);

      await processEscalationJob(
        { caseId: notice.submittedUrl.caseId, urlId: notice.submittedUrl.id },
        dueLevel,
      );

      summary.fired.push({ noticeId: notice.id, level: dueLevel, action });
    } catch (err) {
      summary.errors.push({ noticeId: notice.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}

function highestDueLevel(input: {
  sentAt: Date;
  completedLevel: number;
  now: Date;
}): EscalationLevel | null {
  for (const level of [3, 2, 1] as const) {
    if (level <= input.completedLevel) continue;
    const dueAt = input.sentAt.getTime() + ESCALATION_HOURS[level] * 60 * 60_000;
    if (dueAt <= input.now.getTime()) return level;
  }
  return null;
}
