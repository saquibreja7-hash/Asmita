import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewHashSubmission } from "@/lib/hash-submission";

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
  try {
    const submission = await reviewHashSubmission({
      hashSubmissionId: hashId,
      decision: "approve",
      reviewerId: auth.session.sub,
    });
    return NextResponse.json({ success: true, submission });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
