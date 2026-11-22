import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { canSeeReviewQueue, getReviewQueueByKey, moveJob } from "@/lib/review-jobs";
import { requireJobAccess } from "../../job-route-guard";

// POST /api/admin/review/jobs/[jobId]/move — move a job to another queue by
// hand: the move is recorded as the job's closing decision and the subject
// reopens in the target queue. Moving OUT of the protected minor-hold queue
// is refused; moving INTO it needs SUPER_ADMIN, like the queue itself.

const schema = z
  .object({
    toQueueKey: z.string().trim().min(1).max(64),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

const STATUS: Record<string, number> = {
  job_not_found: 404,
  queue_not_found: 404,
  job_closed: 409,
  minor_hold: 409,
  queue_kind_mismatch: 400,
};

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const { jobId } = await context.params;
  const auth = await requireJobAccess(jobId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const target = await getReviewQueueByKey(parsed.data.toQueueKey);
  if (!target) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });
  if (!canSeeReviewQueue(auth.role, target)) {
    return NextResponse.json({ error: "permission_denied" }, { status: 403 });
  }

  const result = await moveJob(jobId, auth.reviewerEmailHash, target.id, { note: parsed.data.note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json(result);
}
