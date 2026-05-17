import type { Prisma } from "@prisma/client";
import { processEscalationJob } from "@/jobs/escalation-worker";
import type { NoticeJob } from "@/jobs/queue";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { decryptField } from "@/lib/encryption";
import { dispatchEscalationFollowUp } from "@/lib/notice-dispatch";
import { renderNoticeTemplate, assertNoticeSubjectSafe } from "@/lib/notice-generator";
import { sendL2VictimNotification, type Locale } from "@/lib/email";

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

export type SkipReason =
  | "stopped"
  | "no_due_level"
  | "blocked_legal_review"
  | "blocked_no_recipient"
  | "blocked_no_template"
  | "blocked_no_user"
  | "blocked_decrypt_failed"
  | "blocked_audit_only";

export type DueEscalationSummary = {
  swept: number;
  fired: Array<{ noticeId: string; level: EscalationLevel; action: EscalationAction }>;
  skipped: Array<{ noticeId: string; reason: SkipReason; level?: EscalationLevel }>;
  errors: Array<{ noticeId: string; error: string }>;
};

type HandlerResult =
  | { kind: "fired" }
  | { kind: "blocked"; reason: Extract<SkipReason, `blocked_${string}`> };

const candidateSelect = {
  id: true,
  sentAt: true,
  escalationLevel: true,
  responseType: true,
  templateId: true,
  submittedUrl: {
    select: {
      id: true,
      caseId: true,
      status: true,
      domain: true,
      platform: { select: { name: true, grievanceEmail: true, lastContactVerifiedByHuman: true } },
      case: {
        select: {
          id: true,
          referenceNumber: true,
          user: { select: { id: true, emailEncrypted: true, preferredLocale: true } },
        },
      },
    },
  },
  template: {
    select: { bodyTemplate: true, subjectTemplate: true, reviewedByLegal: true },
  },
} as const satisfies Prisma.NoticeSelect;

type CandidateNotice = Prisma.NoticeGetPayload<{ select: typeof candidateSelect }>;

export async function runDueEscalationsFromDb(now: Date = new Date()): Promise<DueEscalationSummary> {
  const summary: DueEscalationSummary = { swept: 0, fired: [], skipped: [], errors: [] };

  const cutoff = new Date(now.getTime() - ESCALATION_HOURS[1] * 60 * 60_000);
  const candidates = await db.notice.findMany({
    where: {
      sentAt: { not: null, lte: cutoff },
      escalationLevel: { lt: 3 },
      removedAt: null,
    },
    select: candidateSelect,
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
      const handlerResult = await runLevelHandler({ notice, dueLevel });

      if (handlerResult.kind === "blocked") {
        summary.skipped.push({ noticeId: notice.id, reason: handlerResult.reason, level: dueLevel });
        continue;
      }

      // Handler succeeded — commit the level bump. If this transaction fails
      // we keep the email sent (handler already ran) but escalationLevel
      // stays at the prior tier; next sweep will see the Escalation row
      // missing for this level and re-attempt, which dispatchEscalationFollowUp
      // dedupes on at the in-memory map.
      await db.$transaction([
        db.escalation.create({
          data: { noticeId: notice.id, level: dueLevel, actionType: action, completedAt: now },
        }),
        db.notice.update({
          where: { id: notice.id },
          data: { escalationLevel: dueLevel },
        }),
      ]);

      summary.fired.push({ noticeId: notice.id, level: dueLevel, action });
    } catch (err) {
      summary.errors.push({ noticeId: notice.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}

async function runLevelHandler(input: { notice: CandidateNotice; dueLevel: EscalationLevel }): Promise<HandlerResult> {
  const { notice, dueLevel } = input;
  const job: NoticeJob = { caseId: notice.submittedUrl.caseId, urlId: notice.submittedUrl.id };

  if (dueLevel === 1) {
    return handleL1FollowUp(notice);
  }
  if (dueLevel === 2) {
    return handleL2VictimNotification(notice);
  }
  // L3 is still audit-only in this commit; the next commit replaces it.
  await processEscalationJob(job, dueLevel);
  return { kind: "fired" };
}

async function handleL1FollowUp(notice: CandidateNotice): Promise<HandlerResult> {
  if (!notice.template) {
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "Notice",
      entityId: notice.id,
      data: { reason: "no_template", escalationLevel: 1 },
    });
    return { kind: "blocked", reason: "blocked_no_template" };
  }
  if (!notice.template.reviewedByLegal) {
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "Notice",
      entityId: notice.id,
      data: { reason: "template_not_legal_reviewed", escalationLevel: 1 },
    });
    return { kind: "blocked", reason: "blocked_legal_review" };
  }
  const platform = notice.submittedUrl.platform;
  if (!platform?.grievanceEmail || !platform.lastContactVerifiedByHuman) {
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "Notice",
      entityId: notice.id,
      data: { reason: "no_verified_recipient", escalationLevel: 1 },
    });
    return { kind: "blocked", reason: "blocked_no_recipient" };
  }

  const variables = {
    platformName: platform.name,
    caseReference: notice.submittedUrl.case.referenceNumber,
    url: notice.submittedUrl.domain,
    declarationReference: notice.submittedUrl.case.referenceNumber,
  };

  // Body sent VERBATIM from the legally-reviewed template. Subject gets a
  // bracket prefix only so the recipient can group it with the prior thread
  // without changing any reviewed copy.
  const body = renderNoticeTemplate(notice.template.bodyTemplate, variables);
  const renderedSubject = renderNoticeTemplate(notice.template.subjectTemplate, variables);
  const subject = `[Follow-up #1] ${renderedSubject}`;
  assertNoticeSubjectSafe(subject);

  await processEscalationJob(
    { caseId: notice.submittedUrl.caseId, urlId: notice.submittedUrl.id },
    1,
  );

  await dispatchEscalationFollowUp({
    caseId: notice.submittedUrl.caseId,
    urlId: notice.submittedUrl.id,
    level: 1,
    recipientEmail: platform.grievanceEmail,
    subject,
    body,
  });

  return { kind: "fired" };
}

async function handleL2VictimNotification(notice: CandidateNotice): Promise<HandlerResult> {
  const user = notice.submittedUrl.case.user;
  if (!user) {
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "Notice",
      entityId: notice.id,
      data: { reason: "user_missing", escalationLevel: 2 },
    });
    return { kind: "blocked", reason: "blocked_no_user" };
  }

  let plaintextEmail: string;
  try {
    plaintextEmail = decryptField(user.emailEncrypted);
  } catch {
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "Notice",
      entityId: notice.id,
      actorId: user.id,
      data: { reason: "email_decrypt_failed", escalationLevel: 2 },
    });
    return { kind: "blocked", reason: "blocked_decrypt_failed" };
  }

  const locale: Locale = user.preferredLocale === "hi" ? "hi" : "en";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asmita.in";
  const dashboardUrl = `${appUrl.replace(/\/+$/, "")}/case/${notice.submittedUrl.case.id}`;

  await processEscalationJob(
    { caseId: notice.submittedUrl.caseId, urlId: notice.submittedUrl.id },
    2,
  );

  await sendL2VictimNotification(
    plaintextEmail,
    notice.submittedUrl.case.referenceNumber,
    dashboardUrl,
    locale,
  );

  return { kind: "fired" };
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
