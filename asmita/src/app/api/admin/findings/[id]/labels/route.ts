import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { verifyCsrfRequest } from "@/lib/csrf";
import { applyFindingLabel, CLEAR_REASON_MAX, FINDING_LABELS } from "@/lib/crawl-findings";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// POST /api/admin/findings/[id]/labels { action: "set" | "clear", label,
// reason? } (review labels WP37). Analysts can mark a finding "Looks
// AI-made", "Sexual content" or "Possible minor"; every change is audited
// like a review. The possible-minor label is a safety switch: while set the
// finding cannot be approved or noticed and sits in the minors protocol;
// clearing it needs a different admin than the setter and a reason.
// Refused (503 crawler_disabled) while ENABLE_CRAWLER is off, like every
// finding change.

const schema = z
  .object({
    action: z.enum(["set", "clear"]),
    label: z.enum(FINDING_LABELS),
    reason: z.string().max(CLEAR_REASON_MAX).optional(),
  })
  .strict();

const LABELS_PER_HOUR = 200;

const STATUS: Record<string, number> = {
  finding_not_found: 404,
  label_not_set: 409,
  label_conflict: 409,
  reason_required: 400,
  second_admin_required: 409,
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const limit = await checkRateLimitAsync(`admin-finding-labels:${auth.session.sub}`, LABELS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await context.params;
  const outcome = await applyFindingLabel({
    findingId: id,
    action: parsed.data.action,
    label: parsed.data.label,
    adminId: auth.session.sub,
    reason: parsed.data.reason,
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: STATUS[outcome.error] ?? 409 });
  return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
