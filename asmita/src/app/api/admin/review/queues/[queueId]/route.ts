import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { renameReviewQueue } from "@/lib/review-jobs";

// POST /api/admin/review/queues/[queueId] — rename a custom queue and edit
// its description, order and reason flags (WP143). System queues and the
// protected minor-hold queue are refused; the queue's key never changes, so
// reasons and old decisions keep pointing at it.

const schema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(240).optional().nullable(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    requireReasonOnReject: z.boolean().optional(),
    requireReasonOnApprove: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "empty_update" });

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  queue_not_found: 404,
  protected_queue: 409,
  system_queue: 409,
  queue_archived: 409,
  invalid_name: 400,
  invalid_description: 400,
  invalid_sort_order: 400,
  links_not_allowed: 400,
};

export async function POST(request: Request, { params }: { params: Promise<{ queueId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { queueId } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-queues:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await renameReviewQueue({
    queueId,
    name: parsed.data.name,
    description: parsed.data.description,
    sortOrder: parsed.data.sortOrder,
    requireReasonOnReject: parsed.data.requireReasonOnReject,
    requireReasonOnApprove: parsed.data.requireReasonOnApprove,
    role: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, queue: { id: result.queue.id, key: result.queue.key, name: result.queue.name } });
}
