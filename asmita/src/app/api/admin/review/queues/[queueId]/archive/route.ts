import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { archiveReviewQueue } from "@/lib/review-jobs";

// POST /api/admin/review/queues/[queueId]/archive — archive an empty custom
// queue (WP143). Only empty ones, only custom ones, and only ones no routing
// rule points at; system queues and the protected minor-hold queue are
// refused. Archived queues keep their rows for old decisions' labels.

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  queue_not_found: 404,
  protected_queue: 409,
  system_queue: 409,
  queue_not_empty: 409,
  queue_in_use: 409,
};

export async function POST(request: Request, { params }: { params: Promise<{ queueId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { queueId } = await params;

  const limit = await checkRateLimitAsync(`admin-review-queues:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await archiveReviewQueue({
    queueId,
    role: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, queue: { id: result.queue.id, key: result.queue.key } });
}
