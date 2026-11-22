import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { testRoutingRules } from "@/lib/review-routing";

// POST /api/admin/review/rules/test — the Test panel's dry run (WP143):
// every rule of a kind against an existing open job's subject or
// hand-entered field values, per condition, with the queue that would be
// chosen. Nothing is routed, nothing is written, nothing is logged.

const factsValue = z.union([z.string().max(64), z.number(), z.array(z.string().max(64)), z.null()]);

const schema = z
  .object({
    kind: z.enum(["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION", "LAB_REPORT"]),
    jobId: z.string().trim().min(1).max(64).optional(),
    facts: z.record(z.string(), factsValue).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.jobId) || body.facts !== undefined, { message: "jobId_or_facts_required" });

const RUNS_PER_HOUR = 120;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  fields_unavailable: 400,
  invalid_facts: 400,
  unknown_field: 400,
  invalid_value: 400,
  job_not_found: 404,
  job_kind_mismatch: 400,
  job_closed: 409,
  subject_unavailable: 404,
  review_queue_missing: 409,
};

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-review-rules-test:${auth.session.sub}`, RUNS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await testRoutingRules({
    kind: parsed.data.kind,
    jobId: parsed.data.jobId,
    facts: parsed.data.facts,
    role: auth.session.adminRole,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, results: result.results, chosenQueue: result.chosenQueue });
}
