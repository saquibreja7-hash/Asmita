import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { maybeSyncReviewJobs, queueSummaries } from "@/lib/review-jobs";

// GET /api/admin/review/summary — one row per queue the viewer may see:
// pending count, oldest age, arrivals in the last four hours and day, and
// how many jobs this reviewer holds. Counts only, never subject data. The
// lazy sync tops the jobs up first (throttled to once per 30 s per isolate).

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await maybeSyncReviewJobs();
  const queues = await queueSummaries({ role: auth.session.adminRole, emailHash: auth.session.emailHash });
  return NextResponse.json({ queues }, { headers: { "Cache-Control": "no-store" } });
}

