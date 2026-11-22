import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { requireStepUp } from "@/lib/auth/step-up";
import { getReviewAdapter } from "@/lib/review-adapters";
import { isHeldForPossibleMinor, recordDecisionOnOpenJob } from "@/lib/review-jobs";
import { writeAuditLog } from "@/lib/audit";

// WP145 bulk safety (review-console-spec.md): approves or rejects up to 50
// fingerprints at once, mirroring the bulk links route. Every item goes
// through the console's FINGERPRINT adapter — the exact transcription of the
// single hashes routes: the same permission, the same existing
// reviewHashSubmission, and the same follow-ups the single buttons have (a
// rejection voids signatures listing the fingerprint, an approval sends the
// signed advisory the survivor already signed, never a new dispatch).
// Nothing here is a new way to decide anything, and dispatch is never the
// bulk action: the routes' decisions are approve and reject of review items
// only. Above ten items the operator types the exact count and shows a fresh
// authenticator code (WP144), and every item gets its own audit entry plus
// one ADMIN_BULK_ACTION summary event.
const MAX_BULK_HASHES = 50;
const STEP_UP_ABOVE = 10;

const schema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    hashIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK_HASHES),
    confirmedCount: z.number().int().min(1).max(MAX_BULK_HASHES),
  })
  .strict();

type ItemResult = { hashId: string; ok: true } | { hashId: string; ok: false; error: string };

export async function POST(request: Request) {
  // The hashes routes are off when hash upload is off; same refusal here.
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const { decision } = parsed.data;
  const hashIds = Array.from(new Set(parsed.data.hashIds));
  // WP145: the confirmed count must name exactly what will be decided.
  if (parsed.data.confirmedCount !== hashIds.length) {
    return NextResponse.json({ error: "count_not_confirmed" }, { status: 400 });
  }

  if (hashIds.length > STEP_UP_ABOVE) {
    const stepUp = requireStepUp(auth.session);
    if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 403 });
  }

  const adapter = await getReviewAdapter("FINGERPRINT");
  if (!adapter) return NextResponse.json({ error: "adapter_unavailable" }, { status: 500 });

  const results: ItemResult[] = [];
  for (const hashId of hashIds) {
    if (await isHeldForPossibleMinor("FINGERPRINT", hashId)) {
      results.push({ hashId, ok: false, error: "minor_hold" });
      continue;
    }
    const outcome = await adapter.decide(hashId, decision, {
      reviewerId: auth.session.sub,
      reviewerEmailHash: auth.session.emailHash,
      role: auth.session.adminRole,
      caseId: null,
    });
    if (!outcome.ok) {
      results.push({ hashId, ok: false, error: outcome.error });
      continue;
    }
    if (outcome.resolved) {
      // WP145: one ReviewDecision per decided item, closing its open console
      // job (the decision itself went through the existing function above).
      // The optional reason travelled through the existing function, which
      // records it where the single reject button records it; the console's
      // own reason fields stay for console-picked codes.
      await recordDecisionOnOpenJob({
        subjectKind: "FINGERPRINT",
        subjectId: hashId,
        decision,
        reviewerEmailHash: auth.session.emailHash,
      });
    }
    results.push({ hashId, ok: true });
  }

  const succeeded = results.filter((result) => result.ok).length;
  await writeAuditLog({
    eventType: "ADMIN_BULK_ACTION",
    entityType: "HashSubmission",
    entityId: "bulk",
    actorId: auth.session.sub,
    data: { action: "bulk_fingerprint_review", decision, requested: hashIds.length, succeeded, failed: hashIds.length - succeeded },
  });

  // Failures first, so the operator sees what still needs them.
  results.sort((left, right) => Number(left.ok) - Number(right.ok));
  return NextResponse.json({ decision, succeeded, failed: hashIds.length - succeeded, results });
}
