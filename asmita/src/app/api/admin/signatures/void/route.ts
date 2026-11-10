import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { devFlagEnabled } from "@/lib/dev-flags";
import { templateTypeForNoticeBasis } from "@/lib/notice-basis";
import {
  ADMIN_VOID_REASONS,
  loadSignedTemplate,
  voidHashAdvisoryForChangedTemplate,
  voidUrlSignatureForChangedTemplate,
} from "@/lib/signed-template";

/*
 * "Void this signature and ask the survivor to sign again", for a signature
 * dispatch refuses because of its pinned template (signed_template_changed or
 * signed_template_not_dispatchable). Without it, a signature whose template
 * was deactivated or lost its legal review waits until someone restores it.
 *
 * Narrow on purpose: only a signature dispatch would refuse, only while
 * nothing was sent under it (the void helpers' own guards decide that), with
 * a reason code, recorded as signatures_voided with trigger "admin". Repeating
 * it once the signature is gone changes nothing.
 */

const schema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("url"), caseId: z.string().min(1), urlId: z.string().min(1), reason: z.enum(ADMIN_VOID_REASONS) }).strict(),
  z.object({ target: z.literal("hash_advisory"), caseId: z.string().min(1), reason: z.enum(ADMIN_VOID_REASONS) }).strict(),
]);

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return noStore({ error: "csrf_failed" }, 403);
  // The permission sending needs: whoever may send this notice may decide it
  // cannot be sent as signed.
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);

  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return noStore({ error: "database_required" }, 503);
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const input = parsed.data;

  if (input.target === "url") {
    const link = await db.submittedUrl.findFirst({
      where: { id: input.urlId, caseId: input.caseId },
      select: {
        id: true,
        signedNoticePdf: true,
        signedTemplateId: true,
        signedTemplateDigest: true,
        platform: { select: { id: true, noticeBasis: true } },
        _count: { select: { notices: true } },
      },
    });
    if (!link) return noStore({ error: "url_not_found" }, 404);
    // Already voided (or never signed): nothing to do, and nothing changes.
    if (!link.signedNoticePdf) return noStore({ ok: true, voided: false });
    if (link._count.notices > 0) return noStore({ error: "notice_already_sent" }, 409);
    const templateType = link.platform ? templateTypeForNoticeBasis(link.platform.noticeBasis) : null;
    if (!link.signedTemplateId || !link.platform || !templateType) {
      return noStore({ error: "signature_not_refused" }, 409);
    }
    const pinned = await loadSignedTemplate(
      { id: link.signedTemplateId, digest: link.signedTemplateDigest },
      { templateType, platformId: link.platform.id },
      skipLegalGate,
    );
    // Dispatch would send this signature as it is; voiding it is not this action.
    if (pinned.ok) return noStore({ error: "signature_not_refused" }, 409);
    const voided = await voidUrlSignatureForChangedTemplate({
      caseId: input.caseId,
      urlId: link.id,
      signedNoticePdf: link.signedNoticePdf,
      actorId: auth.session.sub,
      trigger: "admin",
      reason: input.reason,
    });
    // Sent or signed again in the meantime: the helper left it alone.
    if (!voided && (await db.submittedUrl.count({ where: { id: link.id, signedNoticePdf: { not: null } } })) > 0) {
      return noStore({ error: "signature_not_voided" }, 409);
    }
    return noStore({ ok: true, voided });
  }

  const dbCase = await db.case.findUnique({
    where: { id: input.caseId },
    select: {
      signedHashAdvisoryPdf: true,
      hashAdvisorySignedHashIds: true,
      hashAdvisorySignedTemplateId: true,
      hashAdvisorySignedTemplateDigest: true,
    },
  });
  if (!dbCase) return noStore({ error: "case_not_found" }, 404);
  if (!dbCase.signedHashAdvisoryPdf) return noStore({ ok: true, voided: false });
  if (!dbCase.hashAdvisorySignedTemplateId) return noStore({ error: "signature_not_refused" }, 409);
  const pinned = await loadSignedTemplate(
    { id: dbCase.hashAdvisorySignedTemplateId, digest: dbCase.hashAdvisorySignedTemplateDigest },
    { templateType: "HASH_ADVISORY" },
    skipLegalGate,
  );
  if (pinned.ok) return noStore({ error: "signature_not_refused" }, 409);
  const voided = await voidHashAdvisoryForChangedTemplate({
    caseId: input.caseId,
    signedHashAdvisoryPdf: dbCase.signedHashAdvisoryPdf,
    signedHashIds: dbCase.hashAdvisorySignedHashIds,
    actorId: auth.session.sub,
    trigger: "admin",
    reason: input.reason,
  });
  // The helper keeps an advisory any platform already received.
  if (!voided && (await db.case.count({ where: { id: input.caseId, signedHashAdvisoryPdf: { not: null } } })) > 0) {
    return noStore({ error: "signature_not_voided" }, 409);
  }
  return noStore({ ok: true, voided });
}
