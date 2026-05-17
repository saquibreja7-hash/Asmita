import { sendNoticeDraft } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";

export type DispatchedNotice = {
  idempotencyKey: string;
  caseId: string;
  urlId: string;
  recipientEmail: string;
  messageId: string;
  sentAt: string;
  payloadHash: string;
};

export const dispatchedNotices = new Map<string, DispatchedNotice>();

export function assertVerifiedNoticeRecipient(recipientEmail: string) {
  if (recipientEmail === HUMAN_VERIFICATION_REQUIRED || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("verified_recipient_required");
  }
}

export async function dispatchTier2Notice(input: {
  caseId: string;
  urlId: string;
  recipientEmail: string;
  subject: string;
  body: string;
}) {
  assertVerifiedNoticeRecipient(input.recipientEmail);
  const idempotencyKey = sha256(`${input.caseId}:${input.urlId}:${input.recipientEmail}`);
  const existing = dispatchedNotices.get(idempotencyKey);
  if (existing) {
    return { dispatched: false, notice: existing };
  }

  const sent = await sendNoticeDraft(input.recipientEmail, input.subject, input.body);
  const messageId =
    "id" in sent && typeof sent.id === "string"
      ? sent.id
      : "data" in sent && sent.data?.id
        ? sent.data.id
        : `message-${idempotencyKey.slice(0, 12)}`;

  const notice: DispatchedNotice = {
    idempotencyKey,
    caseId: input.caseId,
    urlId: input.urlId,
    recipientEmail: input.recipientEmail,
    messageId,
    sentAt: new Date().toISOString(),
    payloadHash: sha256(input.body),
  };
  dispatchedNotices.set(idempotencyKey, notice);
  await writeAuditLog({
    eventType: "NOTICE_SENT",
    entityType: "SubmittedUrl",
    entityId: input.urlId,
    data: { caseId: input.caseId, messageId: notice.messageId, idempotencyKey },
  });
  return { dispatched: true, notice };
}

export const dispatchedFollowUps = new Map<string, DispatchedNotice>();

export async function dispatchEscalationFollowUp(input: {
  caseId: string;
  urlId: string;
  level: 1 | 2 | 3;
  recipientEmail: string;
  subject: string;
  body: string;
}) {
  assertVerifiedNoticeRecipient(input.recipientEmail);
  // Idempotency key includes level so each escalation tier has its own slot;
  // re-running the cron will not re-send a follow-up that already went out.
  const idempotencyKey = sha256(
    `${input.caseId}:${input.urlId}:${input.recipientEmail}:L${input.level}`,
  );
  const existing = dispatchedFollowUps.get(idempotencyKey);
  if (existing) {
    return { dispatched: false, notice: existing };
  }

  const sent = await sendNoticeDraft(input.recipientEmail, input.subject, input.body);
  const messageId =
    "id" in sent && typeof sent.id === "string"
      ? sent.id
      : "data" in sent && sent.data?.id
        ? sent.data.id
        : `followup-${idempotencyKey.slice(0, 12)}`;

  const notice: DispatchedNotice = {
    idempotencyKey,
    caseId: input.caseId,
    urlId: input.urlId,
    recipientEmail: input.recipientEmail,
    messageId,
    sentAt: new Date().toISOString(),
    payloadHash: sha256(input.body),
  };
  dispatchedFollowUps.set(idempotencyKey, notice);
  await writeAuditLog({
    eventType: "NOTICE_SENT",
    entityType: "SubmittedUrl",
    entityId: input.urlId,
    data: {
      caseId: input.caseId,
      messageId: notice.messageId,
      idempotencyKey,
      escalationLevel: input.level,
      reason: "follow_up_after_no_response",
    },
  });
  return { dispatched: true, notice };
}
