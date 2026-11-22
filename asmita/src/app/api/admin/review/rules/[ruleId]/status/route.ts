import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { REVIEW_RULE_STATUSES, setRoutingRuleStatus } from "@/lib/review-routing";

// POST /api/admin/review/rules/[ruleId]/status — switch a rule between
// DRAFT, LIVE and DISABLED (WP143). The switch is a saved version with its
// own REVIEW_RULE_CHANGED audit event, and going LIVE re-checks the
// destination queue.

const schema = z.object({ status: z.enum(REVIEW_RULE_STATUSES) }).strict();

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  rule_not_found: 404,
  invalid_status: 400,
  queue_not_found: 404,
  protected_queue: 409,
  queue_archived: 409,
  queue_kind_mismatch: 400,
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

  const result = await setRoutingRuleStatus({
    ruleId,
    status: parsed.data.status,
    role: auth.session.adminRole,
    actorEmailHash: auth.session.emailHash,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, rule: { id: result.rule.id, version: result.rule.version, status: result.rule.status } });
}
