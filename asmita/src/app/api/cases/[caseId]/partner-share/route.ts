import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { devFlagEnabled } from "@/lib/dev-flags";
import {
  buildPartnerSharingDraft,
  getPartnerShareConsentState,
  recordPartnerShareConsent,
  withdrawPartnerShareConsent,
} from "@/lib/partner-share-consent";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { templateDigest } from "@/lib/signed-template";

/*
 * The survivor's agreement to share her fingerprints with partner platforms
 * for one case (src/lib/partner-share-consent.ts, WP31).
 *
 * GET    state, and while off the full agreement text with its templateRef
 * POST   agree: she ticked the box ({ agreed: true }) for the text whose
 *        templateRef the page loaded. No name, contact or signature is asked
 *        for; the consent row pins the exact template (id + digest) and the
 *        fingerprint ids the page listed.
 * DELETE withdraw: sharing stops at once (the partner feed, WP32, then tells
 *        platforms to delete what they hold)
 *
 * Adults only (minors never reach the case flow, and the shareable query
 * re-checks User.ageOver18). Agreeing needs hash upload on and a template
 * reviewed by legal unless DEV_SKIP_LEGAL_REVIEW is on. Withdrawal always
 * works, whatever the switches. Every change is audited with counts only.
 */

const CHANGES_PER_HOUR = 10;

const agreeSchema = z
  .object({
    agreed: z.literal(true),
    templateRef: z.string().min(1).max(200),
  })
  .strict();

type Context = { params: Promise<{ caseId: string }> };

function sharingAvailable() {
  return process.env.ENABLE_HASH_UPLOAD === "true";
}

async function ownedCase(context: Context) {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { caseId } = await context.params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) return { ok: false as const, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { ok: true as const, userId: auth.session.sub, record };
}

async function limited(userId: string) {
  const limit = await checkRateLimitAsync(`partner-share-consent:${userId}`, CHANGES_PER_HOUR, 60 * 60_000);
  return limit.allowed ? null : NextResponse.json({ error: "rate_limited" }, { status: 429 });
}

export async function GET(_request: Request, context: Context) {
  const owned = await ownedCase(context);
  if (!owned.ok) return owned.response;
  const state = await getPartnerShareConsentState(owned.record.id);
  let draft = null;
  if (state.status !== "agreed" && sharingAvailable() && process.env.DATABASE_URL) {
    const built = await buildPartnerSharingDraft(owned.record.id, owned.record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"));
    if (!("error" in built)) draft = { subject: built.subject, body: built.body, templateRef: built.templateRef };
  }
  return NextResponse.json({ ...state, available: sharingAvailable(), draft }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!sharingAvailable()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const owned = await ownedCase(context);
  if (!owned.ok) return owned.response;
  const tooMany = await limited(owned.userId);
  if (tooMany) return tooMany;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_required" }, { status: 503 });

  const parsed = agreeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const caseId = owned.record.id;
  if ((await getPartnerShareConsentState(caseId)).status === "agreed") {
    return NextResponse.json({ error: "already_agreed" }, { status: 409 });
  }
  const draft = await buildPartnerSharingDraft(caseId, owned.record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"));
  if ("error" in draft) return NextResponse.json({ error: draft.error }, { status: 409 });
  // She agrees only to the text and fingerprints the page loaded.
  if (draft.templateRef !== parsed.data.templateRef) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  const saved = await recordPartnerShareConsent({
    caseId,
    hashSubmissionIds: draft.hashSubmissionIds,
    templateId: draft.template.id,
    templateDigest: templateDigest(draft.template),
    actorId: owned.userId,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });
  return NextResponse.json({ ok: true, fingerprintCount: draft.hashSubmissionIds.length });
}

export async function DELETE(request: Request, context: Context) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const owned = await ownedCase(context);
  if (!owned.ok) return owned.response;
  const tooMany = await limited(owned.userId);
  if (tooMany) return tooMany;
  const result = await withdrawPartnerShareConsent(owned.record.id, owned.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
