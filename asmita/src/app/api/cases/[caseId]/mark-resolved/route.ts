import { NextResponse } from "next/server";
import { z } from "zod";
import { markUrlResolved } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireSession } from "@/lib/auth/middleware";

const schema = z.object({ urlId: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const parsed = schema.partial().safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId } = await context.params;
  try {
    await markUrlResolved(caseId, auth.session.sub, parsed.data.urlId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
