import { NextResponse } from "next/server";
import { z } from "zod";
import { addUrlsToCase } from "@/lib/store";
import { requireSession } from "@/lib/auth/middleware";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkUrlSubmission } from "@/lib/abuse-detection";
import { getClientIp } from "@/lib/request-ip";

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
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId } = await context.params;
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
  return NextResponse.json({ results, flaggedForReview: abuse.flagged, flagReasons: abuse.reasons });
}
