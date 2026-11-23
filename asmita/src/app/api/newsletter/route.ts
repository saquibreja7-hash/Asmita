import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { hashEmail } from "@/lib/hash";
import { newsletterSignupSchema, subscribeToNewsletter } from "@/lib/org-newsletter";

/*
 * Newsletter sign-up (docs/org/spec.md, 56.7): one click, no confirmation
 * email (owner decision, 2026-11-23). The response is identical whether the
 * address is new or already on the list, so the form cannot be used to find
 * out who is subscribed.
 */

const MAX_BODY_BYTES = 2 * 1024;
const MAX_PER_IP_PER_HOUR = 10;
const MAX_PER_EMAIL_PER_DAY = 5;

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/newsletter" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const limit = await checkRateLimitAsync(`newsletter-ip:${getClientIp(request)}`, MAX_PER_IP_PER_HOUR, 60 * 60_000, {
    shared: true,
  });
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/newsletter" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const parsed = newsletterSignupSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const fields = parsed.data;

  // A bot filled the hidden field: answer as if it worked, store nothing.
  if (fields.fax) return NextResponse.json({ ok: true });

  const perEmail = await checkRateLimitAsync(
    `newsletter-email:${hashEmail(fields.email)}`,
    MAX_PER_EMAIL_PER_DAY,
    24 * 60 * 60_000,
  );
  if (!perEmail.allowed) {
    return NextResponse.json({ ok: true });
  }

  await subscribeToNewsletter({
    email: fields.email,
    firstName: fields.firstName,
    locale: fields.locale,
    source: fields.source,
  });
  return NextResponse.json({ ok: true });
}
