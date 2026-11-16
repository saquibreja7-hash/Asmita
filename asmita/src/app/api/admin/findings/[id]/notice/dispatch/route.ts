import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { dispatchRepresentativeNotice } from "@/lib/crawl-notice";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// POST /api/admin/findings/[id]/notice/dispatch { caseId, contentDigest }
// Sends the representative notice for an approved crawler finding, by email
// only, if every gate still holds and the notice is exactly the one the
// caller previewed (contentDigest from .../notice/preview; else 409
// notice_changed). Survivor-signed notices go through /api/notices/dispatch,
// which refuses crawler links. See src/lib/crawl-notice.ts and
// docs/product/crawler-notice-flow.md.

const schema = z.object({
  caseId: z.string().min(1).max(64),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const DISPATCHES_PER_HOUR = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const limit = await checkRateLimitAsync(`admin-finding-notice-dispatch:${auth.session.sub}`, DISPATCHES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await context.params;
  const result = await dispatchRepresentativeNotice({
    findingId: id,
    caseId: parsed.data.caseId,
    adminId: auth.session.sub,
    contentDigest: parsed.data.contentDigest,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.formUrl ? { formUrl: result.formUrl } : {}) }, { status: result.status });
  }
  return NextResponse.json({
    dispatched: result.dispatched,
    transport: result.transport,
    messageId: result.messageId,
    sentAt: result.sentAt,
    contentDigest: result.contentDigest,
  });
}
