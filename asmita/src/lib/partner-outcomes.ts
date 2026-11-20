import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { normaliseDomain } from "@/lib/platform-partners-shared";
import { getPlatformPartner } from "@/lib/partner-admin";
import { fingerprintWasShared } from "@/lib/partner-feed";
import { partnerMemory } from "@/lib/partner-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import * as store from "@/lib/store";

/*
 * Partner programme part 2 (WP32): what a partner platform reported it did
 * with what Asmita sent it — POST /api/partner/v1/outcomes. A partner can
 * report about a fingerprint it received through the feed, and about a URL on
 * its own domains only (Rule 6: a partner never reports on another partner's
 * or another platform's pages; the check is against the partner's registered
 * domains before anything is written).
 *
 * Outcomes are stored as PartnerOutcome and shown on the admin case page. A
 * "removed" outcome that names a reported SubmittedUrl on the partner's
 * domain updates that link's status exactly the way an admin-recorded removal
 * does today (the notice-reply path): a guarded update that never rewrites an
 * already-removed link, plus a CONTENT_REMOVED audit entry per link.
 *
 * The audit data carries ids and counts only — never the URL. The URL itself
 * is stored encrypted exactly like SubmittedUrl.urlEncrypted, with the same
 * equality digest for the match.
 *
 * Backends like every partner module: the in-memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise.
 */

export const PARTNER_OUTCOMES = ["removed", "blocked_reupload", "not_found", "not_our_content"] as const;
export type PartnerOutcomeValue = (typeof PARTNER_OUTCOMES)[number];

/** The enum value the database stores for one outcome. */
function outcomeEnum(outcome: PartnerOutcomeValue): "REMOVED" | "BLOCKED_REUPLOAD" | "NOT_FOUND" | "NOT_OUR_CONTENT" {
  return outcome.toUpperCase() as "REMOVED" | "BLOCKED_REUPLOAD" | "NOT_FOUND" | "NOT_OUR_CONTENT";
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function prismaDb() {
  const { db } = await import("@/lib/db");
  return db;
}

/** The domains a partner owns, normalised exactly as they are stored. */
function partnerDomains(partner: { primaryDomain: string; extraDomains: string[] }): string[] {
  return [partner.primaryDomain, ...partner.extraDomains].flatMap((domain) => {
    const normalised = normaliseDomain(domain);
    return normalised ? [normalised] : [];
  });
}

/**
 * Rule 6's domain gate: the host of a partner-reported URL must be one of the
 * partner's own registered domains, exactly (a subdomain is not the partner's
 * domain unless it registered it — WP30 keeps one domain with one partner, so
 * ownership is never ambiguous).
 */
export function partnerOwnsUrlDomain(partner: { primaryDomain: string; extraDomains: string[] }, domain: string): boolean {
  return partnerDomains(partner).includes(domain);
}

export type RecordPartnerOutcomeInput = {
  fingerprintId?: string;
  url?: string;
  outcome: PartnerOutcomeValue;
  note?: string;
};

export type RecordPartnerOutcomeResult =
  | { ok: true; matchedLinks: number }
  | { ok: false; error: "partner_not_found" | "partner_suspended" | "unknown_fingerprint" | "invalid_url" | "url_not_on_partner_domain" };

type MatchedLink = { id: string; caseId: string; status: string };

async function recordOutcome(partnerId: string, input: RecordPartnerOutcomeInput): Promise<RecordPartnerOutcomeResult> {
  const partner = await getPlatformPartner(partnerId);
  if (!partner) return { ok: false, error: "partner_not_found" };
  if (partner.status !== "ACTIVE") return { ok: false, error: "partner_suspended" };

  // A fingerprint a partner may report about is one Asmita actually shared.
  if (input.fingerprintId !== undefined && !(await fingerprintWasShared(input.fingerprintId))) {
    return { ok: false, error: "unknown_fingerprint" };
  }

  // The URL, if any, must sit on the partner's own domains.
  let urlHash: string | null = null;
  let urlEncrypted: string | null = null;
  let urlDomain: string | null = null;
  let urlNormalised: string | null = null;
  if (input.url !== undefined) {
    const parsed = parseSubmittedUrl(input.url);
    if (!parsed.ok) return { ok: false, error: "invalid_url" };
    if (!partnerOwnsUrlDomain(partner, parsed.domain)) return { ok: false, error: "url_not_on_partner_domain" };
    urlHash = parsed.urlHash;
    urlDomain = parsed.domain;
    urlNormalised = parsed.normalizedUrl;
    urlEncrypted = encryptField(parsed.normalizedUrl);
  }

  // Reported links on the partner's domain (any survivor's case: the content
  // at that address is the same for everyone who reported it).
  const domains = partnerDomains(partner);
  const matched = urlHash ? await reportedLinksByUrlHash(urlHash, domains) : [];

  // The case the outcome belongs to: the fingerprint's case when it names
  // one, else the first reported link's case.
  let caseId: string | null = null;
  if (input.fingerprintId !== undefined) {
    caseId = await fingerprintCaseId(input.fingerprintId);
  }
  if (caseId === null && matched.length > 0) caseId = matched[0]!.caseId;

  await insertOutcome({
    id: randomUUID(),
    partnerId,
    fingerprintId: input.fingerprintId ?? null,
    urlEncrypted,
    urlHash,
    submittedUrlId: matched.length > 0 ? matched[0]!.id : null,
    caseId,
    outcome: outcomeEnum(input.outcome),
    note: input.note?.trim() ? input.note.trim() : null,
  });

  // A removal updates the reported link exactly like the admin-recorded
  // removal (notice reply): guarded, so an already-removed link stays as it
  // is and two reports cannot both record it, with a CONTENT_REMOVED entry
  // per link that changed.
  let removedCount = 0;
  if (input.outcome === "removed") {
    for (const link of matched) {
      if (await markReportedLinkRemoved(link, partnerId)) removedCount += 1;
    }
  }

  await writeAuditLog({
    eventType: "PARTNER_OUTCOME_REPORTED",
    entityType: "PlatformPartner",
    entityId: partnerId,
    data: {
      outcome: input.outcome,
      fingerprintId: input.fingerprintId ?? null,
      urlReported: urlNormalised !== null,
      urlDomain,
      matchedLinks: matched.length,
      linksRemoved: removedCount,
      caseId,
    },
  });

  return { ok: true, matchedLinks: matched.length };
}

export async function recordPartnerOutcome(partnerId: string, input: RecordPartnerOutcomeInput): Promise<RecordPartnerOutcomeResult> {
  return recordOutcome(partnerId, input);
}

// ---------------------------------------------------------------------------
// The three backends

type OutcomeRow = {
  id: string;
  partnerId: string;
  fingerprintId: string | null;
  urlEncrypted: string | null;
  urlHash: string | null;
  submittedUrlId: string | null;
  caseId: string | null;
  outcome: "REMOVED" | "BLOCKED_REUPLOAD" | "NOT_FOUND" | "NOT_OUR_CONTENT";
  note: string | null;
};

async function insertOutcome(row: OutcomeRow) {
  if (isDevNoDb()) {
    partnerMemory().outcomes.push({ ...row, createdAt: new Date() });
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("PartnerOutcome").values({ ...row }).execute();
    return;
  }
  const db = await prismaDb();
  await db.partnerOutcome.create({
    data: {
      id: row.id,
      partnerId: row.partnerId,
      fingerprintId: row.fingerprintId,
      urlEncrypted: row.urlEncrypted,
      urlHash: row.urlHash,
      submittedUrlId: row.submittedUrlId,
      caseId: row.caseId,
      outcome: row.outcome,
      note: row.note,
    },
    select: { id: true },
  });
}

/** The reported links (SubmittedUrl rows) with this normalised URL, on these domains. */
async function reportedLinksByUrlHash(urlHash: string, domains: string[]): Promise<MatchedLink[]> {
  if (isDevNoDb()) {
    const matched: MatchedLink[] = [];
    for (const record of store.cases.values()) {
      for (const url of record.urls) {
        if (url.urlHash === urlHash && domains.includes(url.domain)) matched.push({ id: url.id, caseId: record.id, status: url.status });
      }
    }
    return matched;
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("SubmittedUrl").select(["id", "caseId", "status"])
      .where("urlHash", "=", urlHash).where("domain", "in", domains).execute();
  }
  const db = await prismaDb();
  return db.submittedUrl.findMany({
    where: { urlHash, domain: { in: domains } },
    select: { id: true, caseId: true, status: true },
  });
}

/**
 * The guarded removal of one reported link — the same write the admin
 * notice-reply path performs (status -> REMOVED only when it was not
 * already), with the same CONTENT_REMOVED audit entry.
 */
async function markReportedLinkRemoved(link: MatchedLink, partnerId?: string): Promise<boolean> {
  let removed = false;
  if (isDevNoDb()) {
    for (const record of store.cases.values()) {
      const url = record.urls.find((item) => item.id === link.id && item.status !== "REMOVED");
      if (url) {
        url.status = "REMOVED";
        removed = true;
      }
    }
  } else if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("SubmittedUrl").set({ status: "REMOVED" })
      .where("id", "=", link.id).where("status", "<>", "REMOVED").executeTakeFirst();
    removed = Number(result.numUpdatedRows) > 0;
  } else {
    const db = await prismaDb();
    const result = await db.submittedUrl.updateMany({
      where: { id: link.id, status: { not: "REMOVED" } },
      data: { status: "REMOVED" },
    });
    removed = result.count > 0;
  }
  if (removed) {
    await writeAuditLog({
      eventType: "CONTENT_REMOVED",
      entityType: "SubmittedUrl",
      entityId: link.id,
      data: { action: "partner_outcome_removed", partnerId: partnerId ?? null, caseId: link.caseId },
    });
  }
  return removed;
}

/** The case a fingerprint belongs to, if it is still known. */
async function fingerprintCaseId(fingerprintId: string): Promise<string | null> {
  if (isDevNoDb()) {
    return (await import("@/lib/crawl-store")).crawlMemory().fingerprints.get(fingerprintId)?.caseId ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("HashSubmission").select("caseId")
      .where("id", "=", fingerprintId).executeTakeFirst();
    return row?.caseId ?? null;
  }
  const db = await prismaDb();
  const row = await db.hashSubmission.findUnique({ where: { id: fingerprintId }, select: { caseId: true } });
  return row?.caseId ?? null;
}

// ---------------------------------------------------------------------------
// The admin case page's view

export type AdminPartnerOutcome = {
  id: string;
  partnerName: string;
  partnerDomain: string;
  fingerprintId: string | null;
  /** The reported link it matched, when it named one (never the address). */
  matchedLinkId: string | null;
  outcome: PartnerOutcomeValue;
  note: string | null;
  createdAt: string;
};

function toOutcomeValue(outcome: string): PartnerOutcomeValue {
  const value = outcome.toLowerCase() as PartnerOutcomeValue;
  return (PARTNER_OUTCOMES as readonly string[]).includes(value) ? value : "not_found";
}

/** The outcomes to show on one case's admin page, newest first. */
export async function listPartnerOutcomesForCase(caseId: string): Promise<AdminPartnerOutcome[]> {
  if (isDevNoDb()) {
    return partnerMemory().outcomes
      .filter((outcome) => outcome.caseId === caseId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((outcome) => ({
        id: outcome.id,
        partnerName: partnerMemory().partners.get(outcome.partnerId)?.name ?? "—",
        partnerDomain: partnerMemory().partners.get(outcome.partnerId)?.primaryDomain ?? "—",
        fingerprintId: outcome.fingerprintId,
        matchedLinkId: outcome.submittedUrlId,
        outcome: toOutcomeValue(outcome.outcome),
        note: outcome.note,
        createdAt: outcome.createdAt.toISOString(),
      }));
  }
  // The admin console reads through Prisma (Node) even on the Worker build.
  const db = await prismaDb();
  const rows = await db.partnerOutcome.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fingerprintId: true,
      submittedUrlId: true,
      outcome: true,
      note: true,
      createdAt: true,
      partner: { select: { name: true, primaryDomain: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    partnerName: row.partner.name,
    partnerDomain: row.partner.primaryDomain,
    fingerprintId: row.fingerprintId,
    matchedLinkId: row.submittedUrlId,
    outcome: toOutcomeValue(row.outcome),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}
