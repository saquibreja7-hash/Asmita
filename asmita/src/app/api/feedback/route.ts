import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { containsUrlLikeText, recordFeedback } from "@/lib/feedback";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

const schema = z.object({
  caseReference: z.string().regex(/^ASMITA-[A-Z0-9-]{4,32}$/).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/feedback" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  // Anyone can leave feedback, and it is now stored, so writes are limited
  // per network (shared: many survivors can sit behind one mobile IP).
  const limit = await checkRateLimitAsync(`feedback-ip:${getClientIp(request)}`, 20, 60 * 60_000, { shared: true });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (containsUrlLikeText(parsed.data.comment ?? "")) {
    return NextResponse.json({ error: "links_not_allowed" }, { status: 400 });
  }
  const record = await recordFeedback({
    ...parsed.data,
    rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5,
  });
  return NextResponse.json({ id: record.id });
}
