import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { moveReviewReason, renameReviewReason, setReviewReasonActive, REASON_LABEL_MAX } from "@/lib/review-reasons";

// POST /api/admin/review/settings/reasons/[reasonId] — edit one reason
// (WP142): rename it, reorder it one step, or deactivate/reactivate it.
// SUPER_ADMIN only (the library re-checks). There is no delete: a reason a
// decision uses always keeps its label.

const schema = z
  .object({
    label: z.string().trim().min(1).max(REASON_LABEL_MAX).optional(),
    active: z.boolean().optional(),
    move: z.enum(["up", "down"]).optional(),
  })
  .strict()
  .refine((data) => data.label !== undefined || data.active !== undefined || data.move !== undefined, {
    message: "empty",
  });

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  reason_not_found: 404,
  invalid_label: 400,
};

export async function POST(request: Request, context: { params: Promise<{ reasonId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { reasonId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-settings:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const common = { reasonId, role: auth.session.adminRole, actorId: auth.session.sub };
  let result;
  if (parsed.data.move !== undefined) {
    result = await moveReviewReason({ ...common, direction: parsed.data.move });
  } else if (parsed.data.active !== undefined) {
    result = await setReviewReasonActive({ ...common, active: parsed.data.active });
  } else {
    result = await renameReviewReason({ ...common, label: parsed.data.label! });
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, reason: { id: result.reason.id, label: result.reason.label, active: result.reason.active, sortOrder: result.reason.sortOrder } });
}
