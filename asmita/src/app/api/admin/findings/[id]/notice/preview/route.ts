import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAccess } from "@/lib/admin-access-log";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { previewRepresentativeNotice, REPRESENTATIVE_TRANSPORT } from "@/lib/crawl-notice";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// POST /api/admin/findings/[id]/notice/preview { caseId }
// Renders the representative notice for an approved finding exactly as the
// calling admin would send it now, with every send-time gate checked, and
// sends nothing. The response carries the page and image addresses, so it is
// a reveal: access log first (no preview without a record), then the audit
// chain, rate-limited per admin, never cached. Pass contentDigest to
// .../notice/dispatch to send this notice. See src/lib/crawl-notice.ts and
// docs/product/crawler-notice-flow.md.

const schema = z.object({ caseId: z.string().min(1).max(64) }).strict();
const PREVIEWS_PER_HOUR = 20;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!crawlerEnabled()) return noStore({ error: "crawler_disabled" }, 503);
  if (!verifyCsrfRequest(request)) return noStore({ error: "csrf_failed" }, 403);
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`admin-finding-notice-preview:${auth.session.sub}`, PREVIEWS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);

  const { id } = await context.params;
  const result = await previewRepresentativeNotice({ findingId: id, caseId: parsed.data.caseId, adminId: auth.session.sub });
  if (!result.ok) {
    return noStore({ error: result.error, ...(result.formUrl ? { formUrl: result.formUrl } : {}) }, result.status);
  }

  try {
    await recordAdminAccess(
      { adminId: auth.session.sub, action: "finding_notice_previewed", entityType: "CrawlFinding", entityId: id, reason: "representative_notice" },
      request.headers,
      { required: true },
    );
  } catch {
    return noStore({ error: "access_log_failed" }, 503);
  }
  await writeAuditLog({
    eventType: "URL_REVEALED",
    entityType: "CrawlFinding",
    entityId: id,
    actorId: auth.session.sub,
    data: { reason: "representative_notice_preview", caseId: result.notice.caseId },
  });

  const n = result.notice;
  return noStore({
    findingId: n.findingId,
    caseId: n.caseId,
    caseReference: n.caseReference,
    urlId: n.urlId,
    platformName: n.platformName,
    recipientEmail: n.recipientEmail,
    transport: REPRESENTATIVE_TRANSPORT,
    subject: n.subject,
    body: n.pdfBody,
    emailBody: n.emailBody,
    noticeDate: n.noticeDate,
    signedAs: n.representativeReference,
    consent: { id: n.consentId, signedAt: n.consentSignedAt },
    templateId: n.templateId,
    fingerprintIds: n.fingerprintIds,
    approvedById: n.approvedById,
    secondApprovedById: n.secondApprovedById,
    pdfBase64: result.pdfBase64,
    contentDigest: n.contentDigest,
  });
}
