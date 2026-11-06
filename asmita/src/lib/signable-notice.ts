import { db } from "@/lib/db";
import { SIGNABLE_NOTICE_BASES, templateTypeForNoticeBasis } from "@/lib/notice-basis";
import { hasRetiredPortalInstructions } from "@/lib/notice-generator";
import { urlRetentionCutoff } from "@/lib/url-retention";

/** Find an unsigned notice that can actually be previewed and signed. */
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
    if (template && !hasRetiredPortalInstructions(template.bodyTemplate)) return url;
  }
  return null;
}
