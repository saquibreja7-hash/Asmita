import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { unsubscribeNewsletterSubscriber } from "@/lib/org-newsletter";

// Unsubscribe from the newsletter with the per-subscriber token from any
// email we send (docs/org/spec.md, 56.7). Idempotent: unsubscribing twice
// is fine, and an unknown token gets the same refusal as any other.

const schema = z.object({ token: z.string().trim().regex(/^[a-f0-9]{16,128}$/) }).strict();

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/newsletter/unsubscribe" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const limit = await checkRateLimitAsync(`newsletter-unsub-ip:${getClientIp(request)}`, 20, 60 * 60_000, {
    shared: true,
  });
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/newsletter/unsubscribe" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await unsubscribeNewsletterSubscriber(parsed.data.token);
  if (!result.ok) return NextResponse.json({ error: "token_invalid" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
