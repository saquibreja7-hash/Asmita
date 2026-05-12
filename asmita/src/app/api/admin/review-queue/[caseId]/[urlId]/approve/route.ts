import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewSubmittedUrl } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; urlId: string }> },
) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId, urlId } = await context.params;
  const url = await reviewSubmittedUrl({ caseId, urlId, decision: "approve", reviewerId: auth.session.sub });
  return NextResponse.json({ success: true, url });
}
