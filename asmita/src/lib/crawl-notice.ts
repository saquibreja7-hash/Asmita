import { buildRepresentativeHashAnnex } from "@/lib/case-hash-annex";
import { CRAWL_AUTHORISATION_TYPE } from "@/lib/crawl-consent";
import { findingUrlsExpired, SECOND_REVIEW_DISTANCE } from "@/lib/crawl-findings";
import { consentCoversFinding } from "@/lib/crawl-pool";
import { devFlagEnabled } from "@/lib/dev-flags";
import { decryptField, encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { noticeDate } from "@/lib/notice-date";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  hasRetiredPortalInstructions,
  renderNoticeTemplate,
} from "@/lib/notice-generator";
import { assertVerifiedNoticeRecipient, dispatchTier2Notice } from "@/lib/notice-dispatch";
import { generateNoticePdf, noticePdfErrorCode } from "@/lib/notice-pdf";
import { checkSignedTemplate, templateDigest } from "@/lib/signed-template";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { isUrlExpired } from "@/lib/url-retention";

/*
 * The representative notice: the takedown notice Asmita sends for a link its
 * crawler found and analysts approved, as the survivor's authorised
 * representative under her crawl authorisation (CrawlConsent). She never
 * signs it, so it never uses the survivor-signed path (/api/notices/dispatch,
 * signedNoticePdf) and that path refuses these links.
 *
 * Preview and dispatch run the same gates and the same renderer. Preview
 * returns a content digest of exactly what would be sent; dispatch renders
 * again, re-checks every gate at send time, and refuses (notice_changed)
 * unless the digest matches, so what the analyst reviewed is what is sent.
 *
 * Every refusal has its own code; docs/product/crawler-notice-flow.md lists
 * them. Email only in this wave: the platform API channel is never used here.
 *
 * Database only: the memory store has no templates, platforms or notices, so
 * without DATABASE_URL both preview and dispatch refuse (database_required).
 */

export const CRAWL_REPRESENTATIVE_NOTICE_TYPE = "CRAWL_REPRESENTATIVE_NOTICE" as const;
export const REPRESENTATIVE_TRANSPORT = "email" as const;

/** Placeholders the email body carries instead of the addresses, as the survivor path does: raw URLs never go in an email body. */
const EMAIL_PAGE_PLACEHOLDER = "[Page address is in the attached notice]";
const EMAIL_IMAGE_PLACEHOLDER = "[Image address is in the attached notice]";

export type Refusal = { ok: false; status: number; error: string; formUrl?: string };

const refuse = (status: number, error: string, extra: { formUrl?: string } = {}): Refusal => ({ ok: false, status, error, ...extra });

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Notice dates are India dates, as the survivor path prints them (notice-date.ts). */
export { noticeDate };

/**
 * A stable, non-identifying reference for the admin who sends the notice.
 * The platform sees this, never the admin's id, name or email; Asmita can
 * map it back from SubmittedUrl.representativeSentById.
 */
export function representativeReference(adminId: string) {
  return `ASMITA-REVIEWER-${sha256(`representative-ref\u0000${adminId}`).slice(0, 10).toUpperCase()}`;
}

/*
 * The factual particulars Asmita adds to the reviewed template text: where
 * the copy is, which authorisation Asmita relies on, and who sends it. No
 * legal assertion is made here; the wording is listed for counsel in
 * docs/product/crawler-notice-flow.md.
 */
function particulars(input: {
  pageAddress: string;
  imageAddress: string;
  consentId: string;
  consentSignedOn: string;
}) {
  return [
    "--- PARTICULARS OF THE COPY ---",
    "",
    `Page address: ${input.pageAddress}`,
    `Image address: ${input.imageAddress}`,
    `Authorisation relied on: written authorisation ${input.consentId}, signed by the Complainant on ${input.consentSignedOn}. Her signature is not attached to this notice.`,
    "",
    "--- END PARTICULARS ---",
  ].join("\n");
}

function signatureBlock(input: { reference: string; date: string }) {
  return [
    "For Asmita, as authorised representative of the Complainant",
    `Sent by: ${input.reference}`,
    `Date: ${input.date}`,
  ].join("\n");
}

type LinkRow = {
  id: string;
  caseId: string;
  status: string;
  source: string;
  urlEncrypted: string;
  urlHash: string;
  submittedAt: Date;
  crawlFindingId: string | null;
  signedNoticePdf: string | null;
  representativeNoticePdf: string | null;
  representativeNoticeDigest: string | null;
  crawlConsentWithdrawnAt: Date | null;
  case: { referenceNumber: string };
  platform: {
    id: string;
    name: string;
    noticeBasis: string;
    grievanceEmail: string | null;
    formUrl: string | null;
    lastContactVerifiedByHuman: boolean;
    isActive: boolean;
  } | null;
};

export type RenderedRepresentativeNotice = {
  findingId: string;
  caseId: string;
  caseReference: string;
  urlId: string;
  platformId: string;
  platformName: string;
  recipientEmail: string;
  subject: string;
  /** The notice text in the PDF, with the page and image addresses. */
  pdfBody: string;
  /** The email text: the same notice with the addresses replaced by placeholders. */
  emailBody: string;
  noticeDate: string;
  representativeReference: string;
  templateId: string;
  templateDigest: string;
  consentId: string;
  consentSignedAt: string;
  fingerprintIds: string[];
  approvedById: string | null;
  secondApprovedById: string | null;
  contentDigest: string;
};

type Prepared = {
  ok: true;
  notice: RenderedRepresentativeNotice;
  link: LinkRow;
};

/** The digest preview returns and dispatch compares: every input to what goes out. */
export function representativeContentDigest(notice: Omit<RenderedRepresentativeNotice, "contentDigest">) {
  return sha256(JSON.stringify([
    "representative-notice:v1",
    notice.findingId, notice.caseId, notice.urlId, notice.platformId, notice.platformName, notice.recipientEmail,
    notice.caseReference, notice.subject, notice.pdfBody, notice.emailBody, notice.noticeDate,
    notice.representativeReference, notice.templateId, notice.templateDigest, notice.consentId,
    notice.consentSignedAt, [...notice.fingerprintIds].sort(),
  ]));
}

/**
 * Runs every gate and renders the notice for one finding, as the given admin
 * would send it now. Sends nothing and writes nothing.
 */
export async function prepareRepresentativeNotice(input: {
  findingId: string;
  caseId: string;
  adminId: string;
  now?: Date;
}): Promise<Prepared | Refusal> {
  const now = input.now ?? new Date();
  if (isDevNoDb()) return refuse(503, "database_required");
  const { db } = await import("@/lib/db");
  const skipLegalGate = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");

  // The finding, bound to the case the caller names: a mismatched pair is
  // reported exactly like a missing finding.
  const finding = await db.crawlFinding.findUnique({ where: { id: input.findingId } });
  if (!finding || finding.caseId !== input.caseId) return refuse(404, "finding_not_found");
  if (finding.reviewStatus !== "APPROVED") return refuse(409, "finding_not_approved");
  if (finding.distance > SECOND_REVIEW_DISTANCE && !finding.secondReviewedById) return refuse(409, "second_review_required");
  if (findingUrlsExpired(finding, now) || !finding.imageUrlEncrypted) return refuse(410, "finding_expired");

  // The link final approval created for this finding. When the survivor had
  // already reported the same page, approval reused her link: that link is
  // hers, signed by her, and never gets a representative notice.
  const link = (await db.submittedUrl.findFirst({
    where: { crawlFindingId: finding.id, caseId: finding.caseId, source: "CRAWLER" },
    include: {
      case: { select: { referenceNumber: true } },
      platform: {
        select: { id: true, name: true, noticeBasis: true, grievanceEmail: true, formUrl: true, lastContactVerifiedByHuman: true, isActive: true },
      },
    },
  })) as LinkRow | null;
  if (!link || link.source !== "CRAWLER" || link.caseId !== finding.caseId || link.crawlFindingId !== finding.id) {
    return refuse(409, "crawler_link_not_found");
  }
  if (link.crawlConsentWithdrawnAt) return refuse(409, "consent_withdrawn");
  if (!link.urlEncrypted || isUrlExpired(link.submittedAt, now)) return refuse(410, "url_expired");
  if (link.status !== "NOTICE_QUEUED") return refuse(409, "url_not_ready_for_dispatch");
  if (link.signedNoticePdf) return refuse(409, "crawler_link_not_survivor_signed");

  const pageAddress = decryptField(link.urlEncrypted);
  const imageAddress = decryptField(finding.imageUrlEncrypted);
  const findingPage = parseSubmittedUrl(decryptField(finding.pageUrlEncrypted));
  if (!findingPage.ok || findingPage.urlHash !== link.urlHash) return refuse(409, "finding_link_mismatch");

  // A live authorisation that still lists the matched fingerprint.
  const consent = await db.crawlConsent.findFirst({
    where: { caseId: finding.caseId, withdrawnAt: null },
    orderBy: { signedAt: "desc" },
  });
  // It must list the matched fingerprint, and the finding must have been
  // recorded under it: a finding from an earlier authorisation is never sent
  // under a later one (consentCoversFinding).
  if (!consent || !consentCoversFinding(consent, finding)) return refuse(409, "consent_withdrawn");

  // The authorisation text she signed is still that text, and still reviewed.
  const authorisationTemplate = await db.noticeTemplate.findUnique({ where: { id: consent.templateId } });
  const authorisation = checkSignedTemplate(
    authorisationTemplate,
    { digest: consent.templateDigest },
    { templateType: CRAWL_AUTHORISATION_TYPE },
    skipLegalGate,
  );
  if (!authorisation.ok) {
    return refuse(409, authorisation.reason === "signed_template_changed" ? "authorisation_template_changed" : "authorisation_template_not_reviewed");
  }

  // Only the fingerprint this finding matched, only while still approved.
  const annex = await buildRepresentativeHashAnnex(finding.caseId, [finding.hashSubmissionId]);
  if (!annex.ok) return refuse(409, annex.reason);

  const template = await db.noticeTemplate.findFirst({
    where: { templateType: CRAWL_REPRESENTATIVE_NOTICE_TYPE, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!template) return refuse(409, "template_missing");
  if (!template.reviewedByLegal && !skipLegalGate) return refuse(409, "template_not_reviewed");
  if (hasRetiredPortalInstructions(template.bodyTemplate)) return refuse(409, "notice_template_requires_review");

  // Email only, and only to a human-verified grievance address. Form-only and
  // unknown platforms are never emailed; the admin gets the platform's form
  // when a human verified it.
  const platform = link.platform;
  if (!platform) return refuse(409, "platform_not_resolved");
  if (!platform.isActive) return refuse(409, "platform_not_dispatchable");
  const recipient = platform.grievanceEmail ?? "";
  let recipientOk = platform.noticeBasis !== "FORM_ONLY" && platform.lastContactVerifiedByHuman;
  try {
    assertVerifiedNoticeRecipient(recipient);
  } catch {
    recipientOk = false;
  }
  if (!recipientOk) {
    const formUrl = platform.lastContactVerifiedByHuman && platform.formUrl ? platform.formUrl : undefined;
    return refuse(409, "verified_platform_contact_required", formUrl ? { formUrl } : {});
  }

  const date = noticeDate(now);
  const reference = representativeReference(input.adminId);
  const consentSignedOn = noticeDate(consent.signedAt);
  const authorisationReference = `${consent.id} (signed ${consentSignedOn})`;
  const render = (page: string, image: string) => {
    const variables = {
      caseReference: link.case.referenceNumber,
      platformName: platform.name,
      url: page,
      declarationReference: authorisationReference,
    };
    return {
      subject: renderNoticeTemplate(template.subjectTemplate, variables),
      body: [
        renderNoticeTemplate(template.bodyTemplate, variables),
        particulars({ pageAddress: page, imageAddress: image, consentId: consent.id, consentSignedOn }),
        annex.annex.text,
        signatureBlock({ reference, date }),
      ].join("\n\n"),
    };
  };
  let pdf: { subject: string; body: string };
  let email: { subject: string; body: string };
  try {
    pdf = render(pageAddress, imageAddress);
    email = render(EMAIL_PAGE_PLACEHOLDER, EMAIL_IMAGE_PLACEHOLDER);
    assertNoticeSubjectSafe(email.subject);
    assertNoticeBodySafe(email.body);
  } catch {
    return refuse(409, "notice_render_failed");
  }

  const base = {
    findingId: finding.id,
    caseId: finding.caseId,
    caseReference: link.case.referenceNumber,
    urlId: link.id,
    platformId: platform.id,
    platformName: platform.name,
    recipientEmail: recipient,
    subject: email.subject,
    pdfBody: pdf.body,
    emailBody: email.body,
    noticeDate: date,
    representativeReference: reference,
    templateId: template.id,
    templateDigest: templateDigest(template),
    consentId: consent.id,
    consentSignedAt: consent.signedAt.toISOString(),
    fingerprintIds: annex.annex.hashSubmissionIds,
    approvedById: finding.reviewedById,
    secondApprovedById: finding.secondReviewedById,
  };
  return { ok: true, link, notice: { ...base, contentDigest: representativeContentDigest(base) } };
}

/** The PDF of a rendered notice: the same text as the email, with the addresses. */
export async function renderRepresentativePdf(notice: RenderedRepresentativeNotice): Promise<Buffer> {
  return generateNoticePdf({
    platformName: notice.platformName,
    caseReference: notice.caseReference,
    noticeSubject: notice.subject,
    noticeBody: notice.pdfBody,
    date: notice.noticeDate,
  });
}

export type PreviewResult =
  | { ok: true; notice: RenderedRepresentativeNotice; pdfBase64: string }
  | Refusal;

export async function previewRepresentativeNotice(input: { findingId: string; caseId: string; adminId: string; now?: Date }): Promise<PreviewResult> {
  const prepared = await prepareRepresentativeNotice(input);
  if (!prepared.ok) return prepared;
  try {
    const pdf = await renderRepresentativePdf(prepared.notice);
    return { ok: true, notice: prepared.notice, pdfBase64: Buffer.from(pdf).toString("base64") };
  } catch (err) {
    return refuse(409, noticePdfErrorCode(err));
  }
}

export type DispatchResult =
  | { ok: true; dispatched: boolean; transport: typeof REPRESENTATIVE_TRANSPORT; messageId: string; sentAt: string; contentDigest: string }
  | Refusal;

/**
 * Sends the representative notice for one approved finding, if and only if
 * it is still exactly the notice the caller previewed (contentDigest).
 *
 * The PDF of record is stored (encrypted) on the link before sending, as a
 * claim: a retry resends the same stored bytes under the same Resend
 * idempotency key, so a send that went out but was not recorded is never
 * sent twice. A failed send keeps the claim: Resend's error can follow a
 * request that reached it, so the stored PDF stays as the record and the
 * retry resends it. Only a withdrawal noticed right after this call's own
 * claim releases it, before anything is sent.
 */
export async function dispatchRepresentativeNotice(input: {
  findingId: string;
  caseId: string;
  adminId: string;
  contentDigest: string;
  now?: Date;
}): Promise<DispatchResult> {
  const prepared = await prepareRepresentativeNotice(input);
  if (!prepared.ok) return prepared;
  const { notice, link } = prepared;
  if (notice.contentDigest !== input.contentDigest) return refuse(409, "notice_changed");

  const { db } = await import("@/lib/db");
  let pdf: Buffer;
  let claimedNow = false;
  if (link.representativeNoticePdf) {
    // An earlier attempt stored a notice. The same notice is resent from the
    // stored bytes; a different one is refused, because the earlier one may
    // have reached the platform without being recorded.
    if (link.representativeNoticeDigest !== notice.contentDigest) return refuse(409, "earlier_attempt_unconfirmed");
    pdf = Buffer.from(decryptField(link.representativeNoticePdf), "base64");
  } else {
    try {
      pdf = await renderRepresentativePdf(notice);
    } catch (err) {
      return refuse(409, noticePdfErrorCode(err));
    }
    const claimed = await db.submittedUrl.updateMany({
      where: {
        id: link.id,
        source: "CRAWLER",
        status: "NOTICE_QUEUED",
        representativeNoticePdf: null,
        crawlConsentWithdrawnAt: null,
        signedNoticePdf: null,
      },
      data: {
        representativeNoticePdf: encryptField(Buffer.from(pdf).toString("base64")),
        representativeNoticeDigest: notice.contentDigest,
        representativeTemplateId: notice.templateId,
        representativeTemplateDigest: notice.templateDigest,
        representativeConsentId: notice.consentId,
        representativeSentById: input.adminId,
        representativeApprovedById: notice.secondApprovedById ?? notice.approvedById,
      },
    });
    if (claimed.count === 0) return refuse(409, "dispatch_in_progress");
    claimedNow = true;
  }

  const release = () =>
    db.submittedUrl.updateMany({
      where: { id: link.id, representativeNoticeDigest: notice.contentDigest, status: "NOTICE_QUEUED", notices: { none: {} } },
      data: {
        representativeNoticePdf: null,
        representativeNoticeDigest: null,
        representativeTemplateId: null,
        representativeTemplateDigest: null,
        representativeConsentId: null,
        representativeSentById: null,
        representativeApprovedById: null,
      },
    });

  // A withdrawal can land between the gates above and the claim: look again.
  const consent = await db.crawlConsent.findFirst({
    where: { id: notice.consentId, withdrawnAt: null },
    select: { id: true },
  });
  const stillLinked = await db.submittedUrl.findFirst({
    where: { id: link.id, crawlConsentWithdrawnAt: null },
    select: { id: true },
  });
  if (!consent || !stillLinked) {
    // Only a claim this call made, before anything was sent. A claim from an
    // earlier attempt may record a notice that reached the platform.
    if (claimedNow) await release();
    return refuse(409, "consent_withdrawn");
  }

  try {
    const result = await dispatchTier2Notice({
      caseId: notice.caseId,
      urlId: notice.urlId,
      recipientEmail: notice.recipientEmail,
      subject: notice.subject,
      body: notice.emailBody,
      signedNoticePdf: pdf,
      fingerprintIds: notice.fingerprintIds,
      templateId: notice.templateId,
      actorId: input.adminId,
      // Ids only: never a URL or a fingerprint value.
      auditData: {
        source: "crawler",
        findingId: notice.findingId,
        consentId: notice.consentId,
        approvedById: notice.approvedById,
        secondApprovedById: notice.secondApprovedById,
        sentById: input.adminId,
        transport: REPRESENTATIVE_TRANSPORT,
      },
    });
    return {
      ok: true,
      dispatched: result.dispatched,
      transport: REPRESENTATIVE_TRANSPORT,
      messageId: result.notice.messageId,
      sentAt: result.notice.sentAt,
      contentDigest: notice.contentDigest,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "email_already_sent") return refuse(409, "email_already_sent");
    // The claim stays (see above); a retry today resends the stored notice.
    if (message.startsWith("email_send_failed:")) return refuse(502, "send_failed");
    throw err;
  }
}
