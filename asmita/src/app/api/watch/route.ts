import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { addHashesToCase, MAX_HASHES_PER_SUBMISSION, validateHashItem } from "@/lib/hash-submission";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { buildCrawlAuthorisationDraft, WATCH_AUTHORISATION_TYPE } from "@/lib/crawl-consent";
import { devFlagEnabled } from "@/lib/dev-flags";
import { createWatchCase } from "@/lib/watch-ops";
import { listCasesForUser } from "@/lib/case-ops";
import {
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

/*
 * POST /api/watch — "Watch for my images" (WP22). Creates her watch case
 * (mode = WATCH, no links ever) and stores the fingerprints she made in her
 * browser, then returns the watch-only authorisation draft her tick signs
 * next (POST /api/cases/[caseId]/crawl-consent, which records the WATCH_ONLY
 * consent). Nothing is sent to any platform at any point in this flow.
 *
 * Adults only, hash upload and the crawler on, fingerprints exactly like the
 * hashes route: 64-hex PDQ values only, never image bytes.
 */

const SCOPE = "watch:create";

const schema = z
  .object({
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
  })
  .strict();

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/watch" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  // Adults only by hard rule: a minor is routed to the minor-support flow and
  // never reaches the watch flow.
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    await logSecurityEvent({ event: auth.error === "minor_pathway_required" ? "minor_route_blocked" : "auth_failed", route: "/api/watch", reason: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    await logSecurityEvent({ event: "media_payload_rejected", actorHash: auth.session.emailHash, route: "/api/watch", reason: `content_length:${contentLength}` });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  // Validate before anything is created, so a bad payload leaves no empty
  // watch case behind (same rules the hashes route enforces at write time).
  const invalid = parsed.data.hashes.find((item) => !validateHashItem(item).ok);
  if (invalid) {
    const checked = validateHashItem(invalid);
    if (!checked.ok && checked.error === "media_payload_rejected") {
      await logSecurityEvent({ event: "media_payload_rejected", actorHash: auth.session.emailHash, route: "/api/watch", reason: "invalid_hash" });
    }
    return NextResponse.json({ error: "invalid_hashes" }, { status: 400 });
  }

  const idemKey = readIdempotencyKey(request);
  if (idemKey) {
    const cached = getCachedResponse(SCOPE, auth.session.sub, idemKey);
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
  }

  const userLimit = await checkRateLimitAsync(`watch-create:${auth.session.sub}`, 10, 24 * 60 * 60_000);
  const ipLimit = await checkRateLimitAsync(`watch-create-ip:${getClientIp(request)}`, 30, 60 * 60_000, { shared: true });
  if (!userLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // One watch per person: an existing watch case (even a stopped one) is the
  // one to keep or restart, so she is sent there instead of starting another.
  const existing = (await listCasesForUser(auth.session.sub)).find((record) => record.mode === "WATCH");
  if (existing) {
    return NextResponse.json({ caseId: existing.id, referenceNumber: existing.referenceNumber, existing: true });
  }

  const record = await createWatchCase(auth.session.sub);
  const results = await addHashesToCase(record.id, parsed.data.hashes);
  const rejectedAsMedia = results.some((r) => !r.ok && r.error === "media_payload_rejected");
  if (rejectedAsMedia) {
    await logSecurityEvent({ event: "media_payload_rejected", actorHash: auth.session.emailHash, route: "/api/watch", reason: record.id });
  }
  const accepted = results.filter((r) => r.ok).length;
  if (accepted === 0) {
    return NextResponse.json({ error: "invalid_hashes", results }, { status: 400 });
  }

  // The watch-only authorisation draft her tick signs, so /watch needs no
  // second request before showing the text. Unavailable while the crawler is
  // off or the template is unreviewed: the tick will say so, and the
  // fingerprints are already stored either way.
  let draft = null;
  if (crawlerEnabled() && process.env.DATABASE_URL) {
    const built = await buildCrawlAuthorisationDraft(record.id, record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"), WATCH_AUTHORISATION_TYPE);
    if (!("error" in built)) draft = { subject: built.subject, body: built.body, templateRef: built.templateRef };
  }

  const body = {
    caseId: record.id,
    referenceNumber: record.referenceNumber,
    accepted,
    draft,
  };
  if (idemKey) {
    rememberResponse(SCOPE, auth.session.sub, idemKey, 200, body);
  }
  return NextResponse.json(body);
}
