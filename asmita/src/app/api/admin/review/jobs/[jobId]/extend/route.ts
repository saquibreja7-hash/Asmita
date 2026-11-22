import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { extendClaim } from "@/lib/review-jobs";
import { requireJobAccess } from "../../job-route-guard";

// POST /api/admin/review/jobs/[jobId]/extend — the review screen's heartbeat
// (every 4 minutes while visible): another claim window on the caller's own
// lease, refused when the lease was lost or the job closed.

const STATUS: Record<string, number> = {
  job_not_found: 404,
  job_closed: 409,
  claim_lost: 409,
};

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const { jobId } = await context.params;
  const auth = await requireJobAccess(jobId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await extendClaim(jobId, auth.reviewerEmailHash);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true });
}
