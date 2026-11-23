import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { ORG_SUBMISSION_STATUSES, addOrgSubmissionNote, setOrgSubmissionStatus } from "@/lib/org-submissions";

// Status changes and internal notes on one submission (56.2). Both are
// audited in the store; closing a record starts its retention clock.

const statusSchema = z.object({ status: z.enum(ORG_SUBMISSION_STATUSES) }).strict();
const noteSchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();
const MAX_WRITES_PER_HOUR = 300;

async function limited(sub: string) {
  return checkRateLimitAsync(`admin-org-submissions:${sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/submissions/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("outreach:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await limited(auth.session.sub)).allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/admin/org/submissions/[id]" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await setOrgSubmissionStatus(id, parsed.data.status, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/submissions/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("outreach:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await limited(auth.session.sub)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await addOrgSubmissionNote(id, parsed.data.note, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ notes: result.notes });
}
