import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { recordAdminAccess, REVEAL_REASONS } from "@/lib/admin-access-log";
import { writeAuditLog } from "@/lib/audit";
import { findingUrlsExpired, getFindingUrlsForReveal } from "@/lib/crawl-findings";
import { decryptField } from "@/lib/encryption";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// GET /api/admin/findings/[id]?reason=check_removal: shows one finding's page
// and image URL to a reviewer who gives a reason, as the link reveal does
// (/api/admin/urls/[urlId]/reveal): access log first (no reveal without a
// record), then the audit chain, rate-limited per admin, never cached.

const querySchema = z.object({ reason: z.enum(REVEAL_REASONS) }).strict();
const REVEALS_PER_HOUR = 20;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return noStore({ error: "reason_required" }, 400);

  const limit = await checkRateLimitAsync(`admin-finding-reveal:${auth.session.sub}`, REVEALS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);

  const { id } = await context.params;
  const finding = await getFindingUrlsForReveal(id);
  if (!finding) return noStore({ error: "finding_not_found" }, 404);
  if (findingUrlsExpired(finding) || !finding.imageUrlEncrypted) return noStore({ error: "url_expired" }, 410);

  try {
    await recordAdminAccess(
      { adminId: auth.session.sub, action: "finding_revealed", entityType: "CrawlFinding", entityId: finding.id, reason: parsed.data.reason },
      request.headers,
      { required: true },
    );
  } catch {
    return noStore({ error: "access_log_failed" }, 503);
  }
  await writeAuditLog({
    eventType: "URL_REVEALED",
    entityType: "CrawlFinding",
    entityId: finding.id,
    actorId: auth.session.sub,
    data: { reason: parsed.data.reason },
  });

  return noStore({ pageUrl: decryptField(finding.pageUrlEncrypted), imageUrl: decryptField(finding.imageUrlEncrypted) });
}
