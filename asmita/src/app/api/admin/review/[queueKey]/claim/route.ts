import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin, requireAdminPermission } from "@/lib/auth/require-admin";
import { getReviewAdapter, reviewVisibilityPermission } from "@/lib/review-adapters";
import { claimNextJob, getReviewQueueByKey, reviewQueueVisibleTo } from "@/lib/review-jobs";

// POST /api/admin/review/[queueKey]/claim — "Start reviewing": claims the
// next job of the queue with a 10-minute lease and returns it. The queue's
// visibility permission gates the call (cases:read for the complaint
// queues, platforms:edit for partner applications, lab:manage for lab
// reports); the protected minor-hold queue is SUPER_ADMIN only. WP144: a
// queue with access rows answers only to the roles and admins they list
// (claimNextJob re-checks). Only ids come back: the job screen loads its
// own subject views.
// CSRF and admin auth like the other admin routes.

export async function POST(request: Request, context: { params: Promise<{ queueKey: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });

  const { queueKey } = await context.params;
  const queue = await getReviewQueueByKey(queueKey);
  if (!queue) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });

  const auth = queue.protected || queue.subjectKind === null
    ? await requireAdmin()
    : await requireAdminPermission(reviewVisibilityPermission(queue.subjectKind));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await reviewQueueVisibleTo({ role: auth.session.adminRole, emailHash: auth.session.emailHash }, queue))) {
    return NextResponse.json({ error: "permission_denied" }, { status: 403 });
  }

  const { job } = await claimNextJob({
    queueId: queue.id,
    role: auth.session.adminRole,
    reviewerEmailHash: auth.session.emailHash,
  });
  if (!job) return NextResponse.json({ job: null });

  // The decision buttons for this kind come from the adapter; the protected
  // queue offers none, because nothing there continues the adult flow.
  const adapter = queue.protected ? null : await getReviewAdapter(job.subjectKind);
  return NextResponse.json({
    job: { ...job, queueKey: queue.key },
    decisions: queue.protected ? [] : adapter?.decisions ?? [],
  });
}
