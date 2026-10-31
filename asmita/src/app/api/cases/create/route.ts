import { NextResponse } from "next/server";
import { z } from "zod";
import { createCase, getRegisteredCaseByKey, getVerifiedUserEmail, registerCaseWithUrls } from "@/lib/case-ops";
import { sha256 } from "@/lib/hash";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { sendVictimConfirmation } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkUrlSubmission } from "@/lib/abuse-detection";
import { getClientIp } from "@/lib/request-ip";
import {
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

const SCOPE = "cases:create";
const schema = z.object({
  urls: z.array(z.string().min(1)).max(10),
  declaration: z.literal(true),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/cases/create" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    await logSecurityEvent({
      event: auth.error === "minor_pathway_required" ? "minor_route_blocked" : "auth_failed",
      route: "/api/cases/create",
      reason: auth.error,
    });
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
  const idemKey = readIdempotencyKey(request);
  const registrationKeyHash = idemKey ? sha256(idemKey) : undefined;
  if (idemKey) {
    const cached = getCachedResponse(SCOPE, auth.session.sub, idemKey);
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
    const existing = await getRegisteredCaseByKey(auth.session.sub, registrationKeyHash!);
    if (existing) {
      return NextResponse.json(
        { caseId: existing.id, referenceNumber: existing.referenceNumber },
        { headers: { "Idempotency-Replayed": "true" } },
      );
    }
  }
  if (parsed.data.urls.length === 0 && process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const userLimit = await checkRateLimitAsync(`case-create:${auth.session.sub}`, 10, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(`case-create-ip:${getClientIp(request)}`, 30, 60 * 60_000);
  if (!userLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const record = parsed.data.urls.length > 0
    ? await (async () => {
        const abuse = checkUrlSubmission({ urls: parsed.data.urls, emailHash: auth.session.emailHash });
        return registerCaseWithUrls(auth.session.sub, parsed.data.urls, {
          flagReasons: abuse.reasons,
          registrationKeyHash,
        });
      })()
    : { ok: true as const, ...(await createCase(auth.session.sub)), accepted: 0 };
  if (!record.ok) {
    return NextResponse.json({ error: "invalid_urls", details: record.errors }, { status: 400 });
  }
  const email = await getVerifiedUserEmail(auth.session.sub);
  if (email && record.accepted > 0 && !record.replayed) {
    try {
      const dashboardUrl = new URL(`/case/${record.id}`, request.url).toString();
      await sendVictimConfirmation(email, record.referenceNumber, dashboardUrl);
      await writeAuditLog({
        eventType: "NOTICE_SENT",
        entityType: "Case",
        entityId: record.id,
        actorId: auth.session.sub,
        data: { messageType: "victim_confirmation" },
      });
    } catch {
      await writeAuditLog({
        eventType: "NOTICE_FAILED",
        entityType: "Case",
        entityId: record.id,
        actorId: auth.session.sub,
        data: { reason: "victim_confirmation_failed" },
      });
    }
  }
  const body = { caseId: record.id, referenceNumber: record.referenceNumber };
  if (idemKey) {
    rememberResponse(SCOPE, auth.session.sub, idemKey, 200, body);
  }
  return NextResponse.json(body);
}
