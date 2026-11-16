import type { Prisma, PrismaClient } from "@prisma/client";
import type { DB } from "@/generated/kysely-types";
import { generateCaseReference } from "@/lib/case-reference";
import { encryptField, decryptField } from "@/lib/encryption";
import { hashEmail } from "@/lib/hash";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { findPlatformByDomain } from "@/lib/platforms";
import { writeAuditLog } from "@/lib/audit";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { logSecurityEvent } from "@/lib/security-log";
import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export type DisplayUrl = {
  id: string;
  domain: string;
  platformName: string;
  status: string;
  urlHash: string;
  platformId: string | null;
  hasSignedNotice?: boolean;
  flaggedForReview?: boolean;
  flagReason?: string | null;
  /** The escalation ladder's inputs (src/lib/escalation-ladder.ts). */
  platformFiledAt?: string | null;
  noticeSentAt?: string | null;
  responseType?: string | null;
  responseAt?: string | null;
};

type OriginalNotice = { sentAt: Date | string | null; responseType: string | null; responseReceivedAt: Date | string | null };

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

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
  platformId: string | null;
  signedNoticePdf?: string | null;
  flaggedForReview: boolean;
  flagReason: string | null;
  platformFiledAt?: Date | string | null;
  notices?: OriginalNotice[];
}): DisplayUrl {
  const notice = url.notices?.[0];
  return {
    id: url.id,
    domain: url.domain,
    platformName: findPlatformByDomain(url.domain)?.name ?? "Unknown – under review",
    status: url.status,
    urlHash: url.urlHash,
    platformId: url.platformId,
    hasSignedNotice: url.signedNoticePdf != null,
    flaggedForReview: url.flaggedForReview,
    flagReason: url.flagReason,
    platformFiledAt: iso(url.platformFiledAt),
    noticeSentAt: iso(notice?.sentAt),
    responseType: notice?.responseType ?? null,
    responseAt: iso(notice?.responseReceivedAt),
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
    platformId: string | null;
    signedNoticePdf?: string | null;
    flaggedForReview: boolean;
    flagReason: string | null;
    platformFiledAt?: Date | string | null;
    notices?: OriginalNotice[];
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

// In-memory user store for dev/test without a real DB.
// Keyed by emailHash → { id, emailHash }
declare global {
   
  var __asmitaUserStore: Map<string, { id: string; emailHash: string }> | undefined;
}
function devUserStore() {
  globalThis.__asmitaUserStore ??= new Map();
  return globalThis.__asmitaUserStore;
}

export async function upsertVerifiedUser(
  email: string,
  ageOver18: boolean,
): Promise<{ id: string; emailHash: string }> {
  const emailHash = hashEmail(email);

  if (isDevNoDb()) {
    const memStore = devUserStore();
    // A memory hard delete drops the user from store.ts; register them again.
    if (!memStore.has(emailHash) || store.getUserStatus(memStore.get(emailHash)!.id) === "gone") {
      const id = `dev-user-${emailHash.slice(0, 8)}`;
      memStore.set(emailHash, { id, emailHash });
      // Also register in store.ts so getVerifiedUserEmail can decrypt it.
      store.rememberVerifiedUser({ id, emailHash, emailEncrypted: encryptField(email) });
    }
    const devUser = memStore.get(emailHash)!;
    if (store.cancelUserDeletion(devUser.id)) await auditDeletionCancelled(devUser.id, 1);
    return devUser;
  }

  const emailEncrypted = encryptField(email);
  // Signing in during the pending period cancels the deletion. The upsert and
  // the cancellation share one transaction: the upsert row-locks the user, and
  // erasure re-checks deactivatedAt under its own lock, so a sweep running at
  // the same moment either finished first (the tombstoned row no longer matches
  // this email, so a fresh account is created) or sees the cancellation and skips.
  if (usesWorkerKysely()) {
    const { user, cancelledJobs } = await getWorkerDb().transaction().execute(async (tx) => {
      const row = await tx.insertInto("User").values({
        id: randomUUID(), emailHash, emailEncrypted, ageOver18, emailVerified: true, role: "VICTIM",
      }).onConflict((conflict) => conflict.column("emailHash").doUpdateSet({ emailEncrypted, lastActiveAt: new Date() }))
        .returning(["id", "emailHash"]).executeTakeFirst();
      if (!row) throw new Error("user_upsert_failed");
      const reactivated = await tx.updateTable("User").set({ deactivatedAt: null })
        .where("id", "=", row.id).where("deactivatedAt", "is not", null).returning("id").executeTakeFirst();
      if (!reactivated) return { user: row, cancelledJobs: null };
      const jobs = await tx.updateTable("DeletionJob").set({ status: "CANCELLED" })
        .where("caseId", "in", tx.selectFrom("Case").select("id").where("userId", "=", row.id))
        .where("status", "in", [...OPEN_DELETION_STATUSES]).returning("id").execute();
      return { user: row, cancelledJobs: jobs.length };
    });
    if (cancelledJobs !== null) await auditDeletionCancelled(user.id, cancelledJobs);
    return user;
  }
  const db = await getPrismaDb();
  const { user, cancelledJobs } = await db.$transaction(async (tx) => {
    const row = await tx.user.upsert({
      where: { emailHash },
      create: { emailHash, emailEncrypted, ageOver18, emailVerified: true, role: "VICTIM" },
      update: { emailEncrypted, lastActiveAt: new Date() },
      select: { id: true, emailHash: true },
    });
    const reactivated = await tx.user.updateMany({
      where: { id: row.id, deactivatedAt: { not: null } }, data: { deactivatedAt: null },
    });
    if (reactivated.count === 0) return { user: row, cancelledJobs: null };
    const jobs = await tx.deletionJob.updateMany({
      where: { case: { userId: row.id }, status: { in: [...OPEN_DELETION_STATUSES] } },
      data: { status: "CANCELLED" },
    });
    return { user: row, cancelledJobs: jobs.count };
  });
  if (cancelledJobs !== null) await auditDeletionCancelled(user.id, cancelledJobs);
  return user;
}

/** Records that a pending deletion was cancelled by signing in. No PII: the user id and a count only. */
async function auditDeletionCancelled(userId: string, cancelledJobs: number) {
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "User",
    entityId: userId,
    data: { action: "account_deletion_cancelled_by_signin", cancelledJobs },
  });
}

export async function getVerifiedUserEmail(userId: string): Promise<string | null> {
  if (isDevNoDb()) return store.getVerifiedUserEmail(userId);
  if (usesWorkerKysely()) {
    const encrypted = (await getWorkerDb().selectFrom("User").select("emailEncrypted").where("id", "=", userId).executeTakeFirst())?.emailEncrypted;
    return encrypted ? decryptField(encrypted) : null;
  }
  const db = await getPrismaDb();
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailEncrypted: true } });
  return user ? decryptField(user.emailEncrypted) : null;
}

/**
 * Whether a survivor session's account may still act: "deactivated" once
 * deletion is requested, "gone" when the account does not exist or a hard
 * delete has tombstoned it (emailHash "deleted:<id>").
 */
export async function getSessionUserStatus(userId: string): Promise<"active" | "deactivated" | "gone"> {
  if (isDevNoDb()) return store.getUserStatus(userId);
  const user = usesWorkerKysely()
    ? await getWorkerDb().selectFrom("User").select(["emailHash", "deactivatedAt"]).where("id", "=", userId).executeTakeFirst()
    : await (await getPrismaDb()).user.findUnique({ where: { id: userId }, select: { emailHash: true, deactivatedAt: true } });
  if (!user || user.emailHash.startsWith("deleted:")) return "gone";
  return user.deactivatedAt ? "deactivated" : "active";
}

export async function createCase(userId: string): Promise<{ id: string; referenceNumber: string }> {
  if (isDevNoDb()) return store.createCase(userId);
  const db = await getPrismaDb();
  let dbCase: { id: string; referenceNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !dbCase; attempt += 1) {
    const referenceNumber = generateCaseReference();
    try {
      dbCase = await db.case.create({
        data: { referenceNumber, userId, status: "OPEN" },
        select: { id: true, referenceNumber: true },
      });
    } catch (error) {
      // Unique-constraint collision on referenceNumber: regenerate.
      if ((error as { code?: string }).code !== "P2002") {
        throw error;
      }
    }
  }
  if (!dbCase) {
    throw new Error("case_reference_collision_exhausted");
  }
  await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: dbCase.id, actorId: userId });
  return dbCase;
}

async function getPrismaDb(): Promise<PrismaClient> {
  return (await import("@/lib/db")).db;
}

export type RegisterUrlError = { index: number; error: string };

export async function getRegisteredCaseByKey(
  userId: string,
  registrationKeyHash: string,
): Promise<{ id: string; referenceNumber: string; accepted: number } | null> {
  if (isDevNoDb()) {
    const record = Array.from(store.cases.values()).find(
      (item) => item.userId === userId && item.registrationKeyHash === registrationKeyHash,
    );
    return record ? { id: record.id, referenceNumber: record.referenceNumber, accepted: record.urls.length } : null;
  }
  if (usesWorkerKysely()) {
    const record = await getWorkerDb().selectFrom("Case as c")
      .leftJoin("SubmittedUrl as u", "u.caseId", "c.id")
      .select(["c.id", "c.referenceNumber"])
      .select((eb) => eb.fn.count("u.id").as("accepted"))
      .where("c.userId", "=", userId).where("c.registrationKeyHash", "=", registrationKeyHash)
      .groupBy(["c.id", "c.referenceNumber"]).executeTakeFirst();
    return record ? { id: record.id, referenceNumber: record.referenceNumber, accepted: Number(record.accepted) } : null;
  }
  const db = await getPrismaDb();
  const record = await db.case.findFirst({
    where: { userId, registrationKeyHash },
    select: { id: true, referenceNumber: true, _count: { select: { submittedUrls: true } } },
  });
  return record
    ? { id: record.id, referenceNumber: record.referenceNumber, accepted: record._count.submittedUrls }
    : null;
}

export async function registerCaseWithUrls(
  userId: string,
  rawUrls: string[],
  options?: { flagReasons?: string[]; registrationKeyHash?: string },
): Promise<
  | { ok: false; errors: RegisterUrlError[] }
  | { ok: true; id: string; referenceNumber: string; accepted: number; replayed?: true }
> {
  const errors: RegisterUrlError[] = [];
  const parsedUrls = rawUrls.map((rawUrl, index) => {
    const parsed = parseSubmittedUrl(rawUrl);
    if (!parsed.ok) errors.push({ index, error: parsed.error });
    return parsed;
  });
  if (errors.length > 0) return { ok: false, errors };

  const uniqueUrls = Array.from(
    new Map(
      parsedUrls
        .filter((parsed): parsed is Extract<typeof parsed, { ok: true }> => parsed.ok)
        .map((parsed) => [parsed.urlHash, parsed]),
    ).values(),
  );
  if (uniqueUrls.length === 0) return { ok: false, errors: [{ index: 0, error: "invalid_url" }] };

  if (options?.registrationKeyHash) {
    const existing = await getRegisteredCaseByKey(userId, options.registrationKeyHash);
    if (existing) return { ok: true, ...existing, replayed: true };
  }

  if (isDevNoDb()) {
    const record = await store.createCase(userId, options?.registrationKeyHash);
    try {
      const results = await store.addUrlsToCase(record.id, rawUrls, options);
      if (results.some((result) => !result.ok)) throw new Error("validated_url_rejected");
    } catch (error) {
      store.cases.delete(record.id);
      throw error;
    }
    return { ok: true, id: record.id, referenceNumber: record.referenceNumber, accepted: uniqueUrls.length };
  }

  const flaggedForReview = Boolean(options?.flagReasons?.length);
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referenceNumber = generateCaseReference();
      try {
        const record = await workerDb.transaction().execute(async (tx) => {
          const createdCase = await tx.insertInto("Case").values({
            id: randomUUID(), referenceNumber, userId, registrationKeyHash: options?.registrationKeyHash ?? null, status: "OPEN",
            hashAdvisoryPlatformIds: [], createdAt: new Date(), updatedAt: new Date(),
          }).returning(["id", "referenceNumber"]).executeTakeFirstOrThrow();
          for (const parsed of uniqueUrls) {
            const platform = parsed.platform
              ? await tx.selectFrom("Platform").select("id")
                .where(sql<boolean>`${parsed.domain} = ANY("domainPatterns") OR ${`www.${parsed.domain}`} = ANY("domainPatterns")`)
                .executeTakeFirst()
              : null;
            await tx.insertInto("SubmittedUrl").values({
              id: randomUUID(), caseId: createdCase.id, urlEncrypted: encryptField(parsed.normalizedUrl), urlHash: parsed.urlHash,
              domain: parsed.domain, platformId: platform?.id ?? null,
              status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
              flaggedForReview, flagReason: options?.flagReasons?.join(",") ?? null,
            }).execute();
          }
          return createdCase;
        });
        await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: record.id, actorId: userId });
        await writeAuditLog({ eventType: "URL_SUBMITTED", entityType: "Case", entityId: record.id, actorId: userId, data: { accepted: uniqueUrls.length } });
        return { ok: true, ...record, accepted: uniqueUrls.length };
      } catch (error) {
        if (options?.registrationKeyHash && (error as { code?: string }).code === "23505") {
          const existing = await getRegisteredCaseByKey(userId, options.registrationKeyHash);
          if (existing) return { ok: true, ...existing, replayed: true };
        } else if ((error as { code?: string }).code !== "23505") {
          throw error;
        }
      }
    }
    throw new Error("case_reference_collision_exhausted");
  }
  const db = await getPrismaDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceNumber = generateCaseReference();
    try {
      const record = await db.$transaction(async (tx) => {
        const createdCase = await tx.case.create({
          data: { referenceNumber, userId, registrationKeyHash: options?.registrationKeyHash, status: "OPEN" },
          select: { id: true, referenceNumber: true },
        });
        for (const parsed of uniqueUrls) {
          const dbPlatform = parsed.platform
            ? await tx.platform.findFirst({
                where: {
                  OR: [
                    { domainPatterns: { has: parsed.domain } },
                    { domainPatterns: { has: `www.${parsed.domain}` } },
                  ],
                },
                select: { id: true },
              })
            : null;
          await tx.submittedUrl.create({
            data: {
              caseId: createdCase.id,
              urlEncrypted: encryptField(parsed.normalizedUrl),
              urlHash: parsed.urlHash,
              domain: parsed.domain,
              platformId: dbPlatform?.id ?? null,
              status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
              flaggedForReview,
              flagReason: options?.flagReasons?.join(",") ?? null,
            },
          });
        }
        return createdCase;
      });
      await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: record.id, actorId: userId });
      await writeAuditLog({
        eventType: "URL_SUBMITTED",
        entityType: "Case",
        entityId: record.id,
        actorId: userId,
        data: { accepted: uniqueUrls.length },
      });
      return { ok: true, ...record, accepted: uniqueUrls.length };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      if (options?.registrationKeyHash) {
        const existing = await getRegisteredCaseByKey(userId, options.registrationKeyHash);
        if (existing) return { ok: true, ...existing, replayed: true };
      }
    }
  }
  throw new Error("case_reference_collision_exhausted");
}

export async function getCaseForUser(caseId: string, userId: string): Promise<DisplayCase | null> {
  if (isDevNoDb()) {
    const rec = store.cases.get(caseId);
    if (!rec || rec.userId !== userId) return null;
    return { id: rec.id, referenceNumber: rec.referenceNumber, userId: rec.userId, createdAt: rec.createdAt, status: rec.status, urls: rec.urls };
  }
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    const record = await workerDb.selectFrom("Case").selectAll().where("id", "=", caseId).where("userId", "=", userId).executeTakeFirst();
    if (!record) return null;
    const urls = await workerDb.selectFrom("SubmittedUrl").selectAll().where("caseId", "=", caseId).orderBy("submittedAt", "asc").execute();
    // The original notice per link (not its follow-ups) feeds the escalation ladder.
    const notices = urls.length
      ? await workerDb.selectFrom("Notice").select(["urlId", "sentAt", "responseType", "responseReceivedAt"])
        .where("urlId", "in", urls.map((url) => url.id)).where("followUpOf", "is", null).where("sentAt", "is not", null)
        .orderBy("sentAt", "asc").execute()
      : [];
    return toDisplayCase({
      ...record,
      createdAt: new Date(record.createdAt),
      submittedUrls: urls.map((url) => ({
        ...url,
        submittedAt: new Date(url.submittedAt),
        notices: notices.filter((notice) => notice.urlId === url.id),
      })),
    });
  }
  const db = await getPrismaDb();
  const dbCase = await db.case.findFirst({
    where: { id: caseId, userId },
    include: {
      submittedUrls: {
        orderBy: { submittedAt: "asc" },
        include: {
          notices: {
            where: { followUpOf: null, sentAt: { not: null } },
            orderBy: { sentAt: "asc" },
            take: 1,
            select: { sentAt: true, responseType: true, responseReceivedAt: true },
          },
        },
      },
    },
  });
  return dbCase ? toDisplayCase(dbCase) : null;
}

export async function listCasesForUser(userId: string): Promise<DisplayCase[]> {
  if (isDevNoDb()) {
    return Array.from(store.cases.values())
      .filter((rec) => rec.userId === userId)
      .map((rec) => ({ id: rec.id, referenceNumber: rec.referenceNumber, userId: rec.userId, createdAt: rec.createdAt, status: rec.status, urls: rec.urls }));
  }
  if (usesWorkerKysely()) {
    const workerDb = getWorkerDb();
    const records = await workerDb.selectFrom("Case").selectAll().where("userId", "=", userId).orderBy("createdAt", "desc").execute();
    return Promise.all(records.map(async (record) => {
      const urls = await workerDb.selectFrom("SubmittedUrl").selectAll().where("caseId", "=", record.id).orderBy("submittedAt", "asc").execute();
      return toDisplayCase({ ...record, submittedUrls: urls });
    }));
  }
  const db = await getPrismaDb();
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
  if (isDevNoDb()) return store.addUrlsToCase(caseId, rawUrls, options);
  const db = await getPrismaDb();
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

    const dbPlatform = parsed.platform
      ? await db.platform.findFirst({
          where: {
            OR: [
              { domainPatterns: { has: parsed.domain } },
              { domainPatterns: { has: `www.${parsed.domain}` } },
            ],
          },
          select: { id: true },
        })
      : null;

    const created = await db.submittedUrl.create({
      data: {
        caseId,
        urlEncrypted: encryptField(parsed.normalizedUrl),
        urlHash: parsed.urlHash,
        domain: parsed.domain,
        platformId: dbPlatform?.id ?? null,
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
  if (isDevNoDb()) {
    const record = store.cases.get(caseId);
    if (!record || record.userId !== userId) throw new Error("case_not_found");
    const url = urlId ? record.urls.find((item) => item.id === urlId) : record.urls[0];
    if (!url) throw new Error("url_not_found");
    url.status = "REMOVED";
    await writeAuditLog({ eventType: "CONTENT_REMOVED", entityType: "SubmittedUrl", entityId: url.id, actorId: userId });
    return;
  }
  const db = await getPrismaDb();
  const dbCase = await db.case.findFirst({ where: { id: caseId, userId }, select: { id: true } });
  if (!dbCase) throw new Error("case_not_found");

  const url = urlId
    ? await db.submittedUrl.findFirst({ where: { id: urlId, caseId } })
    : await db.submittedUrl.findFirst({ where: { caseId }, orderBy: { submittedAt: "asc" } });

  if (!url) throw new Error("url_not_found");

  await db.submittedUrl.update({ where: { id: url.id }, data: { status: "REMOVED" } });
  await writeAuditLog({ eventType: "CONTENT_REMOVED", entityType: "SubmittedUrl", entityId: url.id });
}

/** The survivor filed a form-only platform's own form: start that link's ladder. */
export async function markPlatformFiled(caseId: string, userId: string, urlId: string, filedAt = new Date()): Promise<void> {
  if (isDevNoDb()) {
    const record = store.cases.get(caseId);
    if (!record || record.userId !== userId) throw new Error("case_not_found");
    const url = record.urls.find((item) => item.id === urlId);
    if (!url) throw new Error("url_not_found");
    url.platformFiledAt ??= filedAt.toISOString();
    return;
  }
  const db = await getPrismaDb();
  const url = await db.submittedUrl.findFirst({
    where: { id: urlId, caseId, case: { userId } },
    select: { id: true },
  });
  if (!url) throw new Error("url_not_found");
  // The first filing date is the one the platform's clock runs from. One
  // conditional update, so two quick taps cannot both record a filing.
  const { count } = await db.submittedUrl.updateMany({ where: { id: url.id, platformFiledAt: null }, data: { platformFiledAt: filedAt } });
  if (count === 1) {
    await writeAuditLog({ eventType: "PLATFORM_FORM_FILED", entityType: "SubmittedUrl", entityId: url.id, actorId: userId });
  }
}

/**
 * A link waits for a human decision while it is pending review, or flagged
 * after being queued. Anything else (sent, removed, rejected) is decided.
 */
export function isAwaitingReview(url: { status: string; flaggedForReview?: boolean | null }) {
  return url.status === "PENDING_REVIEW" || (Boolean(url.flaggedForReview) && url.status === "NOTICE_QUEUED");
}

const AWAITING_REVIEW_WHERE = [
  { status: "PENDING_REVIEW" as const },
  { flaggedForReview: true, status: "NOTICE_QUEUED" as const },
];

export async function reviewSubmittedUrl(input: {
  caseId: string;
  urlId: string;
  decision: "approve" | "reject";
  reviewerId?: string;
  reason?: string;
}): Promise<DisplayUrl> {
  const db = await getPrismaDb();
  const url = await db.submittedUrl.findFirst({ where: { id: input.urlId, caseId: input.caseId } });
  if (!url) throw new Error("url_not_found");
  if (!isAwaitingReview(url)) throw new Error("not_awaiting_review");
  if (input.decision === "approve" && !url.platformId) throw new Error("unknown_platform_requires_investigation");

  // The status guard is in the update itself, so two reviewers acting at once
  // cannot both decide the link, and a sent, removed or rejected link is never
  // put back in the queue.
  const changed = await db.submittedUrl.updateMany({
    where: { id: input.urlId, caseId: input.caseId, OR: AWAITING_REVIEW_WHERE },
    data: {
      status: input.decision === "approve" ? "NOTICE_QUEUED" : "REJECTED",
      flaggedForReview: false,
      flagReason: input.reason ?? null,
    },
  });
  if (changed.count === 0) throw new Error("not_awaiting_review");
  const updated = await db.submittedUrl.findUniqueOrThrow({ where: { id: input.urlId } });

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
  const db = await getPrismaDb();
  const dbCase = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!dbCase) throw new Error("case_not_found");

  await db.submittedUrl.updateMany({
    where: { caseId, status: "PENDING_REVIEW", platformId: { not: null } },
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
  if (isDevNoDb()) return store.deactivateUser(userId);
  const db = await getPrismaDb();
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

// What a hard delete leaves behind, recorded in the CASE_HARD_DELETED audit
// entry. Everything else about the survivor and their cases is deleted or cleared.
export const HARD_DELETE_RETAINED = {
  user: "id, role, verification flags, declared age and created date; no email or email hash",
  case: "id, reference number, status CLOSED, NGO-verified flag and created/updated dates",
  fingerprints: "stored encrypted, kept so platforms can keep blocking matching images; with their dispatch records (platform and date, no link to a deleted notice)",
  deletionJob: "id, case id, dates and status",
  adminAccessLog: "which admin opened which case or link, and when; the reason text is cleared",
  auditLog: "earlier entries are append-only and unchanged",
} as const;

// A failed deletion is marked FAILED and retried by every later sweep until it
// succeeds. FAILED rows are what countFailedDeletionJobs reports.
const OPEN_DELETION_STATUSES = ["SCHEDULED", "FAILED"] as const;

export type HardDeleteCounts = {
  cases: number;
  links: number;
  notices: number;
  escalations: number;
  deliveryProofs: number;
  feedback: number;
  sessions: number;
  otpCodes: number;
};

function emptyHardDeleteCounts(cases: number): HardDeleteCounts {
  return {
    cases, links: 0, notices: 0, escalations: 0, deliveryProofs: 0, feedback: 0, sessions: 0, otpCodes: 0,
  };
}

/** A short, PII-free label for a failed deletion: an error code and constraint, never a message. */
function deletionErrorCode(err: unknown): string {
  const e = err as { code?: unknown; constraint?: unknown; meta?: { constraint?: unknown } } | null;
  const parts = [e?.code, e?.constraint ?? e?.meta?.constraint]
    .filter((part): part is string => typeof part === "string" && /^[\w.:-]{1,80}$/.test(part));
  if (parts.length) return parts.join(" ");
  return err instanceof Error && /^\w{1,40}$/.test(err.name) ? err.name : "unknown_error";
}

function messageIdsFromAudit(rows: Array<{ data: unknown }>): string[] {
  return rows.flatMap(({ data }) => {
    const messageId = (data as { messageId?: unknown } | null)?.messageId;
    return typeof messageId === "string" && messageId ? [messageId] : [];
  });
}

/**
 * Erases one user and every case they own inside the caller's transaction.
 * Rows that carry the survivor's content or contact are deleted children
 * first (every foreign key here is RESTRICT); the User and Case rows stay as
 * cleared tombstones so deletion jobs and the append-only audit log still
 * point at something.
 */
async function eraseUserWithKysely(tx: Transaction<DB>, userId: string, now: Date): Promise<HardDeleteCounts | null> {
  // Lock the user row and re-check the deletion is still pending. Signing in
  // clears deactivatedAt under the same row lock (upsertVerifiedUser), so
  // whichever transaction takes the lock first wins and the other sees its result.
  const pending = await tx.selectFrom("User").select("id").where("id", "=", userId)
    .where("deactivatedAt", "is not", null).forUpdate().executeTakeFirst();
  if (!pending) return null;
  const caseRows = await tx.selectFrom("Case").select(["id", "referenceNumber"]).where("userId", "=", userId).forUpdate().execute();
  const caseIds = caseRows.map((row) => row.id);
  const user = await tx.selectFrom("User").select("emailHash").where("id", "=", userId).executeTakeFirst();
  const counts = emptyHardDeleteCounts(caseIds.length);
  const deleted = (result: Array<{ numDeletedRows: bigint }>) => Number(result[0]?.numDeletedRows ?? 0);

  if (caseIds.length) {
    const urlIds = (await tx.selectFrom("SubmittedUrl").select("id").where("caseId", "in", caseIds).execute()).map((r) => r.id);
    const notices = urlIds.length
      ? await tx.selectFrom("Notice").select(["id", "messageId"]).where("urlId", "in", urlIds).execute()
      : [];
    const noticeIds = notices.map((n) => n.id);
    // Fingerprints (HashSubmission) and their dispatch records are kept, so platforms can keep blocking.
    // Hash advisories have no Notice row; their message ids are only in the audit log.
    const advisoryAudit = await tx.selectFrom("audit_log").select("data")
      .where("eventType", "=", "HASH_DISPATCHED").where("entityId", "in", caseIds).execute();
    const messageIds = [
      ...notices.flatMap((n) => (n.messageId ? [n.messageId] : [])),
      ...messageIdsFromAudit(advisoryAudit),
    ];

    if (messageIds.length) {
      counts.deliveryProofs = deleted(await tx.deleteFrom("EmailDeliveryProof").where("messageId", "in", messageIds).execute());
    }
    if (noticeIds.length) {
      // A kept dispatch must not point at a notice that is about to be deleted.
      await tx.updateTable("HashDispatch").set({ noticeId: null }).where("noticeId", "in", noticeIds).execute();
      counts.escalations = deleted(await tx.deleteFrom("Escalation").where("noticeId", "in", noticeIds).execute());
      counts.notices = deleted(await tx.deleteFrom("Notice").where("id", "in", noticeIds).execute());
    }
    if (urlIds.length) {
      await tx.deleteFrom("UrlPortalToken").where("urlId", "in", urlIds).execute();
      counts.links = deleted(await tx.deleteFrom("SubmittedUrl").where("id", "in", urlIds).execute());
    }
    counts.feedback = deleted(await tx.deleteFrom("Feedback").where((eb) => eb.or([
      eb("caseId", "in", caseIds),
      eb("caseReference", "in", caseRows.map((row) => row.referenceNumber)),
    ])).execute());
    await tx.updateTable("AdminAccessLog").set({ reason: null }).where("entityId", "in", [...caseIds, ...urlIds]).execute();
    await tx.updateTable("Case").set({
      status: "CLOSED", registrationKeyHash: null, state: null, city: null, ngoVerifierId: null,
      declarationSignedAt: null, declarationIpHash: null, firPackageGeneratedAt: null,
      signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [], hashAdvisorySignedHashIds: [],
      hashAdvisorySignedTemplateId: null, hashAdvisorySignedTemplateDigest: null, updatedAt: now,
    }).where("id", "in", caseIds).execute();
    await tx.updateTable("DeletionJob").set({ status: "COMPLETED", completedAt: now, error: null })
      .where("caseId", "in", caseIds).where("status", "in", [...OPEN_DELETION_STATUSES]).execute();
  }

  counts.sessions = deleted(await tx.deleteFrom("SessionToken").where("userId", "=", userId).execute());
  if (user && !user.emailHash.startsWith("deleted:")) {
    counts.otpCodes = deleted(await tx.deleteFrom("OtpToken").where("emailHash", "=", user.emailHash).execute());
  }
  await tx.updateTable("User").set({
    emailEncrypted: "deleted", emailHash: `deleted:${userId}`, deactivatedAt: null, preferredLocale: null, lastActiveAt: null,
  }).where("id", "=", userId).execute();
  return counts;
}

/** The Prisma (Node) twin of eraseUserWithKysely; keep the two in step. */
async function eraseUserWithPrisma(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<HardDeleteCounts | null> {
  // Claim the user row (the UPDATE takes the row lock) only while the deletion
  // is still pending; signing in clears deactivatedAt under the same lock, so
  // whichever transaction goes first wins. Erasure clears the column below anyway.
  const claimed = await tx.user.updateMany({ where: { id: userId, deactivatedAt: { not: null } }, data: { deactivatedAt: now } });
  if (claimed.count === 0) return null;
  const caseRows = await tx.case.findMany({ where: { userId }, select: { id: true, referenceNumber: true } });
  const caseIds = caseRows.map((row) => row.id);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { emailHash: true } });
  const counts = emptyHardDeleteCounts(caseIds.length);

  if (caseIds.length) {
    const urlIds = (await tx.submittedUrl.findMany({ where: { caseId: { in: caseIds } }, select: { id: true } })).map((r) => r.id);
    const notices = await tx.notice.findMany({ where: { urlId: { in: urlIds } }, select: { id: true, messageId: true } });
    const noticeIds = notices.map((n) => n.id);
    // Fingerprints (HashSubmission) and their dispatch records are kept, so platforms can keep blocking.
    // Hash advisories have no Notice row; their message ids are only in the audit log.
    const advisoryAudit = await tx.auditLog.findMany({
      where: { eventType: "HASH_DISPATCHED", entityId: { in: caseIds } }, select: { data: true },
    });
    const messageIds = [
      ...notices.flatMap((n) => (n.messageId ? [n.messageId] : [])),
      ...messageIdsFromAudit(advisoryAudit),
    ];

    counts.deliveryProofs = (await tx.emailDeliveryProof.deleteMany({ where: { messageId: { in: messageIds } } })).count;
    // A kept dispatch must not point at a notice that is about to be deleted.
    await tx.hashDispatch.updateMany({ where: { noticeId: { in: noticeIds } }, data: { noticeId: null } });
    counts.escalations = (await tx.escalation.deleteMany({ where: { noticeId: { in: noticeIds } } })).count;
    counts.notices = (await tx.notice.deleteMany({ where: { id: { in: noticeIds } } })).count;
    await tx.urlPortalToken.deleteMany({ where: { urlId: { in: urlIds } } });
    counts.links = (await tx.submittedUrl.deleteMany({ where: { id: { in: urlIds } } })).count;
    counts.feedback = (await tx.feedback.deleteMany({
      where: { OR: [{ caseId: { in: caseIds } }, { caseReference: { in: caseRows.map((row) => row.referenceNumber) } }] },
    })).count;
    await tx.adminAccessLog.updateMany({ where: { entityId: { in: [...caseIds, ...urlIds] } }, data: { reason: null } });
    await tx.case.updateMany({
      where: { id: { in: caseIds } },
      data: {
        status: "CLOSED", registrationKeyHash: null, state: null, city: null, ngoVerifierId: null,
        declarationSignedAt: null, declarationIpHash: null, firPackageGeneratedAt: null,
        signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [], hashAdvisorySignedHashIds: [],
        hashAdvisorySignedTemplateId: null, hashAdvisorySignedTemplateDigest: null, updatedAt: now,
      },
    });
    await tx.deletionJob.updateMany({
      where: { caseId: { in: caseIds }, status: { in: [...OPEN_DELETION_STATUSES] } },
      data: { status: "COMPLETED", completedAt: now, error: null },
    });
  }

  counts.sessions = (await tx.sessionToken.deleteMany({ where: { userId } })).count;
  if (user && !user.emailHash.startsWith("deleted:")) {
    counts.otpCodes = (await tx.otpToken.deleteMany({ where: { emailHash: user.emailHash } })).count;
  }
  await tx.user.update({
    where: { id: userId },
    data: { emailEncrypted: "deleted", emailHash: `deleted:${userId}`, deactivatedAt: null, preferredLocale: null, lastActiveAt: null },
  });
  return counts;
}

/**
 * Hard-deletes every user with a deletion due (cancelled jobs are never
 * selected, and a user whose deletion was cancelled meanwhile is skipped). Each user is erased in one
 * transaction, so a failure leaves nothing half-deleted; that user's jobs are
 * then marked FAILED (with an error code, never PII), logged, and retried on
 * every later sweep until they succeed.
 */
export async function hardDeleteDueUsers(now = new Date()): Promise<string[]> {
  if (isDevNoDb()) return store.hardDeleteDueUsers(now);

  const kysely = usesWorkerKysely();
  const dueJobs = kysely
    ? await getWorkerDb().selectFrom("DeletionJob as j")
      .innerJoin("Case as c", "c.id", "j.caseId")
      .select(["j.id as jobId", "c.userId"])
      .where("j.status", "in", [...OPEN_DELETION_STATUSES])
      .where("j.scheduledAt", "<=", now)
      .execute()
    : (await (await getPrismaDb()).deletionJob.findMany({
      where: { status: { in: [...OPEN_DELETION_STATUSES] }, scheduledAt: { lte: now } },
      select: { id: true, case: { select: { userId: true } } },
    })).map((job) => ({ jobId: job.id, userId: job.case.userId }));

  const jobsByUser = new Map<string, string[]>();
  for (const job of dueJobs) jobsByUser.set(job.userId, [...(jobsByUser.get(job.userId) ?? []), job.jobId]);

  const deletedUserIds: string[] = [];
  for (const [userId, jobIds] of jobsByUser) {
    try {
      const counts = kysely
        ? await getWorkerDb().transaction().execute((tx) => eraseUserWithKysely(tx, userId, now))
        : await (await getPrismaDb()).$transaction((tx) => eraseUserWithPrisma(tx, userId, now));
      // null: the survivor signed in and cancelled the deletion after the due jobs were read.
      if (!counts) continue;
      await writeAuditLog({
        eventType: "CASE_HARD_DELETED",
        entityType: "User",
        entityId: userId,
        data: { removed: counts, retained: HARD_DELETE_RETAINED },
      });
      deletedUserIds.push(userId);
    } catch (err) {
      const error = deletionErrorCode(err);
      try {
        if (kysely) {
          await getWorkerDb().updateTable("DeletionJob").set({ status: "FAILED", error })
            .where("id", "in", jobIds).where("status", "in", [...OPEN_DELETION_STATUSES]).execute();
        } else {
          await (await getPrismaDb()).deletionJob.updateMany({
            where: { id: { in: jobIds }, status: { in: [...OPEN_DELETION_STATUSES] } },
            data: { status: "FAILED", error },
          });
        }
      } finally {
        await logSecurityEvent({ event: "account_deletion_failed", route: "cron:sweep-due-jobs", reason: error });
      }
    }
  }
  return deletedUserIds;
}

/** Deletions whose last attempt failed and that wait for the next sweep. */
export async function countFailedDeletionJobs(): Promise<number> {
  if (isDevNoDb()) return 0;
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("DeletionJob")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("status", "=", "FAILED").executeTakeFirst();
    return Number(row?.count ?? 0);
  }
  return (await getPrismaDb()).deletionJob.count({ where: { status: "FAILED" } });
}

export async function listAllCases(): Promise<DisplayCase[]> {
  if (isDevNoDb()) {
    return Array.from(store.cases.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        id: record.id,
        referenceNumber: record.referenceNumber,
        userId: record.userId,
        createdAt: record.createdAt,
        status: record.status,
        urls: record.urls.map((url) => ({ ...url, flagReason: url.flagReason ?? null })),
      }));
  }
  const db = await getPrismaDb();
  const dbCases = await db.case.findMany({
    include: { submittedUrls: { orderBy: { submittedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return dbCases.map(toDisplayCase);
}
