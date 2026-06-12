import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewHashSubmission } from "@/lib/hash-submission";

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
  const auth = await requireAdmin();
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
  try {
    const submission = await reviewHashSubmission({
      hashSubmissionId: hashId,
      decision: "reject",
      reviewerId: auth.session.sub,
      reason,
    });
    return NextResponse.json({ success: true, submission });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
