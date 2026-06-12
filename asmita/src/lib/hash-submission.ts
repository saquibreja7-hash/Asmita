import { db } from "@/lib/db";
import { encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";

// Server-side handling of Phase 2 client-generated PDQ hashes.
// The server accepts ONLY 64-hex-char hashes — never image bytes. Anything
// that looks like media content is rejected before it reaches storage.

export const PDQ_HASH_PATTERN = /^[0-9a-f]{64}$/i;
export const LOW_QUALITY_THRESHOLD = 50;
export const MAX_HASHES_PER_SUBMISSION = 10;
const MAX_CLIENT_VERSION_LENGTH = 50;

export type HashPayloadItem = {
  hash: string;
  quality: number;
  clientVersion?: string;
};

export type HashValidationResult =
  | { ok: true; hash: string; quality: number; clientVersion: string | null; lowQuality: boolean }
  | { ok: false; error: string };

/**
 * Validates one client-submitted hash item. Defense-in-depth against media
 * smuggling: data URLs, base64 blobs, or anything that is not exactly a
 * 256-bit hex string is rejected.
 */
export function validateHashItem(item: HashPayloadItem): HashValidationResult {
  const raw = typeof item.hash === "string" ? item.hash.trim() : "";
  if (/^data:/i.test(raw) || raw.includes(",") || raw.includes("/") || raw.includes("+")) {
    return { ok: false, error: "media_payload_rejected" };
  }
  if (!PDQ_HASH_PATTERN.test(raw)) {
    return { ok: false, error: "invalid_hash_format" };
  }
  if (!Number.isInteger(item.quality) || item.quality < 0 || item.quality > 100) {
    return { ok: false, error: "invalid_quality" };
  }
  const clientVersion =
    typeof item.clientVersion === "string" && item.clientVersion.length <= MAX_CLIENT_VERSION_LENGTH
      ? item.clientVersion
      : null;
  return {
    ok: true,
    hash: raw.toLowerCase(),
    quality: item.quality,
    clientVersion,
    lowQuality: item.quality < LOW_QUALITY_THRESHOLD,
  };
}

export type DisplayHashSubmission = {
  id: string;
  algorithm: string;
  hashDigest: string;
  quality: number;
  status: string;
  flaggedForReview: boolean;
  flagReason: string | null;
  submittedAt: string;
};

export type AddHashResult =
  | { ok: false; error: string }
  | { ok: true; duplicate: true; submission: DisplayHashSubmission }
  | { ok: true; duplicate: false; submission: DisplayHashSubmission };

function toDisplay(record: {
  id: string;
  algorithm: string;
  hashDigest: string;
  quality: number;
  status: string;
  flaggedForReview: boolean;
  flagReason: string | null;
  submittedAt: Date;
}): DisplayHashSubmission {
  return {
    id: record.id,
    algorithm: record.algorithm,
    hashDigest: record.hashDigest,
    quality: record.quality,
    status: record.status,
    flaggedForReview: record.flaggedForReview,
    flagReason: record.flagReason,
    submittedAt: record.submittedAt.toISOString(),
  };
}

export async function addHashesToCase(
  caseId: string,
  items: HashPayloadItem[],
  options?: { flagReasons?: string[] },
): Promise<AddHashResult[]> {
  const externallyFlagged = Boolean(options?.flagReasons?.length);
  const results: AddHashResult[] = [];

  for (const item of items.slice(0, MAX_HASHES_PER_SUBMISSION)) {
    const validated = validateHashItem(item);
    if (!validated.ok) {
      results.push({ ok: false, error: validated.error });
      continue;
    }

    const hashDigest = sha256(validated.hash);
    const existing = await db.hashSubmission.findFirst({ where: { caseId, hashDigest } });
    if (existing) {
      results.push({ ok: true, duplicate: true, submission: toDisplay(existing) });
      continue;
    }

    const flagReasons = [
      ...(options?.flagReasons ?? []),
      ...(validated.lowQuality ? ["low_pdq_quality"] : []),
    ];
    const created = await db.hashSubmission.create({
      data: {
        caseId,
        algorithm: "PDQ",
        hashEncrypted: encryptField(validated.hash),
        hashDigest,
        quality: validated.quality,
        clientVersion: validated.clientVersion,
        // Every hash submission is human-reviewed before any dispatch.
        // Without a StopNCII-style moderation backstop, this gate is the
        // abuse-prevention layer.
        status: "PENDING_REVIEW",
        flaggedForReview: externallyFlagged || validated.lowQuality,
        flagReason: flagReasons.length ? flagReasons.join(",") : null,
      },
    });
    results.push({ ok: true, duplicate: false, submission: toDisplay(created) });
  }

  await writeAuditLog({
    eventType: "HASH_SUBMITTED",
    entityType: "Case",
    entityId: caseId,
    data: { accepted: results.filter((r) => r.ok).length },
  });

  return results;
}

export async function listHashesForCase(caseId: string): Promise<DisplayHashSubmission[]> {
  const records = await db.hashSubmission.findMany({
    where: { caseId },
    orderBy: { submittedAt: "asc" },
  });
  return records.map(toDisplay);
}

export type HashReviewQueueRow = DisplayHashSubmission & {
  caseId: string;
  referenceNumber: string;
  ageMinutes: number;
};

export async function listHashReviewQueue(): Promise<HashReviewQueueRow[]> {
  const records = await db.hashSubmission.findMany({
    where: { status: "PENDING_REVIEW" },
    include: { case: { select: { referenceNumber: true } } },
    orderBy: { submittedAt: "asc" },
  });
  const now = Date.now();
  return records.map((record) => ({
    ...toDisplay(record),
    caseId: record.caseId,
    referenceNumber: record.case.referenceNumber,
    ageMinutes: Math.max(0, Math.floor((now - record.submittedAt.getTime()) / 60_000)),
  }));
}

export async function reviewHashSubmission(input: {
  hashSubmissionId: string;
  decision: "approve" | "reject";
  reviewerId?: string;
  reason?: string;
}): Promise<DisplayHashSubmission> {
  const record = await db.hashSubmission.findUnique({ where: { id: input.hashSubmissionId } });
  if (!record) throw new Error("hash_submission_not_found");
  if (record.status !== "PENDING_REVIEW") throw new Error("hash_submission_already_reviewed");

  const updated = await db.hashSubmission.update({
    where: { id: input.hashSubmissionId },
    data: {
      status: input.decision === "approve" ? "APPROVED" : "REJECTED",
      flaggedForReview: false,
      flagReason: input.reason ?? record.flagReason,
      reviewedAt: new Date(),
      reviewedById: input.reviewerId ?? null,
    },
  });

  await writeAuditLog({
    eventType: input.decision === "approve" ? "HASH_APPROVED" : "HASH_REJECTED",
    entityType: "HashSubmission",
    entityId: input.hashSubmissionId,
    actorId: input.reviewerId,
    data: { caseId: record.caseId, reason: input.reason },
  });

  return toDisplay(updated);
}
