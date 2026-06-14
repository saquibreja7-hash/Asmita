import { randomUUID } from "node:crypto";
import { generateCaseReference } from "@/lib/case-reference";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashEmail, sha256 } from "@/lib/hash";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { writeAuditLog } from "@/lib/audit";

export type CaseRecord = {
  id: string;
  referenceNumber: string;
  userId: string;
  createdAt: string;
  status: "OPEN" | "RESOLVED";
  urls: UrlRecord[];
};

export type UrlRecord = {
  id: string;
  domain: string;
  platformName: string;
  status: "PENDING_REVIEW" | "NOTICE_QUEUED" | "REMOVED" | "REJECTED";
  urlHash: string;
  platformId: string | null;
  flaggedForReview?: boolean;
  flagReason?: string;
};

type StoreGlobals = {
  cases?: Map<string, CaseRecord>;
  deactivatedUsers?: Map<string, { deactivatedAt: string; hardDeleteAfter: string }>;
  users?: Map<string, { emailHash: string; emailEncrypted: string }>;
};

function assertDevOrTest() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[store.ts] In-memory store cannot be used in production. All data paths must use case-ops.ts (Prisma).",
    );
  }
}

const storeGlobals = globalThis as typeof globalThis & { __asmitaStore?: StoreGlobals };
storeGlobals.__asmitaStore ??= {};

export const cases = (storeGlobals.__asmitaStore.cases ??= new Map<string, CaseRecord>());
export const deactivatedUsers = (storeGlobals.__asmitaStore.deactivatedUsers ??= new Map<
  string,
  { deactivatedAt: string; hardDeleteAfter: string }
>());
export const users = (storeGlobals.__asmitaStore.users ??= new Map<
  string,
  { emailHash: string; emailEncrypted: string }
>());

export function createReferenceNumber() {
  return generateCaseReference();
}

export async function createCase(userId: string) {
  assertDevOrTest();
  const record: CaseRecord = {
    id: randomUUID(),
    referenceNumber: createReferenceNumber(),
    userId,
    createdAt: new Date().toISOString(),
    status: "OPEN",
    urls: [],
  };
  cases.set(record.id, record);
  await writeAuditLog({
    eventType: "CASE_CREATED",
    entityType: "Case",
    entityId: record.id,
    actorId: userId,
  });
  return record;
}

export function ensureCaseForUser(caseId: string, userId: string) {
  const existing = cases.get(caseId);
  if (existing) return existing;
  const record: CaseRecord = {
    id: caseId,
    referenceNumber: createReferenceNumber(),
    userId,
    createdAt: new Date().toISOString(),
    status: "OPEN",
    urls: [],
  };
  cases.set(record.id, record);
  return record;
}

export async function addUrlsToCase(caseId: string, rawUrls: string[], options?: { flagReasons?: string[] }) {
  assertDevOrTest();
  const record = cases.get(caseId);
  if (!record) throw new Error("case_not_found");
  const flaggedForReview = Boolean(options?.flagReasons?.length);

  const results = rawUrls.map((rawUrl) => {
    const parsed = parseSubmittedUrl(rawUrl);
    if (!parsed.ok) {
      return { ok: false as const, rawUrl, error: parsed.error };
    }
    const duplicate = record.urls.find((url) => url.urlHash === parsed.urlHash);
    if (duplicate) {
      return { ok: true as const, duplicate: true, url: duplicate };
    }
    const url: UrlRecord = {
      id: randomUUID(),
      domain: parsed.domain,
      platformName: parsed.platform?.name || "Unknown - will be reviewed",
      status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
      urlHash: parsed.urlHash,
      platformId: null,
      flaggedForReview,
      flagReason: options?.flagReasons?.join(","),
    };
    record.urls.push(url);
    return { ok: true as const, duplicate: false, url };
  });

  await writeAuditLog({
    eventType: "URL_SUBMITTED",
    entityType: "Case",
    entityId: caseId,
    data: { accepted: results.filter((result) => result.ok).length },
  });

  return results;
}

export function ensureDemoCase(userId = "demo-user") {
  const existing = Array.from(cases.values()).find((item) => item.userId === userId);
  if (existing) return existing;
  const record: CaseRecord = {
    id: "demo-case",
    referenceNumber: `ASMITA-${new Date().getFullYear()}-00001`,
    userId,
    createdAt: new Date().toISOString(),
    status: "OPEN",
    urls: [
      {
        id: "demo-url-1",
        domain: "instagram.com",
        platformName: "Instagram / Meta",
        status: "NOTICE_QUEUED",
        urlHash: sha256("https://instagram.com/p/example"),
        platformId: null,
      },
      {
        id: "demo-url-2",
        domain: "pornhub.com",
        platformName: "Pornhub",
        status: "PENDING_REVIEW",
        urlHash: sha256("https://pornhub.com/view_video.php?viewkey=example"),
        platformId: null,
      },
    ],
  };
  cases.set(record.id, record);
  return record;
}

export function createUserTokenMaterial(email: string) {
  assertDevOrTest();
  return {
    id: hashEmail(email).slice(0, 24),
    emailHash: hashEmail(email),
    emailEncrypted: encryptField(email),
  };
}

export function rememberVerifiedUser(user: { id: string; emailHash: string; emailEncrypted: string }) {
  assertDevOrTest();
  users.set(user.id, {
    emailHash: user.emailHash,
    emailEncrypted: user.emailEncrypted,
  });
}

export function getVerifiedUserEmail(userId: string) {
  assertDevOrTest();
  const user = users.get(userId);
  if (!user) return null;
  return decryptField(user.emailEncrypted);
}

export function deactivateUser(userId: string) {
  assertDevOrTest();
  const deactivatedAt = new Date();
  const hardDeleteAfter = new Date(deactivatedAt);
  hardDeleteAfter.setDate(hardDeleteAfter.getDate() + 30);
  deactivatedUsers.set(userId, {
    deactivatedAt: deactivatedAt.toISOString(),
    hardDeleteAfter: hardDeleteAfter.toISOString(),
  });
  return deactivatedUsers.get(userId)!;
}

export async function hardDeleteDueUsers(now = new Date()) {
  assertDevOrTest();
  const deletedUserIds: string[] = [];
  for (const [userId, deletion] of deactivatedUsers.entries()) {
    if (new Date(deletion.hardDeleteAfter).getTime() > now.getTime()) {
      continue;
    }

    users.delete(userId);
    for (const [caseId, record] of cases.entries()) {
      if (record.userId === userId) {
        cases.delete(caseId);
      }
    }
    deactivatedUsers.delete(userId);
    deletedUserIds.push(userId);
    await writeAuditLog({
      eventType: "CASE_HARD_DELETED",
      entityType: "User",
      entityId: userId,
      data: { retained: "audit_metadata_only" },
    });
  }
  return deletedUserIds;
}

export async function reviewSubmittedUrl(input: {
  caseId: string;
  urlId: string;
  decision: "approve" | "reject";
  reviewerId?: string;
  reason?: string;
}) {
  assertDevOrTest();
  const record = cases.get(input.caseId);
  const url = record?.urls.find((item) => item.id === input.urlId);
  if (!url) {
    throw new Error("url_not_found");
  }

  url.flaggedForReview = false;
  url.flagReason = input.reason;
  url.status = input.decision === "approve" ? "NOTICE_QUEUED" : "REJECTED";
  await writeAuditLog({
    eventType: input.decision === "approve" ? "URL_APPROVED" : "URL_REJECTED",
    entityType: "SubmittedUrl",
    entityId: url.id,
    actorId: input.reviewerId,
    data: { caseId: input.caseId, reason: input.reason },
  });

  return url;
}
