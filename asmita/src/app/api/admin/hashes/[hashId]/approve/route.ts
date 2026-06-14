import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewHashSubmission } from "@/lib/hash-submission";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { db } from "@/lib/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ hashId: string }> },
) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { hashId } = await context.params;

  // Read requestedPlatformId before approving (approval changes status).
  const record = await db.hashSubmission.findUnique({
    where: { id: hashId },
    select: { caseId: true, requestedPlatformId: true },
  });
  if (!record) {
    return NextResponse.json({ error: "hash_submission_not_found" }, { status: 404 });
  }

  let submission;
  try {
    submission = await reviewHashSubmission({
      hashSubmissionId: hashId,
      decision: "approve",
      reviewerId: auth.session.sub,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  // If the survivor nominated a platform, dispatch the advisory immediately.
  let dispatchResult = null;
  if (record.requestedPlatformId) {
    try {
      const results = await dispatchHashAdvisories({
        caseId: record.caseId,
        platformIds: [record.requestedPlatformId],
        actorId: auth.session.sub,
      });
      dispatchResult = results[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "dispatch_error";
      dispatchResult = { dispatched: false, reason: msg };
    }
  }

  return NextResponse.json({ success: true, submission, dispatchResult });
}
