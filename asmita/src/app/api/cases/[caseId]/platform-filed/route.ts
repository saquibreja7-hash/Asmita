import { NextResponse } from "next/server";
import { z } from "zod";
import { markPlatformFiled } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";

// The survivor filed a form-only platform's own form. That starts the
// escalation ladder for the link (docs/product/escalation-ladder.md).
const schema = z.object({ urlId: z.string().min(1).max(64) });

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId } = await context.params;
  try {
    await markPlatformFiled(caseId, auth.session.sub, parsed.data.urlId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "url_not_found" || message === "case_not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // A database fault is not "not found": let it show as a server error.
    throw err;
  }
  return NextResponse.json({ success: true });
}
