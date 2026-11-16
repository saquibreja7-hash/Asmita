import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { verifyCsrfRequest } from "@/lib/csrf";
import { reviewCrawlFinding } from "@/lib/crawl-findings";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// POST /api/admin/findings/[id]/review { decision: "approve" | "dismiss" }.
// Above distance 20 an approval needs a second, different reviewer. Final
// approval adds the page URL to the case (source CRAWLER); nothing is sent.
// Refused (503 crawler_disabled) while ENABLE_CRAWLER is off.

const schema = z.object({ decision: z.enum(["approve", "dismiss"]) }).strict();
const REVIEWS_PER_HOUR = 200;

const STATUS: Record<string, number> = {
  finding_not_found: 404,
  case_not_found: 404,
  already_reviewed: 409,
  second_reviewer_required: 409,
  consent_withdrawn: 409,
  invalid_url: 409,
  finding_expired: 410,
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const limit = await checkRateLimitAsync(`admin-finding-review:${auth.session.sub}`, REVIEWS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await context.params;
  const outcome = await reviewCrawlFinding({ findingId: id, decision: parsed.data.decision, reviewerId: auth.session.sub });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: STATUS[outcome.error] ?? 409 });
  return NextResponse.json(outcome);
}
