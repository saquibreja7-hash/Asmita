import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { actOnPartnerApplication, applicationActionSchema } from "@/lib/partner-admin";

// POST /api/admin/partners/applications/[applicationId]
//   { action: "contacted" | "approve" | "decline" }
// Approve creates the PlatformPartner and marks the application ONBOARDED.
// platforms:edit, CSRF, rate limited, every action audited (partner-admin.ts).

const ACTIONS_PER_HOUR = 100;

const STATUS: Record<string, number> = {
  application_not_found: 404,
  invalid_status: 409,
  partner_exists: 409,
};

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("platforms:edit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-partners:${auth.session.sub}`, ACTIONS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = applicationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { applicationId } = await context.params;
  const result = await actOnPartnerApplication({ applicationId, ...parsed.data }, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json(result);
}
