import { db } from "@/lib/db";
import { encryptField, decryptField } from "@/lib/encryption";
import { hashEmail } from "@/lib/hash";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { findPlatformByDomain } from "@/lib/platforms";
import { writeAuditLog } from "@/lib/audit";

export type DisplayUrl = {
  id: string;
  domain: string;
  platformName: string;
  status: string;
  urlHash: string;
  flaggedForReview?: boolean;
  flagReason?: string | null;
};

export type DisplayCase = {
  id: string;
  referenceNumber: string;
  userId: string;
  createdAt: string;
  status: string;
  urls: DisplayUrl[];
};

function toDisplayUrl(url: {
  id: string;
  domain: string;
  urlHash: string;
  status: string;
  flaggedForReview: boolean;
  flagReason: string | null;
}): DisplayUrl {
  return {
    id: url.id,
    domain: url.domain,
    platformName: findPlatformByDomain(url.domain)?.name ?? "Unknown – under review",
    status: url.status,
    urlHash: url.urlHash,
    flaggedForReview: url.flaggedForReview,
    flagReason: url.flagReason,
  };
}

function toDisplayCase(dbCase: {
  id: string;
  referenceNumber: string;
  userId: string;
  createdAt: Date;
  status: string;
  submittedUrls: Array<{
    id: string;
    domain: string;
    urlHash: string;
    status: string;
    flaggedForReview: boolean;
    flagReason: string | null;
  }>;
}): DisplayCase {
  return {
    id: dbCase.id,
    referenceNumber: dbCase.referenceNumber,
    userId: dbCase.userId,
    createdAt: dbCase.createdAt.toISOString(),
    status: dbCase.status,
    urls: dbCase.submittedUrls.map(toDisplayUrl),
  };
}

export async function upsertVerifiedUser(
  email: string,
  ageOver18: boolean,
): Promise<{ id: string; emailHash: string }> {
  const emailHash = hashEmail(email);
  const emailEncrypted = encryptField(email);
  const user = await db.user.upsert({
    where: { emailHash },
    create: { emailHash, emailEncrypted, ageOver18, emailVerified: true, role: "VICTIM" },
    update: { emailEncrypted, lastActiveAt: new Date() },
    select: { id: true, emailHash: true },
  });
  return user;
}

export async function getVerifiedUserEmail(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailEncrypted: true } });
  return user ? decryptField(user.emailEncrypted) : null;
}

export async function isUserDeactivated(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } });
  return Boolean(user?.deactivatedAt);
}

export async function createCase(userId: string): Promise<{ id: string; referenceNumber: string }> {
  const year = new Date().getFullYear();
  const count = await db.case.count();
  const referenceNumber = `ASMITA-${year}-${String(count + 1).padStart(5, "0")}`;
  const dbCase = await db.case.create({
    data: { referenceNumber, userId, status: "OPEN" },
    select: { id: true, referenceNumber: true },
  });
  await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: dbCase.id, actorId: userId });
  return dbCase;
}

export async function getCaseForUser(caseId: string, userId: string): Promise<DisplayCase | null> {
  const dbCase = await db.case.findFirst({
    where: { id: caseId, userId },
    include: { submittedUrls: { orderBy: { submittedAt: "asc" } } },
  });
  return dbCase ? toDisplayCase(dbCase) : null;
}

export async function listCasesForUser(userId: string): Promise<DisplayCase[]> {
  const dbCases = await db.case.findMany({
    where: { userId },
    include: { submittedUrls: { orderBy: { submittedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return dbCases.map(toDisplayCase);
}

export type AddUrlResult =
  | { ok: false; rawUrl: string; error: string }
  | { ok: true; duplicate: true; url: DisplayUrl }
  | { ok: true; duplicate: false; url: DisplayUrl };

export async function addUrlsToCase(
  caseId: string,
  rawUrls: string[],
  options?: { flagReasons?: string[] },
): Promise<AddUrlResult[]> {
  const flaggedForReview = Boolean(options?.flagReasons?.length);
  const results: AddUrlResult[] = [];

  for (const rawUrl of rawUrls) {
    const parsed = parseSubmittedUrl(rawUrl);
    if (!parsed.ok) {
      results.push({ ok: false, rawUrl, error: parsed.error });
      continue;
    }

    const existing = await db.submittedUrl.findFirst({ where: { caseId, urlHash: parsed.urlHash } });
    if (existing) {
      results.push({ ok: true, duplicate: true, url: toDisplayUrl(existing) });
      continue;
    }

    const created = await db.submittedUrl.create({
      data: {
        caseId,
        urlEncrypted: encryptField(parsed.normalizedUrl),
        urlHash: parsed.urlHash,
        domain: parsed.domain,
        platformId: null,
        status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
        flaggedForReview,
        flagReason: options?.flagReasons?.join(",") ?? null,
      },
    });
    results.push({ ok: true, duplicate: false, url: toDisplayUrl(created) });
  }

  await writeAuditLog({
    eventType: "URL_SUBMITTED",
    entityType: "Case",
    entityId: caseId,
    data: { accepted: results.filter((r) => r.ok).length },
  });

  return results;
}

export async function markUrlResolved(caseId: string, userId: string, urlId?: string): Promise<void> {
  const dbCase = await db.case.findFirst({ where: { id: caseId, userId }, select: { id: true } });
  if (!dbCase) throw new Error("case_not_found");

  const url = urlId
    ? await db.submittedUrl.findFirst({ where: { id: urlId, caseId } })
    : await db.submittedUrl.findFirst({ where: { caseId }, orderBy: { submittedAt: "asc" } });

  if (!url) throw new Error("url_not_found");

  await db.submittedUrl.update({ where: { id: url.id }, data: { status: "REMOVED" } });
  await writeAuditLog({ eventType: "CONTENT_REMOVED", entityType: "SubmittedUrl", entityId: url.id });
}

export async function reviewSubmittedUrl(input: {
  caseId: string;
  urlId: string;
  decision: "approve" | "reject";
  reviewerId?: string;
  reason?: string;
}): Promise<DisplayUrl> {
  const url = await db.submittedUrl.findFirst({ where: { id: input.urlId, caseId: input.caseId } });
  if (!url) throw new Error("url_not_found");

  const updated = await db.submittedUrl.update({
    where: { id: input.urlId },
    data: {
      status: input.decision === "approve" ? "NOTICE_QUEUED" : "REJECTED",
      flaggedForReview: false,
      flagReason: input.reason ?? null,
    },
  });

  await writeAuditLog({
    eventType: input.decision === "approve" ? "URL_APPROVED" : "URL_REJECTED",
    entityType: "SubmittedUrl",
    entityId: input.urlId,
    actorId: input.reviewerId,
    data: { caseId: input.caseId, reason: input.reason },
  });

  return toDisplayUrl(updated);
}

export async function vouchCase(
  caseId: string,
  partnerName: string,
  partnerId: string,
): Promise<void> {
  const dbCase = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!dbCase) throw new Error("case_not_found");

  await db.submittedUrl.updateMany({
    where: { caseId, status: "PENDING_REVIEW" },
    data: { status: "NOTICE_QUEUED", flaggedForReview: false, flagReason: `ngo_vouched:${partnerName}` },
  });

  await db.case.update({ where: { id: caseId }, data: { ngoVerified: true } });

  await writeAuditLog({
    eventType: "NGO_VERIFIED",
    entityType: "Case",
    entityId: caseId,
    data: { partnerId, partnerName },
  });
}

export async function deactivateUser(userId: string): Promise<{ deactivatedAt: string; hardDeleteAfter: string }> {
  const deactivatedAt = new Date();
  const hardDeleteAfter = new Date(deactivatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.user.update({ where: { id: userId }, data: { deactivatedAt } });

  const cases = await db.case.findMany({ where: { userId }, select: { id: true } });
  if (cases.length > 0) {
    await db.deletionJob.createMany({
      data: cases.map((c) => ({ caseId: c.id, scheduledAt: hardDeleteAfter, status: "SCHEDULED" })),
    });
  }

  return { deactivatedAt: deactivatedAt.toISOString(), hardDeleteAfter: hardDeleteAfter.toISOString() };
}

export async function hardDeleteDueUsers(now = new Date()): Promise<string[]> {
  const dueJobs = await db.deletionJob.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    include: { case: { select: { id: true, userId: true } } },
  });

  const deletedUserIds: string[] = [];

  for (const job of dueJobs) {
    const userId = job.case.userId;
    try {
      await db.submittedUrl.deleteMany({ where: { caseId: job.case.id } });
      await db.case.update({ where: { id: job.case.id }, data: { status: "CLOSED" } });
      await db.user.update({
        where: { id: userId },
        data: {
          emailEncrypted: "deleted",
          emailHash: `deleted:${userId}`,
          deactivatedAt: null,
        },
      });
      await db.deletionJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await writeAuditLog({
        eventType: "CASE_HARD_DELETED",
        entityType: "User",
        entityId: userId,
        data: { retained: "audit_metadata_only" },
      });

      if (!deletedUserIds.includes(userId)) deletedUserIds.push(userId);
    } catch (err) {
      await db.deletionJob.update({ where: { id: job.id }, data: { status: "FAILED", error: String(err) } });
    }
  }

  return deletedUserIds;
}

export async function listAllCases(): Promise<DisplayCase[]> {
  const dbCases = await db.case.findMany({
    include: { submittedUrls: { orderBy: { submittedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return dbCases.map(toDisplayCase);
}
