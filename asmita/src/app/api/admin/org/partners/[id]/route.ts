import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { orgPartnerSchema, setOrgPartnerVisibility, updateOrgPartner } from "@/lib/org-partners";

// Edit a partner (full fields) or show/hide it ({isPublic}). content:manage.

const visibilitySchema = z.object({ isPublic: z.boolean() }).strict();
const MAX_BODY_BYTES = 32 * 1024;
const MAX_WRITES_PER_HOUR = 100;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/partners/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-partners:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
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
  const visibility = visibilitySchema.safeParse(body);
  if (visibility.success) {
    const result = await setOrgPartnerVisibility(id, visibility.data.isPublic, auth.session.sub);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ partner: result.partner });
  }
  const parsed = orgPartnerSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await updateOrgPartner(id, parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ partner: result.partner });
}
