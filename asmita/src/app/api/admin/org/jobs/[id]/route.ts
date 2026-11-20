import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { ORG_JOB_STATUSES, orgJobSchema, setOrgJobStatus, updateOrgJob } from "@/lib/org-jobs";

// Edit a job (full fields) or open/close it ({status}). content:manage.

const statusSchema = z.object({ status: z.enum(ORG_JOB_STATUSES) }).strict();
const MAX_BODY_BYTES = 32 * 1024;
const MAX_WRITES_PER_HOUR = 100;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/jobs/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-jobs:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const status = statusSchema.safeParse(body);
  if (status.success) {
    const result = await setOrgJobStatus(id, status.data.status, auth.session.sub);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ job: result.job });
  }
  const parsed = orgJobSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await updateOrgJob(id, parsed.data, auth.session.sub);
  if (!result.ok) {
    const code = result.error === "job_not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status: code });
  }
  return NextResponse.json({ job: result.job });
}
