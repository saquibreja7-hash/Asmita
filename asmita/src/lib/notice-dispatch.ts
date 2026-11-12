import { sendNoticeDraft } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { db } from "@/lib/db";
import type { NoticeMethod } from "@prisma/client";
import {
  buildPlatformApiPayload,
  recordPlatformApiAttempt,
  sendNoticeToPlatformApi,
  type PlatformApiFingerprint,
} from "@/lib/platform-api";

// Workers are stateless: the in-memory idempotency maps below reset with
// every isolate, which would allow the same notice to be dispatched twice.
// Set NOTICE_DISPATCH_PERSISTENCE=database in production so dedup is enforced
// against the Notice table instead. The same key also goes to Resend, which
// covers a send that succeeded but was never recorded.
function databasePersistenceEnabled() {
  return process.env.NOTICE_DISPATCH_PERSISTENCE === "database";
}

// The original notice and its follow-ups are told apart by followUpOf, not by
// escalationLevel: the sweep raises the original's level as the ladder climbs.
async function findPersistedNotice(
  urlId: string,
  recipientEmail: string,
  followUpLevel: number | null,
): Promise<DispatchedNotice | null> {
  const existing = await db.notice.findFirst({
    where: followUpLevel === null
      ? { urlId, recipientEmail, followUpOf: null, sentAt: { not: null } }
      : { urlId, recipientEmail, followUpOf: { not: null }, escalationLevel: followUpLevel, sentAt: { not: null } },
  });
  if (!existing) return null;
  return {
    idempotencyKey: "",
    caseId: "",
    urlId: existing.urlId,
    recipientEmail: existing.recipientEmail ?? recipientEmail,
    messageId: existing.messageId ?? "",
    sentAt: existing.sentAt?.toISOString() ?? "",
    payloadHash: existing.payloadHash ?? "",
  };
}

async function findPersistedApiNotice(urlId: string): Promise<DispatchedNotice | null> {
  const existing = await db.notice.findFirst({
    where: { urlId, method: "API", followUpOf: null, sentAt: { not: null } },
  });
  if (!existing) return null;
  return {
    idempotencyKey: "",
    caseId: "",
    urlId: existing.urlId,
    recipientEmail: existing.recipientEmail ?? "",
    messageId: existing.messageId ?? "",
    sentAt: existing.sentAt?.toISOString() ?? "",
    payloadHash: existing.payloadHash ?? "",
  };
}

async function persistNotice(
  notice: DispatchedNotice,
  escalationLevel: number,
  link: {
    templateId?: string;
    followUpOf?: string;
    method?: NoticeMethod;
    routingTier?: number;
    recipientEmail?: string | null;
  } = {},
) {
  const create = db.notice.create({
    data: {
      urlId: notice.urlId,
      // The follow-up resends this reviewed template, so the sweep needs it.
      templateId: link.templateId ?? null,
      followUpOf: link.followUpOf ?? null,
      routingTier: link.routingTier ?? 2,
      method: link.method ?? "EMAIL",
      sentAt: new Date(notice.sentAt),
      recipientEmail: link.recipientEmail !== undefined ? link.recipientEmail : notice.recipientEmail,
      messageId: notice.messageId,
      payloadHash: notice.payloadHash,
      escalationLevel,
    },
  });
  if (link.followUpOf) {
    await create;
    return;
  }
  // The original notice moves its link from approved to sent, in the same
  // transaction, so the survivor's dashboard and signing see it as sent. Only
  // an approved link moves: a link removed in the meantime keeps its status.
  await db.$transaction([
    create,
    db.submittedUrl.updateMany({
      where: { id: notice.urlId, status: "NOTICE_QUEUED" },
      data: { status: "NOTICE_SENT" },
    }),
  ]);
}

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
  signedNoticePdf?: Buffer | null;
  // Fingerprints in the annex; recorded in the audit log, never their values.
  fingerprintIds?: string[];
  templateId?: string;
}) {
  assertVerifiedNoticeRecipient(input.recipientEmail);
  const idempotencyKey = sha256(`${input.caseId}:${input.urlId}:${input.recipientEmail}`);
  const existing = dispatchedNotices.get(idempotencyKey);
  if (existing) {
    return { dispatched: false, notice: existing };
  }
  if (databasePersistenceEnabled()) {
    const persisted = await findPersistedNotice(input.urlId, input.recipientEmail, null);
    if (persisted) {
      return { dispatched: false, notice: persisted };
    }
  }

  const attachments = input.signedNoticePdf
    ? [{ filename: "notice.pdf", content: input.signedNoticePdf }]
    : undefined;
  const sent = await sendNoticeDraft(input.recipientEmail, input.subject, input.body, attachments, `notice:${idempotencyKey}`);
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
  if (databasePersistenceEnabled()) {
    await persistNotice(notice, 0, { templateId: input.templateId });
  }
  await writeAuditLog({
    eventType: "NOTICE_SENT",
    entityType: "SubmittedUrl",
    entityId: input.urlId,
    data: {
      caseId: input.caseId,
      messageId: notice.messageId,
      idempotencyKey,
      fingerprintIds: input.fingerprintIds ?? [],
    },
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
  /** The original notice this follows. */
  noticeId: string;
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
  if (databasePersistenceEnabled()) {
    const persisted = await findPersistedNotice(input.urlId, input.recipientEmail, input.level);
    if (persisted) {
      return { dispatched: false, notice: persisted };
    }
  }

  const sent = await sendNoticeDraft(input.recipientEmail, input.subject, input.body, undefined, `follow-up:${idempotencyKey}`);
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
  if (databasePersistenceEnabled()) {
    await persistNotice(notice, input.level, { followUpOf: input.noticeId });
  }
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

// ─── Tier 1 platform API channel ────────────────────────────────────────────
//
// Sends the notice package to a partner platform's reporting endpoint instead
// of email. The payload is built from the same legally reviewed template text
// and the same signed PDF; only the transport differs. Fallback is decided
// by the caller (the route): a send failure here never throws.

export const dispatchedApiNotices = new Map<string, DispatchedNotice>();

export async function dispatchTier1ApiNotice(input: {
  caseId: string;
  urlId: string;
  caseReference: string;
  platform: { id: string; name: string; noticeBasis: string; grievanceEmail: string | null };
  endpoint: string;
  accessToken: string;
  subject: string;
  body: string;
  fingerprints: PlatformApiFingerprint[];
  /** Submission ids of the fingerprints, for the audit log (never the values). */
  fingerprintIds?: string[];
  signedNoticePdf?: Buffer | null;
  templateId?: string;
  actorId?: string;
}): Promise<
  | { dispatched: true; notice: DispatchedNotice; referenceId?: string }
  | { dispatched: false; reason: "already_dispatched" }
  | { dispatched: false; reason: "api_send_failed"; status: number | "network_error" | "timeout" }
> {
  const idempotencyKey = sha256(`platform-api:${input.caseId}:${input.urlId}:${input.platform.id}`);
  const existing = dispatchedApiNotices.get(idempotencyKey);
  if (existing) {
    return { dispatched: false, reason: "already_dispatched" };
  }
  if (databasePersistenceEnabled()) {
    const persisted = await findPersistedApiNotice(input.urlId);
    if (persisted) {
      return { dispatched: false, reason: "already_dispatched" };
    }
  }

  const payload = buildPlatformApiPayload({
    kind: "URL_NOTICE",
    caseReference: input.caseReference,
    noticeBasis: input.platform.noticeBasis,
    subject: input.subject,
    body: input.body,
    fingerprints: input.fingerprints,
    signedNoticePdf: input.signedNoticePdf,
    idempotencyKey,
  });

  const result = await sendNoticeToPlatformApi({
    endpoint: input.endpoint,
    accessToken: input.accessToken,
    payload,
  });
  recordPlatformApiAttempt({
    platformId: input.platform.id,
    result,
    fallbackReason: result.ok ? undefined : "api_send_failed",
  });

  if (!result.ok) {
    // entityType is SubmittedUrl, not Notice, so this never reads as an
    // escalation-ladder block (loadLadderBlocks filters entityType "Notice").
    await writeAuditLog({
      eventType: "NOTICE_FAILED",
      entityType: "SubmittedUrl",
      entityId: input.urlId,
      actorId: input.actorId,
      data: {
        caseId: input.caseId,
        transport: "platform_api",
        reason: result.status,
        idempotencyKey,
      },
    });
    return { dispatched: false, reason: "api_send_failed", status: result.status };
  }

  const messageId = result.referenceId ?? `platform-api-${idempotencyKey.slice(0, 12)}`;
  const notice: DispatchedNotice = {
    idempotencyKey,
    caseId: input.caseId,
    urlId: input.urlId,
    recipientEmail: input.platform.grievanceEmail ?? "",
    messageId,
    sentAt: new Date().toISOString(),
    payloadHash: sha256(input.body),
  };
  dispatchedApiNotices.set(idempotencyKey, notice);
  if (databasePersistenceEnabled()) {
    await persistNotice(notice, 0, {
      templateId: input.templateId,
      method: "API",
      routingTier: 1,
      recipientEmail: input.platform.grievanceEmail,
    });
  }
  await writeAuditLog({
    eventType: "NOTICE_SENT",
    entityType: "SubmittedUrl",
    entityId: input.urlId,
    actorId: input.actorId,
    data: {
      caseId: input.caseId,
      messageId,
      idempotencyKey,
      transport: "platform_api",
      platformId: input.platform.id,
      platformName: input.platform.name,
      apiStatus: result.status,
      referenceId: result.referenceId ?? null,
      fingerprintIds: input.fingerprintIds ?? [],
    },
  });
  return { dispatched: true, notice, referenceId: result.referenceId };
}
