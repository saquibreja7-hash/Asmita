import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { ORG_POST_STATUSES, deleteOrgPostDraft, orgPostUpdateSchema, setOrgPostStatus, updateOrgPost } from "@/lib/org-posts";

// Org post admin by id: edit fields, change status, delete a draft. The
// case-study publish gate lives in the store and answers 409 here.

const actionSchema = z.object({ action: z.enum(["publish", "unpublish", "archive"]) }).strict();
const MAX_BODY_BYTES = 128 * 1024;
const MAX_WRITES_PER_HOUR = 200;

const ACTION_STATUS = { publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED" } as const;
const STATUS_CODE: Record<string, number> = {
  post_not_found: 404,
  slug_taken: 409,
  case_study_checks_required: 409,
  not_a_draft: 409,
};

async function limited(sub: string) {
  return checkRateLimitAsync(`admin-org-posts:${sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/posts/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await limited(auth.session.sub)).allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/admin/org/posts/[id]" });
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
  // A status change arrives as {action}; an edit arrives as the full fields.
  const action = actionSchema.safeParse(body);
  if (action.success) {
    const status = ACTION_STATUS[action.data.action] as (typeof ORG_POST_STATUSES)[number];
    const result = await setOrgPostStatus(id, status, auth.session.sub);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS_CODE[result.error] ?? 400 });
    return NextResponse.json({ post: result.post });
  }
  const parsed = orgPostUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await updateOrgPost(id, parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS_CODE[result.error] ?? 400 });
  return NextResponse.json({ post: result.post });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/posts/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await limited(auth.session.sub)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const result = await deleteOrgPostDraft(id, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS_CODE[result.error] ?? 400 });
  return NextResponse.json({ ok: true });
}
