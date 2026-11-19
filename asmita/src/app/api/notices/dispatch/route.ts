import { NextResponse } from "next/server";
import { devFlagEnabled } from "@/lib/dev-flags";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice, dispatchTier1ApiNotice } from "@/lib/notice-dispatch";
import {
  getTier1ApiConfigFromEnv,
  platformApiTokenFor,
  routeTier1OrFallback,
} from "@/lib/tier1-api-client";
import { isDefinitePlatformRejection, type PlatformApiFingerprint } from "@/lib/platform-api";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  renderNoticeTemplate,
  hasRetiredPortalInstructions,
} from "@/lib/notice-generator";
import { buildSignedHashAnnex, voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";
import { isUrlExpired } from "@/lib/url-retention";
import { loadSignedTemplate, voidUrlSignatureForChangedTemplate } from "@/lib/signed-template";
import { copyNoticeToPartnerChannel, type PartnerChannelOutcome } from "@/lib/partner-channel";

const schema = z.object({
  caseId: z.string().min(1),
  urlId: z.string().min(1),
}).strict();

function templateTypeForNoticeBasis(noticeBasis: string) {
  if (noticeBasis === "IT_RULES_2021") return "IT_RULES_2021";
  if (noticeBasis === "DMCA") return "DMCA";
  if (noticeBasis === "IT_RULES_AND_DMCA") return "IT_RULES_AND_DMCA";
  return null;
}

// WP33: when the notice's URL is on a domain an ACTIVE platform partner
// with a channel email owns, that channel gets a copy of the dispatched
// notice — in addition to the verified grievance contact, never instead of
// it, with the same signed content, and never twice (the channel's own
// idempotency key). A channel problem never fails the dispatch: the notice
// has already gone to the verified contact. Null when the platform is not
// in the partner programme, so the response stays unchanged for it.
async function copyDispatchedNoticeToChannel(input: {
  caseId: string;
  urlId: string;
  domain: string;
  subject: string;
  body: string;
  signedNoticePdf: Buffer | null;
  fingerprintIds: string[];
  actorId: string;
}): Promise<PartnerChannelOutcome | null> {
  try {
    const outcome = await copyNoticeToPartnerChannel(input);
    return outcome.sent || outcome.reason !== "no_partner" ? outcome : null;
  } catch {
    // Audited inside; the dispatch itself already succeeded.
    return null;
  }
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const submittedUrl = await db.submittedUrl.findFirst({
    where: { id: parsed.data.urlId, caseId: parsed.data.caseId },
    include: {
      case: { select: { referenceNumber: true } },
      platform: {
        select: {
          id: true,
          name: true,
          tier: true,
          noticeBasis: true,
          grievanceEmail: true,
          apiEndpoint: true,
          lastContactVerifiedByHuman: true,
          isActive: true,
        },
      },
    },
  });
  if (!submittedUrl) {
    return NextResponse.json({ error: "url_not_found" }, { status: 404 });
  }
  if (!submittedUrl.urlEncrypted || isUrlExpired(submittedUrl.submittedAt)) {
    return NextResponse.json({ error: "url_expired" }, { status: 410 });
  }
  if (submittedUrl.status !== "NOTICE_QUEUED") {
    return NextResponse.json({ error: "url_not_ready_for_dispatch" }, { status: 409 });
  }
  // A crawler-found link is never signed by the survivor. It is sent by Asmita
  // as her representative through /api/admin/findings/[id]/notice/dispatch.
  if (submittedUrl.source === "CRAWLER") {
    return NextResponse.json({ error: "crawler_link_not_survivor_signed" }, { status: 409 });
  }
  // Notice integrity: nothing goes out in the survivor's name that they have
  // not reviewed and signed.
  if (!submittedUrl.signedNoticePdf) {
    return NextResponse.json({ error: "signature_required" }, { status: 409 });
  }

  const platform = submittedUrl.platform;
  if (!platform?.isActive) {
    return NextResponse.json({ error: "platform_not_dispatchable" }, { status: 409 });
  }

  // Channel: the platform API only when the deployment switch, the admin-set
  // endpoint, the enabled list and a token all exist (each a human act);
  // otherwise the email path with its human-verified contact gate.
  const tier1Config = getTier1ApiConfigFromEnv();
  const channel = routeTier1OrFallback(
    {
      id: platform.id,
      tier: platform.tier,
      apiEndpoint: platform.apiEndpoint,
      grievanceEmail: platform.grievanceEmail,
      lastContactVerifiedByHuman: platform.lastContactVerifiedByHuman,
    },
    tier1Config,
  );
  const emailAvailable = Boolean(platform.grievanceEmail) && platform.lastContactVerifiedByHuman;
  if (channel.method === "FORM_HANDOFF" || (channel.method === "EMAIL" && !platform.lastContactVerifiedByHuman)) {
    return NextResponse.json({ error: "verified_platform_contact_required" }, { status: 409 });
  }

  const templateType = templateTypeForNoticeBasis(platform.noticeBasis);
  if (!templateType) {
    return NextResponse.json({ error: "email_notice_not_supported" }, { status: 409 });
  }

  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  let template;
  if (submittedUrl.signedTemplateId) {
    // The email body comes from the template the survivor signed, never a
    // newer one, so it matches the attached PDF.
    const signed = await loadSignedTemplate(
      { id: submittedUrl.signedTemplateId, digest: submittedUrl.signedTemplateDigest },
      { templateType, platformId: platform.id },
      skipLegalGate,
    );
    if (!signed.ok) {
      if (signed.reason === "signed_template_changed") {
        await voidUrlSignatureForChangedTemplate({
          caseId: parsed.data.caseId,
          urlId: submittedUrl.id,
          signedNoticePdf: submittedUrl.signedNoticePdf,
          actorId: auth.session.sub,
        });
      }
      return NextResponse.json({ error: signed.reason }, { status: 409 });
    }
    template = signed.template;
  } else {
    // Signed before templates were pinned: nothing records which template was
    // signed, so keep the selection those signatures were made under.
    template = await db.noticeTemplate.findFirst({
      where: {
        templateType,
        isActive: true,
        ...(skipLegalGate ? {} : { reviewedByLegal: true }),
        OR: [{ platformId: platform.id }, { platformId: null }],
      },
      orderBy: [{ platformId: "desc" }, { version: "desc" }],
    });
  }
  if (!template) {
    return NextResponse.json({ error: "reviewed_template_required" }, { status: 409 });
  }
  if (hasRetiredPortalInstructions(template.bodyTemplate)) {
    return NextResponse.json({ error: "notice_template_requires_review" }, { status: 409 });
  }

  // Exactly the fingerprints the signed PDF lists, and only once all of them
  // are approved, so the notice never differs from what the survivor signed.
  // Checked before the portal token is created so a refusal leaves no trace.
  const signedAnnex = await buildSignedHashAnnex(submittedUrl.signedHashSubmissionIds);
  if (!signedAnnex.ok) {
    // A signature listing a rejected fingerprint can never go out: void it so
    // the survivor signs again (heals a failed or raced void at rejection).
    if (signedAnnex.reason === "signed_fingerprints_changed") {
      await voidSignaturesWithRejectedFingerprints(parsed.data.caseId, { trigger: "dispatch", actorId: auth.session.sub });
    }
    return NextResponse.json({ error: signedAnnex.reason }, { status: 409 });
  }

  const variables = {
    caseReference: submittedUrl.case.referenceNumber,
    platformName: platform.name,
    url: "[Reported URL is in the attached signed notice]",
    // Same reference the signed PDF carries (see sign-notice), so the notice
    // body and the attached declaration agree.
    declarationReference: submittedUrl.case.referenceNumber,
  };
  const subject = renderNoticeTemplate(template.subjectTemplate, variables);
  let body = renderNoticeTemplate(template.bodyTemplate, variables);

  if (signedAnnex.annex.text) {
    body = `${body}\n\n${signedAnnex.annex.text}`;
  }

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

  const signedNoticePdf = submittedUrl.signedNoticePdf
    ? Buffer.from(decryptField(submittedUrl.signedNoticePdf), "base64")
    : null;
  const fingerprintIds = signedAnnex.annex.hashSubmissionIds;

  // ─── Tier 1 platform API channel ──────────────────────────────────────
  // Same signed package as the email below; only the transport differs. On a
  // send failure we fall back to the email path when a verified contact exists.
  let fellBackFromApi: number | null = null;
  if (channel.method === "API") {
    // Defence in depth beyond routeTier1OrFallback: the API channel carries
    // the same signed package and survivor fingerprints as email, so the
    // human contact-verification gate applies to it identically.
    if (!platform.lastContactVerifiedByHuman) {
      return NextResponse.json({ error: "verified_platform_contact_required" }, { status: 409 });
    }
    let fingerprints: PlatformApiFingerprint[] = [];
    if (fingerprintIds.length > 0) {
      const rows = await db.hashSubmission.findMany({
        where: { id: { in: fingerprintIds } },
        select: { hashEncrypted: true, quality: true },
      });
      fingerprints = rows.map((row) => ({
        algorithm: "PDQ",
        digest: decryptField(row.hashEncrypted),
        quality: row.quality,
      }));
    }
    const accessToken = platformApiTokenFor(tier1Config, platform.id);
    if (!accessToken) {
      return NextResponse.json({ error: "platform_api_not_configured" }, { status: 409 });
    }
    const result = await dispatchTier1ApiNotice({
      caseId: parsed.data.caseId,
      urlId: parsed.data.urlId,
      caseReference: submittedUrl.case.referenceNumber,
      platform: {
        id: platform.id,
        name: platform.name,
        noticeBasis: platform.noticeBasis,
        grievanceEmail: platform.grievanceEmail,
      },
      endpoint: channel.endpoint,
      accessToken,
      subject,
      body,
      fingerprints,
      fingerprintIds,
      signedNoticePdf,
      templateId: template.id,
      actorId: auth.session.sub,
    });
    if (result.dispatched) {
      const partnerChannel = await copyDispatchedNoticeToChannel({
        caseId: parsed.data.caseId,
        urlId: parsed.data.urlId,
        domain: submittedUrl.domain,
        subject,
        body,
        signedNoticePdf,
        fingerprintIds,
        actorId: auth.session.sub,
      });
      return NextResponse.json({
        dispatched: true,
        transport: "platform_api",
        notice: result.notice,
        referenceId: result.referenceId ?? null,
        ...(partnerChannel ? { partnerChannel } : {}),
      });
    }
    if (result.reason === "already_dispatched") {
      const partnerChannel = await copyDispatchedNoticeToChannel({
        caseId: parsed.data.caseId,
        urlId: parsed.data.urlId,
        domain: submittedUrl.domain,
        subject,
        body,
        signedNoticePdf,
        fingerprintIds,
        actorId: auth.session.sub,
      });
      return NextResponse.json({
        dispatched: false,
        transport: "platform_api",
        reason: "already_dispatched",
        ...(partnerChannel ? { partnerChannel } : {}),
      });
    }
    // api_send_failed: a 4xx is a definite rejection — the platform received
    // the request and did not process it — so the email channel may take
    // over. A timeout, network error or 5xx is ambiguous: the partner may
    // have processed the notice before the connection failed, and sending a
    // second channel would deliver the same signed notice twice. Ambiguous
    // outcomes never auto-fall-back; the admin retries (the partner-side
    // Idempotency-Key makes that safe) or confirms before emailing.
    if (!isDefinitePlatformRejection(result.status)) {
      return NextResponse.json(
        { error: "platform_api_ambiguous", status: result.status },
        { status: 502 },
      );
    }
    fellBackFromApi = result.status;
    if (!emailAvailable) {
      return NextResponse.json({ error: "platform_api_failed" }, { status: 502 });
    }
  }

  try {
    const result = await dispatchTier2Notice({
      caseId: parsed.data.caseId,
      urlId: parsed.data.urlId,
      recipientEmail: platform.grievanceEmail as string,
      subject,
      body,
      signedNoticePdf,
      fingerprintIds,
      templateId: template.id,
    });
    // Also the channel copy when the platform is a partner with one —
    // attempted on a deduplicated dispatch too, in case the partner was
    // onboarded after the notice first went out.
    const partnerChannel = await copyDispatchedNoticeToChannel({
      caseId: parsed.data.caseId,
      urlId: parsed.data.urlId,
      domain: submittedUrl.domain,
      subject,
      body,
      signedNoticePdf,
      fingerprintIds,
      actorId: auth.session.sub,
    });
    return NextResponse.json({
      ...result,
      transport: "email",
      ...(fellBackFromApi !== null ? { fellBackFromPlatformApi: fellBackFromApi } : {}),
      ...(partnerChannel ? { partnerChannel } : {}),
    });
  } catch (err) {
    // An earlier attempt in the last 24 hours reached Resend but was not
    // recorded. Sending again would email the platform twice.
    if (err instanceof Error && err.message === "email_already_sent") {
      return NextResponse.json({ error: "email_already_sent" }, { status: 409 });
    }
    throw err;
  }
}
