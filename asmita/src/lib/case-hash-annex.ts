import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { buildHashAnnex } from "@/lib/notice-generator";

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
 */
export type HashAnnex = { text: string; hashSubmissionIds: string[] };

type Row = { id: string; hashEncrypted: string; quality: number; clientVersion: string | null };

const EMPTY: HashAnnex = { text: "", hashSubmissionIds: [] };

function render(rows: Row[]): HashAnnex {
  if (rows.length === 0) return EMPTY;
  return {
    text: buildHashAnnex({
      algorithm: "PDQ",
      hashes: rows.map((h) => ({ value: decryptField(h.hashEncrypted), quality: h.quality })),
      clientVersion: rows[0].clientVersion,
    }),
    hashSubmissionIds: rows.map((h) => h.id),
  };
}

export async function buildHashAnnexForSigning(caseId: string): Promise<HashAnnex> {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return EMPTY;
  const rows = await db.hashSubmission.findMany({
    where: { caseId, status: { not: "REJECTED" } },
    orderBy: { submittedAt: "asc" },
  });
  return render(rows);
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
export async function voidSignaturesWithRejectedFingerprints(caseId: string) {
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
      data: { signedNoticePdf: null, signedHashSubmissionIds: [] },
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
        data: { signedHashAdvisoryPdf: null, hashAdvisorySignedHashIds: [] },
      });
      hashAdvisory = true;
    }
  }
  return { urlNotices: voidUrlIds.length, hashAdvisory };
}
