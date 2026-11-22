import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { saveRoutingRule, CONDITION_MAX_LEAVES, ROUTING_OPS, RULE_DESCRIPTION_MAX, RULE_NAME_MAX } from "@/lib/review-routing";

// POST /api/admin/review/rules/[ruleId] — save edits to one routing rule
// (WP143). Every save is a new append-only version and audits
// REVIEW_RULE_CHANGED; the destination queue and the condition are validated
// exactly like a new rule's.

const leafSchema = z
  .object({
    field: z.string().trim().min(1).max(64),
    op: z.enum(ROUTING_OPS),
    value: z.union([z.string().max(64), z.number(), z.array(z.string().max(64)).max(20), z.null()]).optional(),
  })
  .strict();

const conditionSchema = z.union([
  z.object({ all: z.array(leafSchema).min(1).max(CONDITION_MAX_LEAVES) }).strict(),
  z.object({ any: z.array(leafSchema).min(1).max(CONDITION_MAX_LEAVES) }).strict(),
]);

const schema = z
  .object({
    name: z.string().trim().min(1).max(RULE_NAME_MAX).optional(),
    description: z.string().trim().max(RULE_DESCRIPTION_MAX).optional().nullable(),
    condition: conditionSchema.optional(),
    destinationQueueId: z.string().trim().min(1).max(64).optional(),
    priority: z.number().int().min(-100).max(100).optional(),
  })
  .strict();

const CHANGES_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  rule_not_found: 404,
  invalid_name: 400,
  invalid_description: 400,
  invalid_priority: 400,
  links_not_allowed: 400,
  invalid_condition: 400,
  unknown_field: 400,
  invalid_op: 400,
  invalid_value: 400,
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

  const result = await saveRoutingRule({
    ruleId,
    name: parsed.data.name,
    description: parsed.data.description,
    condition: parsed.data.condition,
    destinationQueueId: parsed.data.destinationQueueId,
    priority: parsed.data.priority,
    role: auth.session.adminRole,
    actorEmailHash: auth.session.emailHash,
    actorId: auth.session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, rule: { id: result.rule.id, version: result.rule.version, status: result.rule.status } });
}
