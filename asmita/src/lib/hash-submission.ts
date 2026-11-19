import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";
import { platformDirectory } from "@/lib/platforms";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// In-memory hash store for dev/test. A stored row carries the video frame
// list (the JSON string the database keeps encrypted); it never leaves the
// store: every caller gets the display projection below.
declare global {
   
  var __asmitaHashStore: Map<string, StoredHashSubmission[]> | undefined;
}
function devHashStore(): Map<string, StoredHashSubmission[]> {
  globalThis.__asmitaHashStore ??= new Map();
  return globalThis.__asmitaHashStore;
}

// Server-side handling of Phase 2 client-generated PDQ hashes.
// The server accepts ONLY 64-hex-char hashes - never image bytes. Anything
// that looks like media content is rejected before it reaches storage.

export const PDQ_HASH_PATTERN = /^[0-9a-f]{64}$/i;
export const LOW_QUALITY_THRESHOLD = 50;
export const MAX_HASHES_PER_SUBMISSION = 10;
// Video fingerprints (video-fingerprints spec, "The method"): a video is
// sampled at one frame per second and a video counts as one item.
export const MAX_VIDEO_FRAMES = 1000;
export const MAX_VIDEO_DURATION_SEC = 3600;
const MAX_CLIENT_VERSION_LENGTH = 50;

export type HashPayloadItem = {
  hash: string;
  quality: number;
  clientVersion?: string;
};

/** One sampled frame of a video: its PDQ hash, quality and the playback second. */
export type VideoFrameItem = { hash: string; quality: number; t: number };

/** A video fingerprint item: frame hashes only, never video bytes (spec rule 1). */
export type VideoPayloadItem = {
  kind: "video";
  frames: VideoFrameItem[];
  durationSec: number;
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

export type VideoValidationResult =
  | {
      ok: true;
      frames: VideoFrameItem[];
      durationSec: number;
      clientVersion: string | null;
      /** The frame whose hash and quality are stored on the row (hashEncrypted / quality). */
      bestFrame: { hash: string; quality: number };
      /** sha256 of the sorted unique frame hashes, so a re-upload dedups. */
      hashDigest: string;
      lowQuality: boolean;
    }
  | { ok: false; error: string };

/**
 * Validates one client-submitted video item. Every frame hash gets the same
 * media-smuggling defence as an image hash: a frame is a 256-bit hex string
 * and nothing else. The video itself never reaches the server.
 */
export function validateVideoItem(item: VideoPayloadItem): VideoValidationResult {
  if (!Array.isArray(item.frames) || item.frames.length === 0) {
    return { ok: false, error: "no_frames" };
  }
  if (item.frames.length > MAX_VIDEO_FRAMES) {
    return { ok: false, error: "too_many_frames" };
  }
  if (!Number.isInteger(item.durationSec) || item.durationSec < 1 || item.durationSec > MAX_VIDEO_DURATION_SEC) {
    return { ok: false, error: "invalid_duration" };
  }
  const frames: VideoFrameItem[] = [];
  for (const frame of item.frames) {
    const raw = typeof frame.hash === "string" ? frame.hash.trim() : "";
    if (/^data:/i.test(raw) || raw.includes(",") || raw.includes("/") || raw.includes("+")) {
      return { ok: false, error: "media_payload_rejected" };
    }
    if (!PDQ_HASH_PATTERN.test(raw)) {
      return { ok: false, error: "invalid_hash_format" };
    }
    if (!Number.isInteger(frame.quality) || frame.quality < 0 || frame.quality > 100) {
      return { ok: false, error: "invalid_quality" };
    }
    if (!Number.isInteger(frame.t) || frame.t < 0 || frame.t > MAX_VIDEO_DURATION_SEC) {
      return { ok: false, error: "invalid_frame_time" };
    }
    frames.push({ hash: raw.toLowerCase(), quality: frame.quality, t: frame.t });
  }
  // Highest-quality frame wins; a tie keeps the earliest (deterministic).
  const best = frames.reduce((acc, frame) => (frame.quality > acc.quality ? frame : acc), frames[0]);
  const hashDigest = sha256([...new Set(frames.map((frame) => frame.hash))].sort().join("\n"));
  const clientVersion =
    typeof item.clientVersion === "string" && item.clientVersion.length <= MAX_CLIENT_VERSION_LENGTH
      ? item.clientVersion
      : null;
  return {
    ok: true,
    frames,
    durationSec: item.durationSec,
    clientVersion,
    bestFrame: { hash: best.hash, quality: best.quality },
    hashDigest,
    lowQuality: best.quality < LOW_QUALITY_THRESHOLD,
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
  /** Video only (VPDQ): kept frame count and the video's duration in seconds. */
  videoFrameCount: number | null;
  videoDurationSec: number | null;
};

/** A dev-store row: a display row plus the video frame list (never displayed). */
type StoredHashSubmission = DisplayHashSubmission & { videoFrames?: string };

/** The stored row as every caller sees it: display fields only, never frames. */
function displayOf(row: StoredHashSubmission): DisplayHashSubmission {
  return {
    id: row.id,
    algorithm: row.algorithm,
    hashDigest: row.hashDigest,
    quality: row.quality,
    status: row.status,
    flaggedForReview: row.flaggedForReview,
    flagReason: row.flagReason,
    submittedAt: row.submittedAt,
    videoFrameCount: row.videoFrameCount ?? null,
    videoDurationSec: row.videoDurationSec ?? null,
  };
}

/**
 * How an admin page names a video fingerprint: "Video · 12 frames · 1:05"
 * (video-fingerprints spec WP17). Null for an image fingerprint.
 */
export function videoFingerprintLabel(videoFrameCount: number | null, videoDurationSec: number | null): string | null {
  if (videoFrameCount === null) return null;
  const frames = `${videoFrameCount} frame${videoFrameCount === 1 ? "" : "s"}`;
  const duration = videoDurationSec ?? 0;
  const label = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  return `Video · ${frames} · ${label}`;
}

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
  videoFrameCount?: number | null;
  videoDurationSec?: number | null;
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
    videoFrameCount: record.videoFrameCount ?? null,
    videoDurationSec: record.videoDurationSec ?? null,
  };
}

/*
 * Fingerprints are added only while the case is being created. They close
 * once the survivor has signed anything on the case (declarationSignedAt is
 * set by the first signature and no void clears it). The creation flow posts
 * them right after the case row exists and before any signature; the case
 * page has no way to add them.
 */
export function fingerprintsClosed(input: { declarationSignedAt?: Date | null }): boolean {
  return Boolean(input.declarationSignedAt);
}

export async function fingerprintsClosedForCase(caseId: string): Promise<boolean> {
  const declarationSignedAt = isDevNoDb()
    ? null
    : (await db.case.findUnique({ where: { id: caseId }, select: { declarationSignedAt: true } }))?.declarationSignedAt ?? null;
  return fingerprintsClosed({ declarationSignedAt });
}

/*
 * Keeps every email platform the survivor chose on the case, so the advisory
 * they sign (from the creation flow or later from the case page) and its
 * dispatch cover all of them, not only the first. Form-only platforms are
 * not stored: the survivor files those forms themselves. Only while unsigned;
 * signing writes the final list.
 */
export async function recordChosenAdvisoryPlatforms(caseId: string, platformIds: string[]): Promise<void> {
  if (isDevNoDb() || platformIds.length === 0) return;
  const email = await db.platform.findMany({
    where: { id: { in: platformIds }, isActive: true, noticeBasis: { not: "FORM_ONLY" } },
    select: { id: true },
  });
  if (email.length === 0) return;
  const current = await db.case.findUnique({ where: { id: caseId }, select: { hashAdvisoryPlatformIds: true } });
  const merged = [...new Set([...(current?.hashAdvisoryPlatformIds ?? []), ...email.map((p) => p.id)])];
  await db.case.updateMany({ where: { id: caseId, signedHashAdvisoryPdf: null }, data: { hashAdvisoryPlatformIds: merged } });
}

/** Whether this submission item is a video fingerprint (spec WP17). */
function isVideoItem(item: HashPayloadItem | VideoPayloadItem): item is VideoPayloadItem {
  return "kind" in item && item.kind === "video";
}

export async function addHashesToCase(
  caseId: string,
  items: Array<HashPayloadItem | VideoPayloadItem>,
  options?: { flagReasons?: string[]; requestedPlatformId?: string },
): Promise<AddHashResult[]> {
  if (isDevNoDb()) {
    const devStore = devHashStore();
    const existing = devStore.get(caseId) ?? [];
    const results: AddHashResult[] = [];
    for (const item of items.slice(0, MAX_HASHES_PER_SUBMISSION)) {
      // One video fingerprint is one item, exactly like one image hash.
      if (isVideoItem(item)) {
        const validated = validateVideoItem(item);
        if (!validated.ok) { results.push({ ok: false, error: validated.error }); continue; }
        const dup = existing.find((s) => s.hashDigest === validated.hashDigest);
        if (dup) { results.push({ ok: true, duplicate: true, submission: displayOf(dup) }); continue; }
        const sub: StoredHashSubmission = {
          id: randomUUID(), algorithm: "VPDQ", hashDigest: validated.hashDigest,
          quality: validated.bestFrame.quality,
          status: "PENDING_REVIEW",
          flaggedForReview: validated.lowQuality,
          flagReason: validated.lowQuality ? "low_pdq_quality" : null,
          submittedAt: new Date().toISOString(),
          videoFrameCount: validated.frames.length,
          videoDurationSec: validated.durationSec,
          videoFrames: JSON.stringify(validated.frames),
        };
        existing.push(sub);
        results.push({ ok: true, duplicate: false, submission: displayOf(sub) });
        continue;
      }
      const validated = validateHashItem(item);
      if (!validated.ok) { results.push({ ok: false, error: validated.error }); continue; }
      const hashDigest = sha256(validated.hash);
      const dup = existing.find((s) => s.hashDigest === hashDigest);
      if (dup) { results.push({ ok: true, duplicate: true, submission: displayOf(dup) }); continue; }
      const sub: StoredHashSubmission = {
        id: randomUUID(), algorithm: "PDQ", hashDigest,
        quality: validated.quality,
        status: "PENDING_REVIEW",
        flaggedForReview: validated.lowQuality,
        flagReason: validated.lowQuality ? "low_pdq_quality" : null,
        submittedAt: new Date().toISOString(),
        videoFrameCount: null,
        videoDurationSec: null,
      };
      existing.push(sub);
      results.push({ ok: true, duplicate: false, submission: displayOf(sub) });
    }
    devStore.set(caseId, existing);
    await writeAuditLog({ eventType: "HASH_SUBMITTED", entityType: "Case", entityId: caseId, data: { accepted: results.filter((r) => r.ok).length } });
    return results;
  }

  const results: AddHashResult[] = [];

  for (const item of items.slice(0, MAX_HASHES_PER_SUBMISSION)) {
    // One video fingerprint is one item, exactly like one image hash.
    if (isVideoItem(item)) {
      const validated = validateVideoItem(item);
      if (!validated.ok) {
        results.push({ ok: false, error: validated.error });
        continue;
      }

      const existing = await db.hashSubmission.findFirst({ where: { caseId, hashDigest: validated.hashDigest } });
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
          algorithm: "VPDQ",
          hashEncrypted: encryptField(validated.bestFrame.hash),
          hashDigest: validated.hashDigest,
          quality: validated.bestFrame.quality,
          videoFramesEncrypted: encryptField(JSON.stringify(validated.frames)),
          videoFrameCount: validated.frames.length,
          videoDurationSec: validated.durationSec,
          clientVersion: validated.clientVersion,
          status: "PENDING_REVIEW",
          flaggedForReview: validated.lowQuality,
          flagReason: flagReasons.length ? flagReasons.join(",") : null,
          requestedPlatformId: options?.requestedPlatformId ?? null,
        },
      });
      results.push({ ok: true, duplicate: false, submission: toDisplay(created) });
      continue;
    }

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
        status: "PENDING_REVIEW",
        flaggedForReview: validated.lowQuality,
        flagReason: flagReasons.length ? flagReasons.join(",") : null,
        requestedPlatformId: options?.requestedPlatformId ?? null,
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
  if (isDevNoDb()) return (devHashStore().get(caseId) ?? []).map(displayOf);
  const records = await db.hashSubmission.findMany({
    where: { caseId },
    orderBy: { submittedAt: "asc" },
  });
  return records.map(toDisplay);
}

/**
 * Memory path only: forgets the case's dev hash-store records. Used by
 * stop-watching (WP22), whose database paths delete the HashSubmission rows
 * themselves (src/lib/watch-ops.ts).
 */
export function clearMemoryHashesForCase(caseId: string) {
  if (isDevNoDb()) devHashStore().delete(caseId);
}

export type HashReviewQueueRow = DisplayHashSubmission & {
  caseId: string;
  referenceNumber: string;
  ageMinutes: number;
  requestedPlatformId: string | null;
  requestedPlatformName: string | null;
};

export async function listHashReviewQueue(): Promise<HashReviewQueueRow[]> {
  const records = await db.hashSubmission.findMany({
    where: { status: "PENDING_REVIEW" },
    include: {
      case: { select: { referenceNumber: true } },
      requestedPlatform: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
  const now = Date.now();
  return records.map((record) => ({
    ...toDisplay(record),
    caseId: record.caseId,
    referenceNumber: record.case.referenceNumber,
    ageMinutes: Math.max(0, Math.floor((now - record.submittedAt.getTime()) / 60_000)),
    requestedPlatformId: record.requestedPlatformId ?? null,
    requestedPlatformName: record.requestedPlatform?.name ?? null,
  }));
}

export type DispatchableCase = {
  caseId: string;
  referenceNumber: string;
  approvedCount: number;
  dispatchedCount: number;
};

export type VerifiedPlatformOption = {
  id: string;
  name: string;
};

// Cases with at least one admin-approved hash, ready for advisory dispatch.
export async function listDispatchableHashCases(): Promise<DispatchableCase[]> {
  const records = await db.hashSubmission.findMany({
    where: { status: { in: ["APPROVED", "DISPATCHED"] } },
    include: { case: { select: { referenceNumber: true } } },
  });
  const byCase = new Map<string, DispatchableCase>();
  for (const record of records) {
    const entry = byCase.get(record.caseId) ?? {
      caseId: record.caseId,
      referenceNumber: record.case.referenceNumber,
      approvedCount: 0,
      dispatchedCount: 0,
    };
    if (record.status === "APPROVED") entry.approvedCount++;
    else entry.dispatchedCount++;
    byCase.set(record.caseId, entry);
  }
  return Array.from(byCase.values()).sort((a, b) =>
    a.referenceNumber.localeCompare(b.referenceNumber),
  );
}

export type HashPickerPlatform = {
  id: string;
  name: string;
  hasEmail: boolean;
  formUrl: string | null;
};

function devPlatformId(id: string): string {
  const hex = sha256(`asmita-dev-platform:${id}`).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function listDevHashPickerPlatforms(): HashPickerPlatform[] {
  return platformDirectory
    .filter((p) => p.lastContactVerifiedByHuman && p.formUrl)
    .map((p) => ({ id: devPlatformId(p.id), name: p.name, hasEmail: false, formUrl: p.formUrl ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Platforms shown in the hash-only picker. Includes email-capable and form-only
// platforms so survivors can always direct their advisory somewhere. Filtered to
// human-verified contacts only.
export async function listHashPickerPlatforms(): Promise<HashPickerPlatform[]> {
  if (isDevNoDb()) return listDevHashPickerPlatforms();
  const platforms = await db.platform.findMany({
    where: {
      isActive: true,
      lastContactVerifiedByHuman: true,
      OR: [{ grievanceEmail: { not: null } }, { formUrl: { not: null } }],
    },
    select: { id: true, name: true, grievanceEmail: true, formUrl: true },
    orderBy: { name: "asc" },
  });
  return platforms.map((p) => ({
    id: p.id,
    name: p.name,
    hasEmail: p.grievanceEmail !== null,
    formUrl: p.formUrl,
  }));
}

// Keep old export for any existing admin callers.
export async function listVerifiedDispatchPlatforms(): Promise<VerifiedPlatformOption[]> {
  const platforms = await db.platform.findMany({
    where: {
      isActive: true,
      lastContactVerifiedByHuman: true,
      grievanceEmail: { not: null },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return platforms;
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
