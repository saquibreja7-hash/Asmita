import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewHashSubmission } from "@/lib/hash-submission";
import { db } from "@/lib/db";
import { voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";

const schema = z.object({ reason: z.string().max(500).optional() });

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
  let reason: string | undefined;
  try {
    const parsed = schema.safeParse(await request.json());
    if (parsed.success) reason = parsed.data.reason;
  } catch {
    // Body is optional for rejections.
  }
  let submission;
  try {
    submission = await reviewHashSubmission({
      hashSubmissionId: hashId,
      decision: "reject",
      reviewerId: auth.session.sub,
      reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  // Unsent signatures that list this fingerprint can never be dispatched;
  // void them so the survivor can sign the current set again.
  // The rejection is already committed. If voiding fails here, dispatch voids
  // the same signatures on its next attempt, so report success either way.
  let voided: Awaited<ReturnType<typeof voidSignaturesWithRejectedFingerprints>> | null = null;
  try {
    const { caseId } = await db.hashSubmission.findUniqueOrThrow({ where: { id: hashId }, select: { caseId: true } });
    voided = await voidSignaturesWithRejectedFingerprints(caseId, { trigger: "rejection", actorId: auth.session.sub });
  } catch (err) {
    console.error("Voiding signatures after rejection failed; dispatch will retry", err);
  }
  return NextResponse.json({ success: true, submission, voided });
}
