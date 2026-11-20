import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  ORG_POST_KINDS,
  ORG_POST_STATUSES,
  createOrgPost,
  listOrgPostsForAdmin,
  orgPostSchema,
} from "@/lib/org-posts";

// Org posts admin (docs/org/spec.md, 56.1): content:manage. Reads list with
// kind/status filters; writes are CSRF-checked, Zod-validated and audited
// (in the store) with a per-admin rate limit.

const querySchema = z.object({
  kind: z.enum(ORG_POST_KINDS).optional(),
  status: z.enum(ORG_POST_STATUSES).optional(),
});

const MAX_BODY_BYTES = 128 * 1024; // markdown bodies
const MAX_WRITES_PER_HOUR = 200;

export async function GET(request: Request) {
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const posts = await listOrgPostsForAdmin(parsed.data);
  return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/posts" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-posts:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/admin/org/posts" });
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
  const parsed = orgPostSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await createOrgPost(parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "slug_taken" ? 409 : 400 });
  return NextResponse.json({ post: result.post }, { status: 201 });
}
