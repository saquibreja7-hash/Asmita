import { db } from "@/lib/db";
import { SIGNABLE_NOTICE_BASES, templateTypeForNoticeBasis } from "@/lib/notice-basis";
import { hasRetiredPortalInstructions } from "@/lib/notice-generator";
import { urlRetentionCutoff } from "@/lib/url-retention";
import { signableHashIds } from "@/lib/case-hash-annex";

/**
 * Find an unsigned notice that can actually be previewed and signed, with the
 * template it would be previewed and signed with.
 */
export async function findSignableNotice(caseId: string, skipLegalGate: boolean, urlId?: string) {
  const urls = await db.submittedUrl.findMany({
    where: {
      caseId, ...(urlId ? { id: urlId } : {}),
      status: skipLegalGate ? { in: ["NOTICE_QUEUED", "PENDING_REVIEW"] } : "NOTICE_QUEUED",
      platformId: { not: null }, signedNoticePdf: null,
      urlEncrypted: { not: "" }, submittedAt: { gt: urlRetentionCutoff() },
      platform: {
        isActive: true, noticeBasis: { in: [...SIGNABLE_NOTICE_BASES] },
        grievanceEmail: { notIn: ["", "<TO_BE_VERIFIED_BY_HUMAN>"] },
        ...(skipLegalGate ? {} : { lastContactVerifiedByHuman: true }),
      },
    },
    include: { platform: { select: { id: true, name: true, noticeBasis: true, grievanceEmail: true } } },
    orderBy: { submittedAt: "asc" },
  });
  for (const url of urls) {
    if (!url.platform?.grievanceEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.platform.grievanceEmail)) continue;
    const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
    if (!templateType) continue;
    const template = await db.noticeTemplate.findFirst({
      where: { templateType, isActive: true, ...(skipLegalGate ? {} : { reviewedByLegal: true }), OR: [{ platformId: url.platform.id }, { platformId: null }] },
      orderBy: [{ platformId: "desc" }, { version: "desc" }],
    });
    if (template && !hasRetiredPortalInstructions(template.bodyTemplate)) return { ...url, template };
  }
  return null;
}

/** The HASH_ADVISORY template preview, sign and the sign page all use. */
export function findHashAdvisoryTemplate(skipLegalGate: boolean) {
  return db.noticeTemplate.findFirst({
    where: { templateType: "HASH_ADVISORY", isActive: true, ...(skipLegalGate ? {} : { reviewedByLegal: true }) },
    orderBy: { version: "desc" },
  });
}

/*
 * The case's hash advisory when it can be signed from the case page: never
 * signed, or its signature was voided. The advisory is one document per case
 * covering every non-rejected fingerprint, so signing again is the same
 * sign-hash-advisory call the case-creation flow makes.
 *
 * Platforms: the ones the survivor chose stay on the case
 * (hashAdvisoryPlatformIds), and no void clears them, so they are reused as
 * they are. A case that was never signed has only the platform recorded on
 * each fingerprint (requestedPlatformId), so those that take email are used.
 * With no email platform there is nothing to sign, as in the creation flow,
 * where a survivor who chose only form-based platforms never signs an
 * advisory. Null whenever anything was already sent under an advisory.
 */
export async function findSignableHashAdvisory(caseId: string, skipLegalGate: boolean) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return null;
  const record = await db.case.findUnique({
    where: { id: caseId },
    select: { signedHashAdvisoryPdf: true, hashAdvisoryPlatformIds: true },
  });
  if (!record || record.signedHashAdvisoryPdf) return null;
  const hashIds = await signableHashIds(caseId);
  if (hashIds.length === 0) return null;
  if (await db.hashDispatch.count({ where: { hashSubmission: { caseId } } }) > 0) return null;

  let platformIds = record.hashAdvisoryPlatformIds;
  if (platformIds.length === 0) {
    const requested = await db.hashSubmission.findMany({
      where: {
        id: { in: hashIds },
        requestedPlatform: { isActive: true, noticeBasis: { not: "FORM_ONLY" } },
      },
      select: { requestedPlatformId: true },
    });
    platformIds = [...new Set(requested.flatMap((h) => (h.requestedPlatformId ? [h.requestedPlatformId] : [])))];
  }
  if (platformIds.length === 0) return null;

  const template = await findHashAdvisoryTemplate(skipLegalGate);
  if (!template) return null;
  return { template, hashIds, platformIds };
}
