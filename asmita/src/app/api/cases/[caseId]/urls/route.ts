import { NextResponse } from "next/server";
import { z } from "zod";
import { addUrlsToCase, getCaseForUser } from "@/lib/case-ops";
import { requireSession } from "@/lib/auth/middleware";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkUrlSubmission } from "@/lib/abuse-detection";
import { getClientIp } from "@/lib/request-ip";
import {
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

const SCOPE = "cases:urls";

const schema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(10),
  declaration: z.boolean().refine(Boolean),
});

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/cases/[caseId]/urls" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId } = await context.params;

  // Verify case ownership - no auto-creation, prevents the IDOR bug from the old ensureCaseForUser pattern
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Idempotency replay - scoped to (user, caseId, key) so two cases can use
  // the same client key without collision.
  const idemKey = readIdempotencyKey(request);
  const idemActor = `${auth.session.sub}:${caseId}`;
  if (idemKey) {
    const cached = getCachedResponse(SCOPE, idemActor, idemKey);
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
  }

  const limit = await checkRateLimitAsync(`urls:${caseId}`, 10, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(`url-submit-ip:${getClientIp(request)}`, 30, 60 * 60_000);
  if (!limit.allowed || !ipLimit.allowed) {
    logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/cases/[caseId]/urls", reason: caseId });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const abuse = checkUrlSubmission({ urls: parsed.data.urls, emailHash: auth.session.emailHash });
  if (abuse.flagged) {
    logSecurityEvent({
      event: "flagged_submission",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/urls",
      reason: abuse.reasons.join(","),
    });
  }
  const results = await addUrlsToCase(caseId, parsed.data.urls, { flagReasons: abuse.reasons });
  const body = {
    results,
    flaggedForReview: abuse.flagged,
    flagReasons: abuse.reasons,
  };
  if (idemKey) {
    rememberResponse(SCOPE, idemActor, idemKey, 200, body);
  }
  return NextResponse.json(body);
}
