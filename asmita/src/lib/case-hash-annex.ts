import type { HashSubmissionStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { buildHashAnnex } from "@/lib/notice-generator";

/*
 * One builder for the fingerprint annex so the notice the survivor previews,
 * the PDF they sign, and the email the platform receives all describe the
 * same fingerprints.
 *
 * - At preview and signing: every fingerprint on the case that has not been
 *   rejected, so the signed declaration explicitly covers them.
 * - At dispatch: only fingerprints that were approved AND submitted before the
 *   declaration was signed. Anything added afterwards is never sent under a
 *   signature that did not cover it.
 */
export async function buildCaseHashAnnex(
  caseId: string,
  mode: { kind: "for-signing" } | { kind: "for-dispatch"; signedAt: Date | null },
): Promise<string> {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return "";
  const sent: HashSubmissionStatus[] = ["APPROVED", "DISPATCHED"];
  const where: Prisma.HashSubmissionWhereInput | null =
    mode.kind === "for-signing"
      ? { caseId, status: { not: "REJECTED" } }
      : mode.signedAt
        ? { caseId, status: { in: sent }, submittedAt: { lte: mode.signedAt } }
        : null;
  if (!where) return "";

  const rows = await db.hashSubmission.findMany({ where, orderBy: { submittedAt: "asc" } });
  if (rows.length === 0) return "";

  return buildHashAnnex({
    algorithm: "PDQ",
    hashes: rows.map((h) => ({ value: decryptField(h.hashEncrypted), quality: h.quality })),
    clientVersion: rows[0].clientVersion,
  });
}
