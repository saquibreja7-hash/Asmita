import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { decryptField } from "@/lib/encryption";
import { sendNoticeDraft } from "@/lib/email";
import { sha256 } from "@/lib/hash";
import { partnerMemory } from "@/lib/partner-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Partner programme part 2 (WP33): the platform partner's takedown channel.
 *
 * Two things travel through it, both by email, both to the channel address
 * an admin set on the partner (never the survivor's, never a grievance
 * contact Asmita has not verified some other way — the channel is the
 * platform's own agreed inbox for programme traffic):
 *
 * - a copy of a notice Asmita dispatched to the platform's verified
 *   grievance contact: the same subject, body and signed PDF, sent in
 *   addition to that contact, never instead of it;
 * - an alert when an analyst accepts a crawler finding on the partner's
 *   domain: the case reference, the page URL on the partner's own domain
 *   and the fingerprint id — never the image, never the fingerprint value,
 *   never anything about the survivor.
 *
 * Every send is idempotent the way notices are: a sha256 key over the ids
 * involved, carried to Resend so a retry never emails twice, checked
 * against the PartnerChannelSend row before sending and recorded after, so
 * a retry on another isolate sees the earlier send. One audit entry per
 * send (PARTNER_CHANNEL_SENT) and one per failure (PARTNER_CHANNEL_FAILED),
 * both carrying ids and counts only — never an address, never a hash.
 *
 * A channel send never throws and never fails the action that triggered
 * it: the notice the survivor signed has already gone to the verified
 * contact, and an analyst's approval has already been recorded, before any
 * of this runs. Failures are audited, not surfaced as errors.
 *
 * Backends like every partner module: the in-memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise.
 */

export type PartnerChannelKind = "notice" | "alert";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function prismaDb() {
  const { db } = await import("@/lib/db");
  return db;
}

// ---------------------------------------------------------------------------
// Which partner owns a host

type PartnerLookupRow = {
  id: string;
  name: string;
  status: string;
  primaryDomain: string;
  extraDomains: string[];
  channelEmailEncrypted: string | null;
  crawlPermissionRecordedAt: Date | string | null;
};

export type PartnerChannelTarget = {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  primaryDomain: string;
  extraDomains: string[];
  channelEmail: string | null;
  crawlPermissionRecordedAt: Date | null;
  /** The registered domain the host matched (the host itself, or its parent). */
  matchedDomain: string;
};

async function allPartnerRows(): Promise<PartnerLookupRow[]> {
  if (isDevNoDb()) {
    return [...partnerMemory().partners.values()];
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("PlatformPartner")
      .select(["id", "name", "status", "primaryDomain", "extraDomains", "channelEmailEncrypted", "crawlPermissionRecordedAt"])
      .execute();
  }
  const db = await prismaDb();
  return db.platformPartner.findMany({
    select: {
      id: true, name: true, status: true, primaryDomain: true, extraDomains: true,
      channelEmailEncrypted: true, crawlPermissionRecordedAt: true,
    },
  });
}

function partnerDomainsOf(row: PartnerLookupRow): string[] {
  return [row.primaryDomain, ...row.extraDomains].filter(Boolean);
}

/**
 * The partner whose registered domain a host belongs to: the host is one of
 * the partner's domains or a subdomain of one, and the longest matching
 * domain wins (a partner that registered the exact host is more specific
 * than one that registered its parent — WP30 keeps one domain with one
 * partner, so an exact match is never ambiguous). Null when no partner
 * owns the host: a stranger's site, or a platform that never joined.
 */
export function owningPartner(
  host: string,
  partners: Array<Pick<PartnerLookupRow, "id" | "name" | "status" | "primaryDomain" | "extraDomains" | "channelEmailEncrypted" | "crawlPermissionRecordedAt">>,
): { row: PartnerLookupRow; matchedDomain: string } | null {
  let best: { row: PartnerLookupRow; matchedDomain: string } | null = null;
  for (const row of partners as PartnerLookupRow[]) {
    for (const domain of partnerDomainsOf(row)) {
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      if (!best || domain.length > best.matchedDomain.length) best = { row, matchedDomain: domain };
    }
  }
  return best;
}

async function toTarget(host: string): Promise<PartnerChannelTarget | null> {
  const match = owningPartner(host, await allPartnerRows());
  if (!match) return null;
  const { row, matchedDomain } = match;
  let channelEmail: string | null = null;
  if (row.channelEmailEncrypted) {
    try {
      channelEmail = decryptField(row.channelEmailEncrypted);
    } catch {
      channelEmail = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    primaryDomain: row.primaryDomain,
    extraDomains: row.extraDomains,
    channelEmail,
    crawlPermissionRecordedAt: row.crawlPermissionRecordedAt === null ? null : new Date(row.crawlPermissionRecordedAt),
    matchedDomain,
  };
}

/**
 * WP33's crawler gate: whether a host belongs to a platform partner whose
 * written permission to crawl has not been recorded. Findings on such a
 * host are refused (crawl-findings.ts) — Asmita's monitoring of a
 * partner's pages starts only with the platform's written permission.
 */
export async function partnerCrawlPermissionMissing(host: string): Promise<boolean> {
  const target = await toTarget(host);
  return target !== null && target.crawlPermissionRecordedAt === null;
}

// ---------------------------------------------------------------------------
// The send itself (both kinds share one path)

export type PartnerChannelOutcome =
  | { sent: true; partnerId: string; messageId: string; alreadySent?: boolean }
  | {
      sent: false;
      reason: "no_partner" | "partner_suspended" | "no_channel_email" | "permission_not_recorded" | "already_sent" | "send_failed";
    };

type ChannelSendInput = {
  kind: PartnerChannelKind;
  /** Ids the dedup key covers, in a fixed order. */
  dedupKeyParts: string[];
  partnerId: string;
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; content: Buffer }[];
  urlId: string | null;
  findingId: string | null;
  caseId: string | null;
  /** Ids and counts only, for the audit entry. */
  auditData: Record<string, string | number | boolean | string[] | null>;
  actorId?: string;
};

async function channelSendAlreadyRecorded(dedupKey: string): Promise<boolean> {
  if (isDevNoDb()) {
    return partnerMemory().channelSends.some((send) => send.dedupKey === dedupKey);
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PartnerChannelSend").select("id")
      .where("dedupKey", "=", dedupKey).limit(1).executeTakeFirst();
    return row !== undefined;
  }
  const db = await prismaDb();
  return (await db.partnerChannelSend.findFirst({ where: { dedupKey }, select: { id: true } })) !== null;
}

async function recordChannelSend(row: {
  partnerId: string;
  kind: "NOTICE" | "FINDING_ALERT";
  urlId: string | null;
  findingId: string | null;
  caseId: string | null;
  dedupKey: string;
  messageId: string;
}): Promise<void> {
  const sentAt = new Date();
  if (isDevNoDb()) {
    partnerMemory().channelSends.push({ id: randomUUID(), ...row, sentAt, createdAt: sentAt });
    return;
  }
  if (usesWorkerKysely()) {
    // The unique dedupKey makes a concurrent record from another isolate a
    // no-op: only the first insert wins, and both agree the email went out.
    await getWorkerDb().insertInto("PartnerChannelSend")
      .values({ id: randomUUID(), ...row, sentAt })
      .onConflict((oc) => oc.column("dedupKey").doNothing())
      .execute();
    return;
  }
  const db = await prismaDb();
  try {
    await db.partnerChannelSend.create({ data: { id: randomUUID(), ...row, sentAt }, select: { id: true } });
  } catch (err) {
    // A concurrent isolate recorded the same send first: the email went out
    // once, which is what the row is for.
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
}

async function deliverThroughChannel(input: ChannelSendInput): Promise<PartnerChannelOutcome> {
  const dedupKey = sha256(`partner-channel:${input.kind}:${input.dedupKeyParts.join(":")}`);
  if (await channelSendAlreadyRecorded(dedupKey)) {
    return { sent: false, reason: "already_sent" };
  }
  let messageId: string;
  let alreadySent = false;
  try {
    const sent = await sendNoticeDraft(input.to, input.subject, input.body, input.attachments, `partner-channel:${dedupKey}`);
    messageId = "id" in sent && typeof sent.id === "string" ? sent.id : `partner-channel-${dedupKey.slice(0, 12)}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "email_already_sent") {
      // An earlier attempt reached Resend but was never recorded: the email
      // is out. Record it now so every later retry is a no-op.
      messageId = `unrecorded-${dedupKey.slice(0, 12)}`;
      alreadySent = true;
    } else {
      await writeAuditLog({
        eventType: "PARTNER_CHANNEL_FAILED",
        entityType: "PlatformPartner",
        entityId: input.partnerId,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        data: { kind: input.kind, reason: message || "send_failed", ...input.auditData },
      });
      return { sent: false, reason: "send_failed" };
    }
  }
  await recordChannelSend({
    partnerId: input.partnerId,
    kind: input.kind === "notice" ? "NOTICE" : "FINDING_ALERT",
    urlId: input.urlId,
    findingId: input.findingId,
    caseId: input.caseId,
    dedupKey,
    messageId,
  });
  await writeAuditLog({
    eventType: "PARTNER_CHANNEL_SENT",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    data: { kind: input.kind, messageId, ...(alreadySent ? { dedupedByResend: true } : {}), ...input.auditData },
  });
  return { sent: true, partnerId: input.partnerId, messageId, ...(alreadySent ? { alreadySent: true } : {}) };
}

// ---------------------------------------------------------------------------
// The notice copy (WP33: "send it there in addition to the verified
// grievance contact, never instead of it")

/**
 * Sends the notice Asmita just dispatched to the platform's verified
 * grievance contact as a copy to the platform partner's channel email: the
 * same subject, body and signed PDF. Only when the notice's URL is on a
 * domain an ACTIVE partner with a channel email owns; never instead of the
 * original send, and never a second time (the dedup key covers the case,
 * the link and the partner).
 */
export async function copyNoticeToPartnerChannel(input: {
  caseId: string;
  urlId: string;
  /** The notice's URL host: the copy goes only to the partner that owns it. */
  domain: string;
  subject: string;
  body: string;
  signedNoticePdf?: Buffer | null;
  /** Ids only, for the audit entry (never the values). */
  fingerprintIds?: string[];
  actorId?: string;
}): Promise<PartnerChannelOutcome> {
  const target = await toTarget(input.domain);
  if (!target) return { sent: false, reason: "no_partner" };
  if (target.status !== "ACTIVE") return { sent: false, reason: "partner_suspended" };
  if (!target.channelEmail) return { sent: false, reason: "no_channel_email" };
  return deliverThroughChannel({
    kind: "notice",
    dedupKeyParts: [input.caseId, input.urlId, target.id],
    partnerId: target.id,
    to: target.channelEmail,
    subject: input.subject,
    body: input.body,
    attachments: input.signedNoticePdf ? [{ filename: "notice.pdf", content: input.signedNoticePdf }] : undefined,
    urlId: input.urlId,
    findingId: null,
    caseId: input.caseId,
    auditData: { caseId: input.caseId, urlId: input.urlId, fingerprintIds: input.fingerprintIds ?? [] },
    actorId: input.actorId,
  });
}

// ---------------------------------------------------------------------------
// The crawler-finding alert

/**
 * The alert email itself, a pure builder for tests: the case reference,
 * the page URL on the partner's own domain and the fingerprint id, and
 * nothing else — never the image address, never a hash value.
 */
export function partnerFindingAlertEmail(input: {
  partnerName: string;
  caseReference: string;
  pageUrl: string;
  fingerprintId: string;
}): { subject: string; body: string } {
  return {
    subject: `Asmita crawler alert: possible match on your platform (case ${input.caseReference})`,
    body: [
      `Hello ${input.partnerName} team,`,
      "",
      "Asmita's crawler, which monitors pages on your platform under your written permission, found a page that appears to match a fingerprint in Asmita's partner programme. Asmita's analyst team reviewed and accepted the match.",
      "",
      `Case reference: ${input.caseReference}`,
      `Page on your domain: ${input.pageUrl}`,
      `Fingerprint id: ${input.fingerprintId}`,
      "",
      "No image or video is ever sent to you, and no information about the individual is included.",
      "",
      "Please review the page and remove or restrict the content under your policies. A formal takedown notice may follow through the usual channel. You can report what you did through the partner API (POST /api/partner/v1/outcomes).",
      "",
      "— Asmita (meriasmita.org)",
    ].join("\n"),
  };
}

/**
 * The alert an analyst's acceptance of a crawler finding triggers (WP33):
 * only when the finding's page is on a domain an ACTIVE partner with a
 * channel email and a recorded written permission to crawl owns. Never
 * throws — an alert problem must never touch the review that triggered it.
 */
export async function alertPartnerChannelOfFinding(input: {
  findingId: string;
  caseId: string;
  caseReference: string;
  /** The page the crawler found — always on the partner's own domain. */
  pageUrl: string;
  pageDomain: string;
  fingerprintId: string;
  reviewerId: string;
}): Promise<PartnerChannelOutcome> {
  const target = await toTarget(input.pageDomain);
  if (!target) return { sent: false, reason: "no_partner" };
  if (target.status !== "ACTIVE") return { sent: false, reason: "partner_suspended" };
  if (!target.channelEmail) return { sent: false, reason: "no_channel_email" };
  // The alert is the monitoring the platform's written permission covers.
  if (target.crawlPermissionRecordedAt === null) return { sent: false, reason: "permission_not_recorded" };
  const email = partnerFindingAlertEmail({
    partnerName: target.name,
    caseReference: input.caseReference,
    pageUrl: input.pageUrl,
    fingerprintId: input.fingerprintId,
  });
  return deliverThroughChannel({
    kind: "alert",
    dedupKeyParts: [input.findingId, target.id],
    partnerId: target.id,
    to: target.channelEmail,
    subject: email.subject,
    body: email.body,
    urlId: null,
    findingId: input.findingId,
    caseId: input.caseId,
    auditData: { findingId: input.findingId, caseId: input.caseId, fingerprintId: input.fingerprintId, domain: input.pageDomain },
    actorId: input.reviewerId,
  });
}

