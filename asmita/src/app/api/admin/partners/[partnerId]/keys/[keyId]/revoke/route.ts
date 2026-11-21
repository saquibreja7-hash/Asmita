import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { revokePlatformPartnerKey } from "@/lib/partner-admin";

// POST /api/admin/partners/[partnerId]/keys/[keyId]/revoke — revoke a key of
// this partner. A key of another partner answers key_not_found, so the id
// alone never reaches another partner's keys. platforms:edit, CSRF, audited.

const ACTIONS_PER_HOUR = 100;

const STATUS: Record<string, number> = {
  partner_not_found: 404,
  key_not_found: 404,
  key_revoked: 409,
};

export async function POST(request: Request, context: { params: Promise<{ partnerId: string; keyId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("platforms:edit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-partners:${auth.session.sub}`, ACTIONS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { partnerId, keyId } = await context.params;
  const result = await revokePlatformPartnerKey({ partnerId, keyId }, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ ok: true });
}
