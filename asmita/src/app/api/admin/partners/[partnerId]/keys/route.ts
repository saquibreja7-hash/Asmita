import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { issueKeySchema, issuePlatformPartnerKey } from "@/lib/partner-admin";

// POST /api/admin/partners/[partnerId]/keys { label } — issue a partner key.
// The key is returned exactly once here; only its sha256 is stored, and no
// route or page can ever show it again. platforms:edit, CSRF, audited.

const ACTIONS_PER_HOUR = 100;

export async function POST(request: Request, context: { params: Promise<{ partnerId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("platforms:edit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-partners:${auth.session.sub}`, ACTIONS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = issueKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { partnerId } = await context.params;
  const result = await issuePlatformPartnerKey({ partnerId, ...parsed.data }, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ keyId: result.keyId, key: result.key }, { status: 201 });
}
