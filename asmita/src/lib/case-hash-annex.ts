import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { buildHashAnnex, type HashAnnexVideo } from "@/lib/notice-generator";
import { writeAuditLog } from "@/lib/audit";

/*
 * One builder for the fingerprint annex so the notice the survivor previews,
 * the PDF they sign, and the email the platform receives all describe the
 * same fingerprints.
 *
 * - For signing: every fingerprint on the case that has not been rejected.
 *   The signing route stores the returned ids on the signed document.
 * - For dispatch: exactly the ids the signed document lists, and only once
 *   every one of them is approved. Nothing added after signing is ever sent,
 *   and nothing is sent while the email would differ from the PDF.
 * - A video fingerprint (algorithm VPDQ, video-fingerprints spec WP19) is
 *   one annex entry, "Video fingerprint (vPDQ, N frames)", listing at most
 *   200 evenly spaced frame hashes - the same single builder, so signing,
 *   dispatch, URL notices, representative notices and the crawl
 *   authorisation all describe it the same way.
 */
export type HashAnnex = { text: string; hashSubmissionIds: string[] };

type Row = {
  id: string;
  algorithm: string;
  hashEncrypted: string;
  quality: number;
  clientVersion: string | null;
  videoFramesEncrypted: string | null;
  videoFrameCount: number | null;
  videoDurationSec: number | null;
};

const EMPTY: HashAnnex = { text: "", hashSubmissionIds: [] };

type StoredFrame = { hash?: unknown };

/*
 * The frame hashes a VPDQ row lists in the annex, in stored (sampling)
 * order. The frame list is the JSON the submission route validated and
 * stored encrypted; if it is gone or unreadable - account erasure clears it
 * while keeping the row - the entry falls back to the stored best frame's
 * hash (hashEncrypted), so an entry never silently vanishes.
 */
function videoAnnexEntry(row: Row): HashAnnexVideo {
  let frames: string[] = [];
  if (row.videoFramesEncrypted) {
    try {
      const parsed: unknown = JSON.parse(decryptField(row.videoFramesEncrypted));
      if (Array.isArray(parsed)) {
        frames = parsed.flatMap((frame) =>
          typeof frame === "object" && frame !== null && typeof (frame as StoredFrame).hash === "string"
            ? [(frame as StoredFrame).hash as string]
            : [],
        );
      }
    } catch {
      // Not the stored JSON shape: fall through to the best frame below.
    }
  }
  if (frames.length === 0) {
    frames = [decryptField(row.hashEncrypted)];
  }
  return { frameCount: row.videoFrameCount ?? frames.length, frames };
}

function render(rows: Row[]): HashAnnex {
  if (rows.length === 0) return EMPTY;
  const images: Array<{ value: string; quality: number }> = [];
  const videos: HashAnnexVideo[] = [];
  for (const row of rows) {
    if (row.algorithm === "VPDQ") videos.push(videoAnnexEntry(row));
    else images.push({ value: decryptField(row.hashEncrypted), quality: row.quality });
  }
  return {
    text: buildHashAnnex({
      algorithm: "PDQ",
      hashes: images,
      ...(videos.length > 0 ? { videos } : {}),
      clientVersion: rows[0].clientVersion,
    }),
    hashSubmissionIds: rows.map((h) => h.id),
  };
}

const signingQuery = (caseId: string) => ({
  where: { caseId, status: { not: "REJECTED" as const } },
  orderBy: { submittedAt: "asc" as const },
});

export async function buildHashAnnexForSigning(caseId: string): Promise<HashAnnex> {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return EMPTY;
  return render(await db.hashSubmission.findMany(signingQuery(caseId)));
}

/** Whether the case has a photo (PDQ) fingerprint the crawler can search for today. */
export async function hasSignableImageFingerprint(caseId: string): Promise<boolean> {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return false;
  const rows = await db.hashSubmission.findMany({ ...signingQuery(caseId), select: { algorithm: true } });
  return rows.some((row) => row.algorithm === "PDQ");
}

/** The ids buildHashAnnexForSigning would list, without decrypting anything. */
export async function signableHashIds(caseId: string): Promise<string[]> {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return [];
  const rows = await db.hashSubmission.findMany({ ...signingQuery(caseId), select: { id: true } });
  return rows.map((h) => h.id);
}

export type SignedAnnexResult =
  | { ok: true; annex: HashAnnex }
  | { ok: false; reason: "fingerprints_pending_review" | "signed_fingerprints_changed" | "hash_upload_disabled" };

export async function buildSignedHashAnnex(signedIds: string[]): Promise<SignedAnnexResult> {
  if (signedIds.length === 0) return { ok: true, annex: EMPTY };
  // Dropping the fingerprints would make the email differ from the PDF.
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return { ok: false, reason: "hash_upload_disabled" };
  const rows = await db.hashSubmission.findMany({
    where: { id: { in: signedIds } },
    orderBy: { submittedAt: "asc" },
  });
  if (rows.length !== signedIds.length || rows.some((h) => h.status === "REJECTED")) {
    return { ok: false, reason: "signed_fingerprints_changed" };
  }
  if (rows.some((h) => h.status !== "APPROVED" && h.status !== "DISPATCHED")) {
    return { ok: false, reason: "fingerprints_pending_review" };
  }
  // A signed video whose frame list is gone (account erasure) would render as
  // one frame, not the frames she signed: refuse rather than send a different annex.
  if (rows.some((h) => h.algorithm === "VPDQ" && !h.videoFramesEncrypted)) {
    return { ok: false, reason: "signed_fingerprints_changed" };
  }
  return { ok: true, annex: render(rows) };
}

export type RepresentativeAnnexResult =
  | { ok: true; annex: HashAnnex }
  | { ok: false; reason: "fingerprint_not_approved" | "hash_upload_disabled" };

/**
 * For a representative notice (src/lib/crawl-notice.ts): exactly the
 * fingerprints an approved crawler finding matched, scoped to the case, and
 * only while each is still approved. Never every fingerprint on the case, and
 * never a void of anything the survivor signed: a refusal here only stops
 * this notice.
 */
export async function buildRepresentativeHashAnnex(caseId: string, ids: string[]): Promise<RepresentativeAnnexResult> {
  if (ids.length === 0) return { ok: false, reason: "fingerprint_not_approved" };
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return { ok: false, reason: "hash_upload_disabled" };
  const rows = await db.hashSubmission.findMany({
    where: { id: { in: ids }, caseId },
    orderBy: { submittedAt: "asc" },
  });
  if (rows.length !== new Set(ids).size || rows.some((h) => h.status !== "APPROVED" && h.status !== "DISPATCHED")) {
    return { ok: false, reason: "fingerprint_not_approved" };
  }
  return { ok: true, annex: render(rows) };
}

/*
 * A rejected (or missing) fingerprint can never be sent, so a signature that
 * lists one could never be dispatched. Void every such signature that has not
 * gone out yet, and the survivor signs the current set again. Sent signatures
 * stay as the record of what was sent.
 *
 * Idempotent and safe to repeat: it runs after a rejection and again whenever
 * dispatch finds a signed set that is no longer valid, so a failure or race
 * between rejecting and signing heals on the next attempt.
 */
export async function voidSignaturesWithRejectedFingerprints(
  caseId: string,
  context: { trigger: "rejection" | "dispatch"; actorId?: string },
) {
  const usable = new Set(
    (
      await db.hashSubmission.findMany({
        where: { caseId, status: { not: "REJECTED" } },
        select: { id: true },
      })
    ).map((h) => h.id),
  );
  const invalid = (ids: string[]) => ids.some((id) => !usable.has(id));

  const unsentUrls = await db.submittedUrl.findMany({
    where: { caseId, signedNoticePdf: { not: null }, notices: { none: {} } },
    select: { id: true, signedHashSubmissionIds: true },
  });
  const voidUrlIds = unsentUrls.filter((u) => invalid(u.signedHashSubmissionIds)).map((u) => u.id);
  if (voidUrlIds.length > 0) {
    await db.submittedUrl.updateMany({
      where: { id: { in: voidUrlIds } },
      data: { signedNoticePdf: null, signedHashSubmissionIds: [], signedTemplateId: null, signedTemplateDigest: null },
    });
  }

  let hashAdvisory = false;
  const dbCase = await db.case.findUnique({ where: { id: caseId }, select: { hashAdvisorySignedHashIds: true } });
  if (dbCase && invalid(dbCase.hashAdvisorySignedHashIds)) {
    // Dispatch sends nothing until every signed fingerprint is approved, and
    // only pending fingerprints can be rejected, so a sent advisory cannot
    // reach this state; the check is defence in depth.
    const sent = await db.hashDispatch.count({
      where: { hashSubmissionId: { in: dbCase.hashAdvisorySignedHashIds } },
    });
    if (sent === 0) {
      await db.case.update({
        where: { id: caseId },
        data: {
          signedHashAdvisoryPdf: null,
          hashAdvisorySignedHashIds: [],
          hashAdvisorySignedTemplateId: null,
          hashAdvisorySignedTemplateDigest: null,
        },
      });
      hashAdvisory = true;
    }
  }
  // Voiding a survivor-signed document is always on the audit trail.
  if (voidUrlIds.length > 0 || hashAdvisory) {
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "Case",
      entityId: caseId,
      actorId: context.actorId,
      data: { action: "signatures_voided", trigger: context.trigger, urlIds: voidUrlIds, hashAdvisory },
    });
  }
  return { urlNotices: voidUrlIds.length, hashAdvisory };
}
