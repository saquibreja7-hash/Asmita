import { noticeDate } from "@/lib/notice-date";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { verifyCsrfRequest } from "@/lib/csrf";
import { crawlerEnabled } from "@/lib/crawler-auth";
import {
  buildCrawlAuthorisationDraft,
  getCrawlConsentState,
  recordCrawlConsent,
  withdrawCrawlConsent,
} from "@/lib/crawl-consent";
import { devFlagEnabled } from "@/lib/dev-flags";
import { encryptField } from "@/lib/encryption";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { isPdfSafeText } from "@/lib/pdf-text";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { templateDigest } from "@/lib/signed-template";

/*
 * The survivor's crawl authorisation for one case (src/lib/crawl-consent.ts).
 *
 * GET    state, and while unsigned the exact text to sign with its templateRef
 * POST   sign: name, contact, signature and the templateRef she saw
 * DELETE withdraw: the search stops at once and unreviewed matches are deleted
 *
 * Adults only (minors never reach the case flow). Signing needs hash upload
 * and the crawler switched on, and a template reviewed by legal unless
 * DEV_SKIP_LEGAL_REVIEW is on. Withdrawal always works, whatever the switches.
 */

const FORBIDDEN_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const CHANGES_PER_HOUR = 10;

const signSchema = z
  .object({
    name: z.string().min(1).max(100),
    contact: z.string().trim().pipe(z.email().max(200)),
    signature: z.string().min(1).max(100),
    templateRef: z.string().min(1).max(200),
  })
  .strict()
  .refine(
    (d) => !FORBIDDEN_CONTROL.test(d.name) && !FORBIDDEN_CONTROL.test(d.contact) && !FORBIDDEN_CONTROL.test(d.signature),
    { message: "invalid_characters" },
  );

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

  const parsed = signSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const name = parsed.data.name.normalize("NFC");
  const signature = parsed.data.signature.normalize("NFC");
  if (!isPdfSafeText(name) || !isPdfSafeText(signature)) {
    return NextResponse.json({ error: "name_script_unsupported" }, { status: 400 });
  }

  const caseId = owned.record.id;
  if ((await getCrawlConsentState(caseId)).status === "signed") {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }
  const draft = await buildCrawlAuthorisationDraft(caseId, owned.record.referenceNumber, devFlagEnabled("DEV_SKIP_LEGAL_REVIEW"));
  if ("error" in draft) return NextResponse.json({ error: draft.error }, { status: 409 });
  // She signs only the text and fingerprints she saw.
  if (draft.templateRef !== parsed.data.templateRef) {
    return NextResponse.json({ error: "notice_changed_since_preview" }, { status: 409 });
  }

  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateNoticePdf({
      platformName: "Asmita",
      caseReference: owned.record.referenceNumber,
      noticeSubject: draft.subject,
      noticeBody: draft.body,
      date: noticeDate(new Date()),
      survivorName: name,
      survivorContact: parsed.data.contact,
      signature,
    });
  } catch (err) {
    const error = noticePdfErrorCode(err);
    return NextResponse.json({ error }, { status: error === "name_script_unsupported" ? 400 : 409 });
  }

  const saved = await recordCrawlConsent({
    caseId,
    signedPdfEncrypted: encryptField(Buffer.from(pdfBytes).toString("base64")),
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
  const result = await withdrawCrawlConsent(owned.record.id, owned.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
