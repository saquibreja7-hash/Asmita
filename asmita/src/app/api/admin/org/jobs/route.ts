import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { ORG_JOB_STATUSES, createOrgJob, listOrgJobsForAdmin, orgJobSchema } from "@/lib/org-jobs";

// Job openings admin (docs/org/spec.md, 56.5): content:manage. Create here;
// edit and open/close on /api/admin/org/jobs/[id].

const MAX_BODY_BYTES = 32 * 1024;
const MAX_WRITES_PER_HOUR = 100;

export async function GET(request: Request) {
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const parsed = z.enum(ORG_JOB_STATUSES).optional().safeParse(status ?? undefined);
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const jobs = await listOrgJobsForAdmin({ status: parsed.data });
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/jobs" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-jobs:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/admin/org/jobs" });
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
  const parsed = orgJobSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await createOrgJob(parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ job: result.job }, { status: 201 });
}
