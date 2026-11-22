import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  latestCompletedScorecardPeriod,
  isValidScorecardPeriodForCompute,
  isScorecardPeriod,
} from "@/lib/scorecard";
import {
  listScorecardSnapshots,
  recomputeScorecardSnapshot,
  scorecardPeriodSchema,
} from "@/lib/scorecard-snapshots";

// Scorecard admin (docs/org/spec.md, WP58): content:manage. GET lists the
// snapshots; POST computes (or refreshes) the DRAFT for a period — the
// default is the latest completed quarter. Every write is CSRF-checked,
// rate-limited and audited in the store.

const computeSchema = z
  .object({ period: scorecardPeriodSchema.optional() })
  .strict();

const MAX_WRITES_PER_HOUR = 50;

export async function GET() {
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const snapshots = await listScorecardSnapshots();
  return NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/scorecard" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-scorecard:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/admin/org/scorecard" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > 2048) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = null;
  }
  const parsed = computeSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const period = parsed.data.period ?? latestCompletedScorecardPeriod();
  if (!isScorecardPeriod(period) || !isValidScorecardPeriodForCompute(period)) {
    return NextResponse.json({ error: "period_in_future", field: "period" }, { status: 400 });
  }
  const result = await recomputeScorecardSnapshot(period, auth.session.sub);
  if (!result.ok) {
    const status = result.error === "period_published" ? 409 : result.error === "period_invalid" ? 400 : 400;
    return NextResponse.json({ error: result.error, field: "period" }, { status });
  }
  return NextResponse.json({ snapshot: result.snapshot, created: result.created }, { status: result.created ? 201 : 200 });
}
