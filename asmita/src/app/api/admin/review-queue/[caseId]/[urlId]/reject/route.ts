import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewSubmittedUrl } from "@/lib/case-ops";

const schema = z.object({ reason: z.string().max(500).optional() });

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
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId, urlId } = await context.params;
  try {
    const url = await reviewSubmittedUrl({
      caseId,
      urlId,
      decision: "reject",
      reviewerId: auth.session.sub,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
