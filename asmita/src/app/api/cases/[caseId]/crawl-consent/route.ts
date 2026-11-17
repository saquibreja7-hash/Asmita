import { noticeDate } from "@/lib/notice-date";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { crawlerEnabled } from "@/lib/crawler-auth";
import {
  buildCrawlAuthorisationDraft,
  crawlAgreementRecord,
  getCrawlConsentState,
  recordCrawlConsent,
  withdrawCrawlConsent,
} from "@/lib/crawl-consent";
import { devFlagEnabled } from "@/lib/dev-flags";
import { encryptField } from "@/lib/encryption";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { templateDigest } from "@/lib/signed-template";

/*
 * The survivor's crawl authorisation for one case (src/lib/crawl-consent.ts).
 *
 * GET    state, and while off the full authorisation text with its templateRef
 * POST   switch on: she ticked the box ({ agreed: true }) for the text whose
 *        templateRef the page loaded. No name, contact or signature is asked
 *        for: the stored PDF records the full text, the fingerprints and when
 *        the account holder ticked the box.
 * DELETE withdraw: the search stops at once and unreviewed matches are deleted
 *
 * Adults only (minors never reach the case flow). Switching on needs hash
 * upload and the crawler switched on, and a template reviewed by legal unless
 * DEV_SKIP_LEGAL_REVIEW is on. Withdrawal always works, whatever the switches.
 */

const CHANGES_PER_HOUR = 10;

const agreeSchema = z
  .object({
    agreed: z.literal(true),
    templateRef: z.string().min(1).max(200),
  })
  .strict();

type Context = { params: Promise<{ caseId: string }> };

function signingAvailable() {
  return process.env.ENABLE_HASH_UPLOAD === "true" && crawlerEnabled();
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
  const limit = await checkRateLimitAsync(`crawl-consent:${userId}`, CHANGES_PER_HOUR, 60 * 60_000);
  return limit.allowed ? null : NextResponse.json({ error: "rate_limited" }, { status: 429 });
}

export async function GET(_request: Request, context: Context) {
  const owned = await ownedCase(context);
  if (!owned.ok) return owned.response;
  const state = await getCrawlConsentState(owned.record.id);
  let draft = null;
  if (state.status !== "signed" && signingAvailable() && process.env.DATABASE_URL) {
    const built = await buildCrawlAuthorisationDraft(owned.record.id, owned.record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"));
    if (!("error" in built)) draft = { subject: built.subject, body: built.body, templateRef: built.templateRef };
  }
  return NextResponse.json({ ...state, available: signingAvailable(), draft }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const owned = await ownedCase(context);
  if (!owned.ok) return owned.response;
  const tooMany = await limited(owned.userId);
  if (tooMany) return tooMany;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_required" }, { status: 503 });

  const parsed = agreeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const caseId = owned.record.id;
  if ((await getCrawlConsentState(caseId)).status === "signed") {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }
  const draft = await buildCrawlAuthorisationDraft(caseId, owned.record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"));
  if ("error" in draft) return NextResponse.json({ error: draft.error }, { status: 409 });
  // She agrees only to the text and fingerprints the page loaded.
  if (draft.templateRef !== parsed.data.templateRef) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  // The tick is the agreement: the PDF carries the full text and fingerprint
  // list, then a record of when the account holder ticked the box. No name or
  // signature, so no survivor declaration page.
  const agreedAt = new Date();
  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateNoticePdf({
      platformName: "Asmita",
      caseReference: owned.record.referenceNumber,
      noticeSubject: draft.subject,
      noticeBody: `${draft.body}\n\n${crawlAgreementRecord({ caseReference: owned.record.referenceNumber, agreedAt })}`,
      date: noticeDate(agreedAt),
    });
  } catch (err) {
    return NextResponse.json({ error: noticePdfErrorCode(err) }, { status: 409 });
  }

  const saved = await recordCrawlConsent({
    caseId,
    signedPdfEncrypted: encryptField(Buffer.from(pdfBytes).toString("base64")),
    hashSubmissionIds: draft.hashSubmissionIds,
    templateId: draft.template.id,
    templateDigest: templateDigest(draft.template),
    signedAt: agreedAt,
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
  const result = await withdrawCrawlConsent(owned.record.id, owned.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
