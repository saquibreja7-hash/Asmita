import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { addReviewReason, REASON_CODE_PATTERN, REASON_LABEL_MAX } from "@/lib/review-reasons";

// POST /api/admin/review/settings/reasons — add one reason to a queue's
// decision (WP142). SUPER_ADMIN only (the library re-checks; WP144 moves
// this gate to the review:manage permission). The decision must be one the
// queue's adapter offers; reasons are never deleted, only deactivated.

const schema = z
  .object({
    queueKey: z.string().trim().min(1).max(64),
    decision: z.string().trim().min(1).max(64),
    code: z.string().trim().regex(REASON_CODE_PATTERN),
    label: z.string().trim().min(1).max(REASON_LABEL_MAX),
  })
  .strict();

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  queue_not_found: 404,
  protected_queue: 409,
  invalid_decision: 400,
  invalid_label: 400,
  reason_exists: 409,
};

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-settings:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await addReviewReason({
    queueKey: parsed.data.queueKey,
    decision: parsed.data.decision,
    code: parsed.data.code,
    label: parsed.data.label,
    role: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, reason: { id: result.reason.id, sortOrder: result.reason.sortOrder } });
}
