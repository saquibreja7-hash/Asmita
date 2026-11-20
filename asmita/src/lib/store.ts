import { randomUUID } from "node:crypto";
import { generateCaseReference } from "@/lib/case-reference";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashEmail, sha256 } from "@/lib/hash";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { writeAuditLog } from "@/lib/audit";
import { eraseCrawlMemoryForCases } from "@/lib/crawl-store";

export type CaseRecord = {
  id: string;
  referenceNumber: string;
  userId: string;
  registrationKeyHash?: string | null;
  createdAt: string;
  status: "OPEN" | "RESOLVED";
  /** "Watch for my images" (WP22): a watch holds fingerprints and no links. */
  mode?: "CASE" | "WATCH";
  urls: UrlRecord[];
  signedHashAdvisoryPdf?: string | null;
  hashAdvisoryPlatformIds?: string[];
};

export type UrlRecord = {
  id: string;
  domain: string;
  platformName: string;
  // NOTICE_SENT only appears through the removal re-check finding the content
  // back online (link-verification.ts): nothing is sent from the memory store.
  status: "PENDING_REVIEW" | "NOTICE_QUEUED" | "NOTICE_SENT" | "REMOVED" | "REJECTED";
  urlHash: string;
  platformId: string | null;
  flaggedForReview?: boolean;
  flagReason?: string;
  platformFiledAt?: string | null;
  /** CRAWLER when the link came from an approved crawler finding (crawl-findings.ts). */
  source?: "SURVIVOR" | "CRAWLER";
  crawlFindingId?: string;
  /** Crawler links: set when the survivor withdrew her crawl authorisation before a notice went out. */
  crawlConsentWithdrawnAt?: string | null;
  /**
   * false until the hourly sweep looked at this link's host for a REPORTED
   * crawl source (crawl-sources.ts createReportedSourcesFromSubmittedUrls).
   * Absent on demo and older rows, which read as already checked, like the
   * database column's existing rows.
   */
  crawlSourceChecked?: boolean;
  /**
   * The link address, encrypted like the database column. The memory store
   * kept only a digest until the removal re-check needed the address to queue
   * its page row (link-verification.ts); rows created before then read as
   * purged, like a link whose retention blanking already ran.
   */
  urlEncrypted?: string;
  /** When she added it (admin New links). Absent on demo rows. */
  submittedAt?: string;
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

export async function createCase(userId: string, registrationKeyHash?: string, mode: "CASE" | "WATCH" = "CASE") {
  assertDevOrTest();
  const record: CaseRecord = {
    id: randomUUID(),
    referenceNumber: createReferenceNumber(),
    userId,
    registrationKeyHash,
    createdAt: new Date().toISOString(),
    status: "OPEN",
    mode,
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
    // As case-ops pickExistingLink: her own link first, else the live crawler
    // link, else the newest stopped one (nothing is ever sent from memory).
    const sameAddress = record.urls.filter((url) => url.urlHash === parsed.urlHash).reverse();
    const duplicate =
      sameAddress.find((url) => url.source !== "CRAWLER") ??
      sameAddress.find((url) => !url.crawlConsentWithdrawnAt) ??
      sameAddress[0];
    // Her own report of a link the crawler found makes it hers (see
    // case-ops addUrlsToCase). Nothing is ever sent from the memory store, so
    // no crawler link here has a representative notice.
    if (duplicate && duplicate.source === "CRAWLER") {
      Object.assign(duplicate, {
        source: "SURVIVOR" as const,
        crawlFindingId: undefined,
        crawlConsentWithdrawnAt: null,
        platformName: parsed.platform?.name || "Unknown - will be reviewed",
        status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
        flaggedForReview,
        flagReason: options?.flagReasons?.join(","),
        urlEncrypted: encryptField(parsed.normalizedUrl),
      });
      return { ok: true as const, duplicate: false, url: duplicate };
    }
    if (duplicate) {
      return { ok: true as const, duplicate: true, url: duplicate };
    }
    const url: UrlRecord = {
      id: randomUUID(),
      domain: parsed.domain,
      platformName: parsed.platform?.name || "Unknown - will be reviewed",
      status: parsed.platform && !flaggedForReview ? "NOTICE_QUEUED" : "PENDING_REVIEW",
      urlHash: parsed.urlHash,
      urlEncrypted: encryptField(parsed.normalizedUrl),
      platformId: null,
      flaggedForReview,
      flagReason: options?.flagReasons?.join(","),
      crawlSourceChecked: false,
      submittedAt: new Date().toISOString(),
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

export function getUserStatus(userId: string): "active" | "deactivated" | "gone" {
  assertDevOrTest();
  if (!users.has(userId)) return "gone";
  return deactivatedUsers.has(userId) ? "deactivated" : "active";
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

/** Signing in during the pending period cancels a deletion. True if one was pending. */
export function cancelUserDeletion(userId: string) {
  assertDevOrTest();
  return deactivatedUsers.delete(userId);
}

// Same text as HARD_DELETE_RETAINED.fingerprints in case-ops.ts (the memory
// audit names the same retention), pinned by the account-deletion tests.
const RETAINED_FINGERPRINTS_TEXT =
  "stored encrypted, kept so platforms can keep blocking matching images; with their dispatch records (platform and date, no link to a deleted notice); removed from the crawler pool; a video fingerprint's frame list is removed with the erasure, its row keeps the best frame's hash";

export async function hardDeleteDueUsers(now = new Date()) {
  assertDevOrTest();
  const deletedUserIds: string[] = [];
  for (const [userId, deletion] of deactivatedUsers.entries()) {
    if (new Date(deletion.hardDeleteAfter).getTime() > now.getTime()) {
      continue;
    }

    // Same outcome as the database path (case-ops.ts): the user's links,
    // signed PDFs and contact are gone; fingerprints are kept (the hash store
    // is left alone). Memory keeps no tombstones.
    users.delete(userId);
    let caseCount = 0;
    let links = 0;
    const erasedCaseIds: string[] = [];
    for (const [caseId, record] of cases.entries()) {
      if (record.userId === userId) {
        caseCount += 1;
        links += record.urls.length;
        erasedCaseIds.push(caseId);
        cases.delete(caseId);
      }
    }
    eraseCrawlMemoryForCases(erasedCaseIds);
    // Fingerprints are kept, as on the database path, but a kept video
    // fingerprint loses its frame list with the erasure (WP17).
    for (const caseId of erasedCaseIds) {
      for (const row of globalThis.__asmitaHashStore?.get(caseId) ?? []) {
        if (row.algorithm === "VPDQ") delete row.videoFrames;
      }
    }
    deactivatedUsers.delete(userId);
    deletedUserIds.push(userId);
    await writeAuditLog({
      eventType: "CASE_HARD_DELETED",
      entityType: "User",
      entityId: userId,
      data: { removed: { cases: caseCount, links }, retained: { fingerprints: RETAINED_FINGERPRINTS_TEXT, auditLog: "earlier entries are append-only and unchanged" } },
    });
  }
  return deletedUserIds;
}

export function updateCaseHashAdvisory(
  caseId: string,
  data: { signedHashAdvisoryPdf: string; hashAdvisoryPlatformIds: string[] },
) {
  assertDevOrTest();
  const record = cases.get(caseId);
  if (!record) throw new Error("case_not_found");
  record.signedHashAdvisoryPdf = data.signedHashAdvisoryPdf;
  record.hashAdvisoryPlatformIds = data.hashAdvisoryPlatformIds;
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
  // Same rule as the database path: only links still waiting are decided.
  if (!(url.status === "PENDING_REVIEW" || (url.flaggedForReview && url.status === "NOTICE_QUEUED"))) {
    throw new Error("not_awaiting_review");
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
