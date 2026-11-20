import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { getCaseForUser } from "@/lib/case-ops";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { convertWatchToCase } from "@/lib/watch-ops";

/*
 * POST /api/cases/[caseId]/watch/convert — "Take it down" on a found copy
 * (WP22). Turns the watch into a case (mode = CASE) and withdraws the
 * watch-only authorisation; the case page then asks for the full crawl
 * authorisation tick on the spot, and once given, the existing
 * representative-notice path applies to the finding. Adults only, her own
 * case, CSRF-checked. Nothing is sent here.
 */

const CONVERTS_PER_HOUR = 10;

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, context: Context) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/cases/[caseId]/watch/convert" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { caseId } = await context.params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (record.mode !== "WATCH") return NextResponse.json({ error: "not_a_watch" }, { status: 409 });
  const limit = await checkRateLimitAsync(`watch-convert:${auth.session.sub}`, CONVERTS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const converted = await convertWatchToCase(record.id, auth.session.sub);
  if (!converted.ok) return NextResponse.json({ error: converted.error }, { status: 409 });
  return NextResponse.json({ ok: true, mode: "CASE" });
}
