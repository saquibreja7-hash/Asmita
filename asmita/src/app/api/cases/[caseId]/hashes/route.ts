import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseForUser } from "@/lib/case-ops";
import { addHashesToCase, listHashesForCase, MAX_HASHES_PER_SUBMISSION } from "@/lib/hash-submission";
import { requireSession } from "@/lib/auth/middleware";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { getClientIp } from "@/lib/request-ip";
import { db } from "@/lib/db";
import {
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

const SCOPE = "cases:hashes";

// Phase 2 surface is feature-gated; until rollout gates pass (PDQ reference
// validation, legal review of HASH_ADVISORY, verified contacts) this route
// does not exist as far as clients are concerned.
function hashUploadEnabled() {
  return process.env.ENABLE_HASH_UPLOAD === "true";
}

// Hashes are exactly 64 hex chars. Anything longer is media smuggling and is
// rejected at the schema layer before validateHashItem runs.
const schema = z.object({
  hashes: z
    .array(
      z.object({
        hash: z.string().min(1).max(64),
        quality: z.number().int().min(0).max(100),
        clientVersion: z.string().max(50).optional(),
      }),
    )
    .min(1)
    .max(MAX_HASHES_PER_SUBMISSION),
  declaration: z.boolean().refine(Boolean),
  platformId: z.string().optional(),
});

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!hashUploadEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/cases/[caseId]/hashes" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  // Hash intake is adult-only by hard rule: minors are routed to the
  // minor-support flow, never the hash flow.
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    logSecurityEvent({
      event: "media_payload_rejected",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/hashes",
      reason: `content_length:${contentLength}`,
    });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
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

  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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

  const limit = await checkRateLimitAsync(`hashes:${caseId}`, 20, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(
    `hash-submit-ip:${getClientIp(request)}`,
    40,
    60 * 60_000,
  );
  if (!limit.allowed || !ipLimit.allowed) {
    logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/cases/[caseId]/hashes", reason: caseId });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { platformId } = parsed.data;
  const results = await addHashesToCase(caseId, parsed.data.hashes, { requestedPlatformId: platformId });
  const rejectedAsMedia = results.some((r) => !r.ok && r.error === "media_payload_rejected");
  if (rejectedAsMedia) {
    logSecurityEvent({
      event: "media_payload_rejected",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/hashes",
      reason: caseId,
    });
  }

  // Stamp declarationSignedAt so dispatchHashAdvisories (called at admin approval)
  // doesn't fail with declaration_required. Skip in dev (no DB).
  if (process.env.DATABASE_URL) {
    const caseRecord = await db.case.findUnique({
      where: { id: caseId },
      select: { declarationSignedAt: true },
    });
    if (!caseRecord?.declarationSignedAt) {
      await db.case.update({
        where: { id: caseId },
        data: { declarationSignedAt: new Date() },
      });
    }
  }

  const body = { results };
  if (idemKey) {
    rememberResponse(SCOPE, idemActor, idemKey, 200, body);
  }
  return NextResponse.json(body);
}

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!hashUploadEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId } = await context.params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const submissions = await listHashesForCase(caseId);
  return NextResponse.json({ submissions });
}
