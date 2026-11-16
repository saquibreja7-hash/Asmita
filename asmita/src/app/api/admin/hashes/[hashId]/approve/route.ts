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

  const record = await db.hashSubmission.findUnique({
    where: { id: hashId },
    select: { caseId: true },
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

  // The survivor signed one advisory for every platform they chose; once all
  // its fingerprints are approved it goes to each of them. Dispatch refuses
  // until then, and a platform already sent is skipped, so approving the
  // fingerprints one by one is safe.
  let dispatchResults: Awaited<ReturnType<typeof dispatchHashAdvisories>> | null = null;
  let dispatchResult: Awaited<ReturnType<typeof dispatchHashAdvisories>>[number] | { dispatched: false; reason: string } | null = null;
  const advisory = await db.case.findUnique({
    where: { id: record.caseId },
    select: { signedHashAdvisoryPdf: true, hashAdvisoryPlatformIds: true },
  });
  if (advisory?.signedHashAdvisoryPdf && advisory.hashAdvisoryPlatformIds.length > 0) {
    try {
      dispatchResults = await dispatchHashAdvisories({
        caseId: record.caseId,
        platformIds: [...new Set(advisory.hashAdvisoryPlatformIds)],
        actorId: auth.session.sub,
      });
      dispatchResult = dispatchResults[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "dispatch_error";
      dispatchResult = { dispatched: false, reason: msg };
    }
  }

  return NextResponse.json({ success: true, submission, dispatchResult, dispatchResults });
}
