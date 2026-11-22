import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createReviewQueue } from "@/lib/review-jobs";

// POST /api/admin/review/queues — add one custom queue for a kind
// (review-console-spec.md WP143). Never a default queue, never protected;
// the system queues and the protected minor-hold queue are not editable.

const schema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).optional().nullable(),
    subjectKind: z.enum(["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION", "LAB_REPORT"]),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    requireReasonOnReject: z.boolean().optional(),
    requireReasonOnApprove: z.boolean().optional(),
  })
  .strict();

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  invalid_name: 400,
  invalid_description: 400,
  links_not_allowed: 400,
  queue_key_exists: 409,
};

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-queues:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await createReviewQueue({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    subjectKind: parsed.data.subjectKind,
    sortOrder: parsed.data.sortOrder,
    requireReasonOnReject: parsed.data.requireReasonOnReject,
    requireReasonOnApprove: parsed.data.requireReasonOnApprove,
    role: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, queue: { id: result.queue.id, key: result.queue.key, name: result.queue.name } });
}
