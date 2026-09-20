import type { PrismaClient } from "@prisma/client";
import { generateCaseReference } from "@/lib/case-reference";
import { encryptField, decryptField } from "@/lib/encryption";
import { hashEmail } from "@/lib/hash";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { findPlatformByDomain } from "@/lib/platforms";
import { writeAuditLog } from "@/lib/audit";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";

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
  platformId: string | null;
  signedNoticePdf?: string | null;
  flaggedForReview: boolean;
  flagReason: string | null;
}): DisplayUrl {
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
    if (!memStore.has(emailHash)) {
      const id = `dev-user-${emailHash.slice(0, 8)}`;
      memStore.set(emailHash, { id, emailHash });
      // Also register in store.ts so getVerifiedUserEmail can decrypt it.
      store.rememberVerifiedUser({ id, emailHash, emailEncrypted: encryptField(email) });
    }
    return memStore.get(emailHash)!;
  }

  const emailEncrypted = encryptField(email);
  if (usesWorkerKysely()) {
    const user = await getWorkerDb().insertInto("User").values({
      id: randomUUID(), emailHash, emailEncrypted, ageOver18, emailVerified: true, role: "VICTIM",
    }).onConflict((conflict) => conflict.column("emailHash").doUpdateSet({ emailEncrypted, lastActiveAt: new Date() }))
      .returning(["id", "emailHash"]).executeTakeFirst();
    if (!user) throw new Error("user_upsert_failed");
    return user;
  }
  const db = await getPrismaDb();
  const user = await db.user.upsert({
    where: { emailHash },
    create: { emailHash, emailEncrypted, ageOver18, emailVerified: true, role: "VICTIM" },
    update: { emailEncrypted, lastActiveAt: new Date() },
    select: { id: true, emailHash: true },
  });
  return user;
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

export async function isUserDeactivated(userId: string): Promise<boolean> {
  if (isDevNoDb()) return false;
  if (usesWorkerKysely()) return Boolean((await getWorkerDb().selectFrom("User").select("deactivatedAt").where("id", "=", userId).executeTakeFirst())?.deactivatedAt);
  const db = await getPrismaDb();
  const user = await db.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } });
  return Boolean(user?.deactivatedAt);
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
    return toDisplayCase({ ...record, createdAt: new Date(record.createdAt), submittedUrls: urls.map((url) => ({ ...url, submittedAt: new Date(url.submittedAt) })) });
  }
  const db = await getPrismaDb();
  const dbCase = await db.case.findFirst({
    where: { id: caseId, userId },
    include: { submittedUrls: { orderBy: { submittedAt: "asc" } } },
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
  const db = await getPrismaDb();
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

export async function hardDeleteDueUsers(now = new Date()): Promise<string[]> {
  const db = await getPrismaDb();
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
