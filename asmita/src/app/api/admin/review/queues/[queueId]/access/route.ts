import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { anyAdminHashByTargetKey } from "@/lib/auth/admin-allowlist";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { requireStepUp } from "@/lib/auth/step-up";
import { grantReviewQueueAccess } from "@/lib/review-jobs";

// POST /api/admin/review/queues/[queueId]/access — narrow one queue by
// adding an access row (review-console-spec.md WP144). The row names either
// one role or one admin, never both; the Admins page targets an admin by
// their opaque key (the hash of the email hash, resolved against the
// allowlist here, so the page never renders the single-step hash either).
// review:manage (SUPER_ADMIN only) is re-checked in the library, and
// changing queue access needs a fresh authenticator proof (step-up MFA).
// The protected minor-hold queue ignores rows and refuses them here.

const schema = z
  .object({
    role: z.enum(["SUPER_ADMIN", "LEGAL_ADVISOR", "CASE_REVIEWER", "GO_EDITOR", "SUPPORT_AGENT"]).optional(),
    adminEmailHash: z.string().regex(/^[a-f0-9]{16,128}$/).optional(),
    adminKey: z.string().regex(/^[a-f0-9]{16,128}$/).optional(),
  })
  .strict()
  .refine((value) => [value.role, value.adminEmailHash, value.adminKey].filter(Boolean).length === 1, {
    message: "one_target_required",
  });

const CHANGES_PER_HOUR = 120;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  queue_not_found: 404,
  protected_queue: 409,
  queue_archived: 409,
  invalid_target: 400,
};

export async function POST(request: Request, context: { params: Promise<{ queueId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const stepUp = requireStepUp(auth.session);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 403 });
  const { queueId } = await context.params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-access:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await grantReviewQueueAccess({
    queueId,
    role: parsed.data.role,
    adminEmailHash:
      parsed.data.adminEmailHash ?? ((await anyAdminHashByTargetKey(parsed.data.adminKey ?? "")) ?? undefined),
    callerRole: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, row: { id: result.row.id, role: result.row.role, adminEmailHash: result.row.adminEmailHash } });
}
