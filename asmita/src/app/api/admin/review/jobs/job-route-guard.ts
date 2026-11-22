import { requireAdmin } from "@/lib/auth/require-admin";
import type { AdminRole } from "@/lib/auth/admin-permissions";
import { canSeeReviewQueue, getReviewJobWithQueue, type ReviewJobRow, type ReviewQueueRow } from "@/lib/review-jobs";

/*
 * Shared guard for the review-job routes: an authenticated admin who may see
 * the job's queue (the protected minor-hold queue is SUPER_ADMIN only), with
 * the job and queue handed back for the per-kind permission checks. CSRF is
 * checked by each route before this runs, like the other admin routes.
 */

export type JobRouteAuth =
  | { ok: true; reviewerEmailHash: string; reviewerId: string; role: AdminRole; job: ReviewJobRow; queue: ReviewQueueRow }
  | { ok: false; status: number; error: string };

export async function requireJobAccess(jobId: string): Promise<JobRouteAuth> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };
  const loaded = await getReviewJobWithQueue(jobId);
  if (!loaded) return { ok: false, status: 404, error: "job_not_found" };
  if (!canSeeReviewQueue(auth.session.adminRole, loaded.queue)) {
    return { ok: false, status: 403, error: "permission_denied" };
  }
  return {
    ok: true,
    reviewerEmailHash: auth.session.emailHash,
    reviewerId: auth.session.sub,
    role: auth.session.adminRole,
    job: loaded.job,
    queue: loaded.queue,
  };
}
