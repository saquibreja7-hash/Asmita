import { readAuditTrail } from "@/lib/audit";
import { db } from "@/lib/db";
import { urlRetentionCutoff } from "@/lib/url-retention";

/*
 * Signatures that were voided and are still waiting for the survivor to sign
 * again, so the case and sign pages can say why the sign step is back.
 *
 * Every void (fingerprint rejected, template changed, admin action) writes a
 * signatures_voided audit entry on the case naming what it voided. Anything
 * named there that is still unsigned and unsent is waiting for a new
 * signature; signing again sets the signature, which clears it here. So the
 * existing data is the signal and no column is needed.
 *
 * Shown in the app only, never emailed. A failed read shows nothing rather
 * than breaking the page.
 */
export type VoidedSignatures = { urlIds: string[]; hashAdvisory: boolean };

const NONE: VoidedSignatures = { urlIds: [], hashAdvisory: false };

export async function findVoidedSignatures(caseId: string): Promise<VoidedSignatures> {
  try {
    const voidedUrlIds = new Set<string>();
    let advisoryVoided = false;
    for (const event of await readAuditTrail(caseId)) {
      if (event.eventType !== "ADMIN_ACTION" || event.data?.action !== "signatures_voided") continue;
      const urlIds = event.data.urlIds;
      if (Array.isArray(urlIds)) for (const id of urlIds) if (typeof id === "string") voidedUrlIds.add(id);
      if (event.data.hashAdvisory === true) advisoryVoided = true;
    }
    if (voidedUrlIds.size === 0 && !advisoryVoided) return NONE;

    const [unsigned, unsignedAdvisory] = await Promise.all([
      voidedUrlIds.size
        ? db.submittedUrl.findMany({
            where: {
              caseId,
              id: { in: [...voidedUrlIds] },
              signedNoticePdf: null,
              notices: { none: {} },
              status: { notIn: ["REJECTED", "REMOVED"] },
              urlEncrypted: { not: "" },
              submittedAt: { gt: urlRetentionCutoff() },
            },
            select: { id: true },
          })
        : [],
      advisoryVoided ? db.case.count({ where: { id: caseId, signedHashAdvisoryPdf: null } }) : 0,
    ]);
    return { urlIds: unsigned.map((url) => url.id), hashAdvisory: unsignedAdvisory > 0 };
  } catch {
    console.error("Voided signature lookup failed");
    return NONE;
  }
}
