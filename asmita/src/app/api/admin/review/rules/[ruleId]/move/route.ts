import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { moveRoutingRule } from "@/lib/review-routing";

// POST /api/admin/review/rules/[ruleId]/move — move a rule one step up or
// down in its kind's sequence (WP143). Accessible buttons, no drag required;
// both swapped rows get a new version.

const schema = z.object({ direction: z.enum(["up", "down"]) }).strict();

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  rule_not_found: 404,
};

export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ruleId } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-rules:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await moveRoutingRule({
    ruleId,
    direction: parsed.data.direction,
    role: auth.session.adminRole,
    actorEmailHash: auth.session.emailHash,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, rule: { id: result.rule.id, version: result.rule.version, sequence: result.rule.sequence } });
}
