import { db } from "@/lib/db";
import { sha256 } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";

/*
 * The notice template a survivor signed is pinned on the signed record (its
 * id and a digest of its text), and dispatch renders the email from that same
 * template, so the email body never differs from the signed PDF.
 *
 * Pinning the id alone is not enough: the seed updates a template's text in
 * place (prisma/seed.ts), so the digest proves the text is still the text
 * that was signed.
 *
 * At dispatch:
 * - Text changed or template gone: the signature can never be honoured, so it
 *   is voided (when nothing has been sent under it yet) and the survivor signs
 *   the current text again. Same pattern as voidSignaturesWithRejectedFingerprints.
 * - Template deactivated or its legal review withdrawn: refused, signature
 *   kept. A human can restore it, and nothing was wrong with what was signed.
 *   If it will not be restored, an admin can void the unsent signature so the
 *   survivor signs again (/api/admin/signatures/void).
 * Records signed before pinning have no pin; callers keep today's selection
 * for those.
 */

type TemplateText = { subjectTemplate: string; bodyTemplate: string };

export function templateDigest(template: TemplateText): string {
  return sha256(`${template.subjectTemplate}\u0000${template.bodyTemplate}`);
}

/*
 * What the survivor previewed: the template's id, the digest of its text, and
 * a digest of the fingerprint ids the preview's annex listed. The preview
 * returns it (header TEMPLATE_REF_HEADER), the signing form sends it back, and
 * signing refuses (409 notice_changed_since_preview) when what it would sign
 * now has a different reference, so the survivor never signs text or
 * fingerprints they did not see. A fingerprint added or rejected between
 * preview and sign changes the reference.
 *
 * It is not secret and needs no signature: the server only compares it with
 * the reference of what it would sign itself. A forged or stale value can only
 * cause a refusal, never select a template or a fingerprint. The fingerprint
 * part is a one-way digest of random ids the client never sees, so it reveals
 * nothing beyond what the preview PDF already shows.
 */
export const TEMPLATE_REF_HEADER = "X-Notice-Template-Ref";

export function templateRef(template: TemplateText & { id: string }, hashSubmissionIds: readonly string[]): string {
  const fingerprints = sha256(`fingerprints\u0000${[...hashSubmissionIds].sort().join(",")}`);
  return `${template.id}.${templateDigest(template)}.${fingerprints}`;
}

export type SignedTemplateRefusal = "signed_template_changed" | "signed_template_not_dispatchable";

/** Why an admin voided a signature by hand. Fixed codes, so no free text (and no survivor detail) reaches the audit log. */
export const ADMIN_VOID_REASONS = ["template_withdrawn", "survivor_asked", "other"] as const;
export type AdminVoidReason = (typeof ADMIN_VOID_REASONS)[number];

/*
 * Who voided: dispatch found the signed text changed ("template_changed"), or
 * an admin chose to ask the survivor to sign again because the signed
 * template cannot be sent ("admin", with a reason).
 */
type VoidContext =
  | { trigger?: "template_changed"; reason?: undefined }
  | { trigger: "admin"; reason: AdminVoidReason };

type TemplateCheckInput = TemplateText & {
  templateType: string;
  platformId: string | null;
  isActive: boolean;
  reviewedByLegal: boolean;
};

/**
 * The pure part of loadSignedTemplate, so a caller that already holds the
 * template rows (the admin queue) reaches the same verdict without a query
 * per signature.
 */
export function checkSignedTemplate<T extends TemplateCheckInput>(
  template: T | null | undefined,
  pin: { digest: string | null },
  expected: { templateType: string; platformId?: string },
  skipLegalGate: boolean,
) {
  if (
    !template ||
    template.templateType !== expected.templateType ||
    (expected.platformId !== undefined && template.platformId !== null && template.platformId !== expected.platformId) ||
    templateDigest(template) !== pin.digest
  ) {
    return { ok: false as const, reason: "signed_template_changed" as SignedTemplateRefusal };
  }
  if (!template.isActive || (!skipLegalGate && !template.reviewedByLegal)) {
    return { ok: false as const, reason: "signed_template_not_dispatchable" as SignedTemplateRefusal };
  }
  return { ok: true as const, template };
}

export async function loadSignedTemplate(
  pin: { id: string; digest: string | null },
  expected: { templateType: string; platformId?: string },
  skipLegalGate: boolean,
) {
  const template = await db.noticeTemplate.findUnique({ where: { id: pin.id } });
  return checkSignedTemplate(template, pin, expected, skipLegalGate);
}

function voidAuditData(context: VoidContext, urlIds: string[], hashAdvisory: boolean) {
  return {
    action: "signatures_voided",
    trigger: context.trigger ?? "template_changed",
    ...(context.reason ? { reason: context.reason } : {}),
    urlIds,
    hashAdvisory,
  };
}

/** Voids one link's unsent signature. True when this call voided it. */
export async function voidUrlSignatureForChangedTemplate(input: {
  caseId: string;
  urlId: string;
  signedNoticePdf: string;
  actorId?: string;
} & VoidContext): Promise<boolean> {
  // Only the signature dispatch looked at, and only while nothing was sent
  // under it, so a fresh signature or a sent record is never touched.
  const voided = await db.submittedUrl.updateMany({
    where: { id: input.urlId, signedNoticePdf: input.signedNoticePdf, notices: { none: {} } },
    data: { signedNoticePdf: null, signedHashSubmissionIds: [], signedTemplateId: null, signedTemplateDigest: null },
  });
  if (voided.count > 0) {
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "Case",
      entityId: input.caseId,
      actorId: input.actorId,
      data: voidAuditData(input, [input.urlId], false),
    });
  }
  return voided.count > 0;
}

/** Voids the case's unsent hash advisory signature. True when this call voided it. */
export async function voidHashAdvisoryForChangedTemplate(input: {
  caseId: string;
  signedHashAdvisoryPdf: string;
  signedHashIds: string[];
  actorId?: string;
} & VoidContext): Promise<boolean> {
  // Once any platform received the advisory it stays as the record of what
  // was sent; the remaining platforms are refused instead.
  const sent = await db.hashDispatch.count({ where: { hashSubmissionId: { in: input.signedHashIds } } });
  if (sent > 0) return false;
  const voided = await db.case.updateMany({
    where: { id: input.caseId, signedHashAdvisoryPdf: input.signedHashAdvisoryPdf },
    data: {
      signedHashAdvisoryPdf: null,
      hashAdvisorySignedHashIds: [],
      hashAdvisorySignedTemplateId: null,
      hashAdvisorySignedTemplateDigest: null,
    },
  });
  if (voided.count > 0) {
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "Case",
      entityId: input.caseId,
      actorId: input.actorId,
      data: voidAuditData(input, [], true),
    });
  }
  return voided.count > 0;
}
