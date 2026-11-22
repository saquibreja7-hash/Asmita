import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { requireStepUp } from "@/lib/auth/step-up";
import { revokeReviewQueueAccess } from "@/lib/review-jobs";

// DELETE /api/admin/review/queues/[queueId]/access/[accessId] — remove one
// access row (review-console-spec.md WP144). review:manage is re-checked in
// the library; removing the last row returns the queue to today's behaviour
// (every role with the adapter's permission). Step-up MFA applies like any
// queue access change.

export async function DELETE(request: Request, context: { params: Promise<{ queueId: string; accessId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const stepUp = requireStepUp(auth.session);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 403 });

  const { accessId } = await context.params;
  const result = await revokeReviewQueueAccess({
    accessId,
    callerRole: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) {
    const status = result.error === "permission_denied" ? 403 : result.error === "access_row_not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
