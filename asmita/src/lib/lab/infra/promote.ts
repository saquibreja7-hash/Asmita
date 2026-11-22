import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { CATEGORY_TO_CHOKEPOINT_KIND } from "@/lib/lab/infra/signatures";
import { claimFindingPromotion, getLabInfraFinding, getLabProvider, releaseFindingPromotion, setFindingPromoted } from "@/lib/lab/infra/store";
import { createLabChokepoint, type LabChokepointView } from "@/lib/lab/lab-chokepoints";
import type { LabInfraCategory, LabChokepointKind } from "@/lib/lab/lab-store";
import type { LabProviderView } from "@/lib/lab/infra/store";

/*
 * WP115 (research-tools-spec.md): promote an infrastructure finding to a
 * chokepoint in one action. The chokepoint's kind is mapped from the
 * finding's category, the provider comes from the LabProvider directory, and
 * the evidence notes are pre-filled from the finding's own evidence. The
 * abuse contact is taken from the directory row only when that row is
 * verified and carries an email; an unverified row never auto-fills
 * anything — the analyst must enter the contact themselves.
 *
 * A finding promotes once: promotedAt is set with the chokepoint it became,
 * and a second attempt is refused.
 */

/** The categories that map onto a chokepoint kind and may be promoted. */
export const PROMOTABLE_CATEGORIES = Object.keys(CATEGORY_TO_CHOKEPOINT_KIND) as LabInfraCategory[];

export function promotableKindFor(category: LabInfraCategory): LabChokepointKind | null {
  return CATEGORY_TO_CHOKEPOINT_KIND[category] ?? null;
}

export const promoteFindingSchema = z
  .object({
    /** A LabProvider row; defaults to the provider the finding was matched to. */
    providerId: z.string().trim().min(1).max(64).optional(),
    /** Required unless the verified directory row carries an abuse email. */
    abuseContact: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type PromoteFindingInput = z.infer<typeof promoteFindingSchema>;

export type PromoteFindingError =
  | "invalid_payload"
  | "finding_not_found"
  | "finding_inactive"
  | "finding_already_promoted"
  | "category_not_promotable"
  | "provider_required"
  | "provider_not_found"
  | "provider_kind_mismatch"
  | "abuse_contact_required"
  | "service_not_found";

export async function promoteFindingToChokepoint(
  findingId: string,
  input: PromoteFindingInput,
  actorId: string,
): Promise<
  | { ok: true; chokepoint: LabChokepointView; provider: LabProviderView; contactFromDirectory: boolean }
  | { ok: false; error: PromoteFindingError }
> {
  const parsed = promoteFindingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const finding = await getLabInfraFinding(findingId);
  if (!finding) return { ok: false, error: "finding_not_found" };
  if (finding.promotedAt) return { ok: false, error: "finding_already_promoted" };
  if (!finding.active) return { ok: false, error: "finding_inactive" };
  const kind = promotableKindFor(finding.category);
  if (!kind) return { ok: false, error: "category_not_promotable" };

  const provider =
    parsed.data.providerId !== undefined
      ? await getLabProvider(parsed.data.providerId)
      : finding.providerId
        ? await getLabProvider(finding.providerId)
        : null;
  if (parsed.data.providerId !== undefined && !provider) return { ok: false, error: "provider_not_found" };
  if (!provider) return { ok: false, error: "provider_required" };
  if (provider.kind !== kind) return { ok: false, error: "provider_kind_mismatch" };

  // The contact comes from the directory only when the row is verified and
  // carries an email; anything the analyst typed always wins, and an
  // unverified row never fills anything by itself.
  const directoryContact = provider.verifiedAt !== null && provider.abuseEmail ? provider.abuseEmail : null;
  const abuseContact = parsed.data.abuseContact ?? directoryContact;
  if (!abuseContact) return { ok: false, error: "abuse_contact_required" };

  const firstSeen = finding.firstSeenAt.slice(0, 10);
  const lastSeen = finding.lastSeenAt.slice(0, 10);
  const evidenceNotes = [
    "From an automated infrastructure scan:",
    `${finding.evidence} (${finding.value}).`,
    `Confidence ${finding.confidence}; first seen ${firstSeen}, last seen ${lastSeen}.`,
  ].join(" ").slice(0, 5000);

  // Claim the finding before creating anything: only the call that flips
  // promotedAt from null goes on, so a double click makes one chokepoint.
  const now = new Date();
  if (!(await claimFindingPromotion(finding.id, now))) return { ok: false, error: "finding_already_promoted" };

  const created = await createLabChokepoint(
    {
      serviceId: finding.serviceId,
      kind,
      provider: provider.name,
      abuseContact,
      evidenceNotes,
    },
    actorId,
  );
  if (!created.ok) {
    await releaseFindingPromotion(finding.id);
    return created;
  }

  await setFindingPromoted(finding.id, created.chokepoint.id, now);
  await writeAuditLog({
    eventType: "LAB_FINDING_PROMOTED",
    entityType: "LabInfraFinding",
    entityId: finding.id,
    actorId,
    data: {
      chokepointId: created.chokepoint.id,
      providerId: provider.id,
      kind,
      contactFromDirectory: parsed.data.abuseContact === undefined && directoryContact !== null,
    },
  });
  return {
    ok: true,
    chokepoint: created.chokepoint,
    provider,
    contactFromDirectory: parsed.data.abuseContact === undefined && directoryContact !== null,
  };
}
