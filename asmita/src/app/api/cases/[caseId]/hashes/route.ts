import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseForUser } from "@/lib/case-ops";
import {
  addHashesToCase,
  fingerprintsClosedForCase,
  listHashesForCase,
  listDevHashPickerPlatforms,
  recordChosenAdvisoryPlatforms,
  MAX_HASHES_PER_SUBMISSION,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_FRAMES,
} from "@/lib/hash-submission";
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
// rejected at the schema layer before validateHashItem runs. Image items keep
// their exact old shape (`kind` defaults to image); a video item (video
// fingerprints WP17) is strict: only its four fields are accepted, and its
// frames are hashes plus two small integers, never video bytes.
const imageItem = z
  .object({
    kind: z.literal("image").optional(),
    hash: z.string().min(1).max(64),
    quality: z.number().int().min(0).max(100),
    clientVersion: z.string().max(50).optional(),
  })
  .strict();
const videoItem = z
  .object({
    kind: z.literal("video"),
    frames: z
      .array(
        z
          .object({
            hash: z.string().min(1).max(64),
            quality: z.number().int().min(0).max(100),
            t: z.number().int().min(0).max(MAX_VIDEO_DURATION_SEC),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_VIDEO_FRAMES),
    durationSec: z.number().int().min(1).max(MAX_VIDEO_DURATION_SEC),
    clientVersion: z.string().max(50).optional(),
  })
  .strict()
  .refine((item) => item.frames.every((frame) => frame.t <= item.durationSec), { message: "frame_after_end" });
// Strict throughout: an unknown key (a smuggled frame or data URL) is a
// rejection, never silently dropped.
const schema = z
  .object({
    hashes: z
      .array(z.union([imageItem, videoItem]))
      .min(1)
      .max(MAX_HASHES_PER_SUBMISSION),
    declaration: z.boolean().refine(Boolean),
    platformIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .strict();

// The largest legal request is MAX_HASHES_PER_SUBMISSION video items of
// MAX_VIDEO_FRAMES hashes each: 10 x 1000 x ~96 bytes of
// {"hash":"...","quality":100,"t":3600} is just under 1 MiB, so a body past
// this cap can never be a valid submission. Frame content is still checked
// field by field (validateVideoItem), exactly like an image hash.
const MAX_BODY_BYTES = 1_048_576;
// A request with no video item keeps the old image-only cap.
const MAX_IMAGE_ONLY_BODY_BYTES = 16_384;

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!hashUploadEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/cases/[caseId]/hashes" });
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
    await logSecurityEvent({
      event: "media_payload_rejected",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/hashes",
      reason: `content_length:${contentLength}`,
    });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  // Throttle before reading up to 1 MiB: parsing a large body costs the
  // Worker even when the request is later refused. Generous for real use
  // (60 uploads an hour per survivor); the per-case daily limit below still applies.
  const bodyLimit = await checkRateLimitAsync(`hashes-body:${auth.session.sub}`, 60, 60 * 60_000);
  if (!bodyLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Measure the bytes actually read: Content-Length can be absent or wrong.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const tooLarge = async (size: number) => {
    await logSecurityEvent({
      event: "media_payload_rejected",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/hashes",
      reason: `body_bytes:${size}`,
    });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  };
  const size = new TextEncoder().encode(raw).length;
  if (size > MAX_BODY_BYTES) return tooLarge(size);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (size > MAX_IMAGE_ONLY_BODY_BYTES && !parsed.data.hashes.some((item) => item.kind === "video")) {
    return tooLarge(size);
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

  // Fingerprints are added only while the case is being created.
  if (await fingerprintsClosedForCase(caseId)) {
    return NextResponse.json({ error: "fingerprints_closed" }, { status: 409 });
  }

  const limit = await checkRateLimitAsync(`hashes:${caseId}`, 20, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(
    `hash-submit-ip:${getClientIp(request)}`,
    40,
    60 * 60_000,
    { shared: true },
  );
  if (!limit.allowed || !ipLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/cases/[caseId]/hashes", reason: caseId });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { platformIds } = parsed.data;
  if (platformIds && platformIds.length > 0) {
    const known = process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL
      ? platformIds.filter((id) => listDevHashPickerPlatforms().some((p) => p.id === id)).length
      : await db.platform.count({ where: { id: { in: platformIds }, isActive: true } });
    if (known !== new Set(platformIds).size) {
      return NextResponse.json({ error: "unknown_platform" }, { status: 400 });
    }
  }
  const results = await addHashesToCase(caseId, parsed.data.hashes, {
    requestedPlatformId: platformIds?.[0],
  });
  if (platformIds?.length && results.some((r) => r.ok)) {
    await recordChosenAdvisoryPlatforms(caseId, platformIds);
  }
  const rejectedAsMedia = results.some((r) => !r.ok && r.error === "media_payload_rejected");
  if (rejectedAsMedia) {
    await logSecurityEvent({
      event: "media_payload_rejected",
      actorHash: auth.session.emailHash,
      route: "/api/cases/[caseId]/hashes",
      reason: caseId,
    });
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
