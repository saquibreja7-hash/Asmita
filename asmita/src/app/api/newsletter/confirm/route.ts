import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { confirmNewsletterSubscriber } from "@/lib/org-newsletter";

// Confirm a newsletter sign-up with the single-use token from the email
// (docs/org/spec.md, 56.7). An invalid or expired token gets the same
// refusal, so the endpoint reveals nothing about who is on the list.

const schema = z.object({ token: z.string().trim().regex(/^[a-f0-9]{16,128}$/) }).strict();

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/newsletter/confirm" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const limit = await checkRateLimitAsync(`newsletter-confirm-ip:${getClientIp(request)}`, 20, 60 * 60_000, {
    shared: true,
  });
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/newsletter/confirm" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await confirmNewsletterSubscriber(parsed.data.token);
  if (!result.ok) return NextResponse.json({ error: "token_invalid" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
