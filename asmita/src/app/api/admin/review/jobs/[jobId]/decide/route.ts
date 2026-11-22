import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getReviewAdapter } from "@/lib/review-adapters";
import { decideJob } from "@/lib/review-jobs";
import { requireJobAccess } from "../../job-route-guard";

// POST /api/admin/review/jobs/[jobId]/decide — submit a decision on a held
// job. The adapter's permission gates the call (exactly today's check for
// this subject kind), the decision must be one of the adapter's, and the
// queue's reason flags are enforced server-side. decideJob runs the existing
// library function for the subject, with its own audit event, and records
// the ReviewDecision that closed the job. A job in the protected minor-hold
// queue refuses every decision.

const schema = z
  .object({
    decision: z.string().trim().min(1).max(64),
    reasonCode: z.string().trim().max(64).optional(),
    reasonNote: z.string().trim().max(2000).optional(),
  })
  .strict();

const DECIDES_PER_HOUR = 200;

const STATUS: Record<string, number> = {
  job_not_found: 404,
  queue_not_found: 404,
  url_not_found: 404,
  hash_submission_not_found: 404,
  finding_not_found: 404,
  report_not_found: 404,
  application_not_found: 404,
  unknown_decision: 400,
  reason_required: 400,
  reason_note_required: 400,
  invalid_reason: 400,
  invalid_payload: 400,
  no_abuse_email: 409,
  claim_lost: 409,
  job_closed: 409,
  not_awaiting_review: 409,
  unknown_platform_requires_investigation: 409,
  already_reviewed: 409,
  second_reviewer_required: 409,
  minor_protocol_active: 409,
  minor_hold: 409,
  consent_withdrawn: 409,
  invalid_status: 409,
  partner_exists: 409,
  report_already_sent: 409,
  hash_upload_disabled: 404,
  finding_expired: 410,
  crawler_disabled: 503,
  lab_disabled: 503,
  adapter_unavailable: 503,
};

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const { jobId } = await context.params;
  const auth = await requireJobAccess(jobId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  // The adapter's permission is the same check today's route for this
  // subject kind makes; requireJobAccess already proved the session and the
  // queue, so this is the decision right itself. The adapter re-checks it
  // inside decideJob, so the library cannot be talked into bypassing it.
  const adapter = await getReviewAdapter(auth.job.subjectKind);
  if (!adapter) return NextResponse.json({ error: "adapter_unavailable" }, { status: 503 });
  if (!hasAdminPermission(auth.role, adapter.permission)) {
    return NextResponse.json({ error: "permission_denied" }, { status: 403 });
  }

  const limit = await checkRateLimitAsync(`admin-review-decide:${auth.reviewerId}`, DECIDES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await decideJob({
    jobId,
    me: auth.reviewerEmailHash,
    reviewerId: auth.reviewerId,
    role: auth.role,
    decision: parsed.data.decision,
    reasonCode: parsed.data.reasonCode,
    reasonNote: parsed.data.reasonNote,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json(result);
}
