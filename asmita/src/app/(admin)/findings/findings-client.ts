// The findings console's calls to the API, and every shape and message it
// depends on, in one place. Shapes match the route handlers under
// src/app/api/admin/findings (see docs/product/crawler-notice-flow.md).

import { csrfFetch } from "@/lib/client-csrf";
import type { RevealReason } from "@/lib/admin-access-log";

export const REVEAL_SECONDS = 30;
/** The preview counts as an address reveal (src/app/api/admin/findings/[id]/notice/preview). */
export const PREVIEWS_PER_HOUR = 20;
export const RUNBOOK = "docs/ops/crawler-runbook.md";

export const REVEAL_REASON_OPTIONS: Array<[RevealReason, string]> = [
  ["check_removal", "Check whether it was removed"],
  ["survivor_asked", "The survivor asked"],
  ["platform_asked", "The platform asked"],
  ["other", "Other"],
];

// --- Shapes ------------------------------------------------------------------

/** POST /api/admin/findings/[id]/notice/preview { caseId } */
export type NoticePreview = {
  findingId: string;
  caseId: string;
  caseReference: string;
  urlId: string;
  platformName: string;
  recipientEmail: string;
  transport: "email";
  subject: string;
  /** The PDF text, with the page and image addresses. */
  body: string;
  /** The email text: the same notice, addresses replaced by placeholders. */
  emailBody: string;
  noticeDate: string;
  signedAs: string;
  consent: { id: string; signedAt: string };
  templateId: string;
  fingerprintIds: string[];
  approvedById: string | null;
  secondApprovedById: string | null;
  pdfBase64: string;
  /** Echoed back to dispatch: the server sends only this exact notice. */
  contentDigest: string;
};

/** POST /api/admin/findings/[id]/notice/dispatch { caseId, contentDigest } */
export type SendResult = { dispatched: boolean; transport: "email"; messageId: string; sentAt: string; contentDigest: string };

export const previewPath = (id: string) => `/api/admin/findings/${encodeURIComponent(id)}/notice/preview`;
export const dispatchPath = (id: string) => `/api/admin/findings/${encodeURIComponent(id)}/notice/dispatch`;

// --- Messages ----------------------------------------------------------------

const COMMON: Record<string, string> = {
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Your admin role cannot do this.",
  unauthenticated: "You are signed out. Sign in again.",
  rate_limited: "Too many requests. Try again later.",
  invalid_payload: "The server did not accept the request. Reload and try again.",
  crawler_disabled: "The crawler is switched off (ENABLE_CRAWLER), so this action is unavailable. Nothing was changed.",
  finding_not_found: "This finding no longer exists.",
  finding_expired: "This finding passed the 30-day retention period and its addresses were deleted.",
  url_expired: "This link passed the 30-day retention period and its address was deleted.",
  consent_withdrawn: "The survivor withdrew her authorisation for the crawler, or this finding was recorded under an earlier one. Nothing can be sent for it.",
};

export const REVEAL_ERRORS: Record<string, string> = {
  ...COMMON,
  reason_required: "Choose a reason first.",
  access_log_failed: "The reveal could not be recorded, so the address was not shown.",
};

export const REVIEW_ERRORS: Record<string, string> = {
  ...COMMON,
  already_reviewed: "This finding was already decided. Reload to see the outcome.",
  second_reviewer_required: "This match needs a second, different reviewer. You gave the first review, so another admin must give the second.",
  case_not_found: "The case for this finding no longer exists.",
  invalid_url: "The address no longer passes the link checks, so it cannot be added to the case.",
};

/**
 * One sentence for every code the preview and dispatch routes can return.
 * tests/unit/admin-crawler-ui.test.ts fails if a code listed in
 * docs/product/crawler-notice-flow.md has no sentence here.
 */
export const NOTICE_ERRORS: Record<string, string> = {
  ...COMMON,
  access_log_failed: "The preview could not be recorded as a reveal, so it was not shown. Nothing was sent.",
  database_required: "Notices need the database. This environment runs on the in-memory store, so nothing can be previewed or sent.",
  finding_not_approved: "Only an approved finding can have a notice. Nothing was sent.",
  second_review_required: "This match needs a second, different reviewer's approval before a notice can be prepared. Nothing was sent.",
  crawler_link_not_found:
    "There is no crawler link on the case for this finding. Either approval reused a link the survivor reported herself (she signs that one), or another finding already added this page. Nothing was sent.",
  url_not_ready_for_dispatch:
    "The link is not waiting for a notice: it was already sent, removed, or is still waiting for its platform to be confirmed. Reload to see its state. Nothing was sent.",
  crawler_link_not_survivor_signed: "This link carries the survivor's own signature, so it can only go through her signed notice. Nothing was sent.",
  finding_link_mismatch: "The finding's page no longer matches the link on the case. Nothing was sent; tell the SUPER_ADMIN.",
  authorisation_template_changed: "The authorisation text the survivor signed has changed since she signed it, so it cannot be relied on. Nothing was sent.",
  authorisation_template_not_reviewed: "The authorisation template is inactive or its legal review was withdrawn. Nothing was sent.",
  fingerprint_not_approved: "The matched fingerprint is no longer approved. Nothing was sent.",
  hash_upload_disabled: "Fingerprint features are switched off (ENABLE_HASH_UPLOAD), so the fingerprint annex cannot be built. Nothing was sent.",
  template_missing: "There is no active representative notice template. Nothing was sent.",
  template_not_reviewed: "The representative notice template has not been legally reviewed yet. Nothing was sent.",
  notice_template_requires_review: "The notice template contains retired wording and needs legal review. Nothing was sent.",
  platform_not_resolved: "No known platform matches this link, so there is nobody to send it to. Nothing was sent.",
  platform_not_dispatchable: "The platform is switched off in the platform list. Nothing was sent.",
  verified_platform_contact_required:
    "This platform has no human-verified grievance email (or takes reports only through its own form), so Asmita cannot email it. Nothing was sent.",
  notice_render_failed: "The notice text failed the safety checks. Nothing was sent; tell the SUPER_ADMIN.",
  notice_pdf_failed: "The notice PDF could not be built. Nothing was sent; tell the SUPER_ADMIN.",
  name_script_unsupported: "The notice PDF could not draw some of its text. Nothing was sent; tell the SUPER_ADMIN.",
  notice_changed: "The notice changed since you previewed it (another day, another admin, or new details). Preview it again before sending. Nothing was sent.",
  dispatch_in_progress:
    "Another send of this notice is in progress, or was interrupted. Nothing was sent by this request. Reload in a minute; if it then shows an unconfirmed attempt, follow the runbook.",
  link_now_survivor_owned:
    "The survivor reported this page herself just now, so the link is hers and goes through her own signed notice. No representative notice is sent. Nothing was sent.",
  earlier_attempt_unconfirmed: `An earlier attempt to send this notice was stored but never confirmed as sent, and it may have reached the platform. Nothing was sent. Do not try again: ask the SUPER_ADMIN to resolve it (${RUNBOOK}, "Unconfirmed send").`,
  email_already_sent: "The email provider already accepted this notice, so nothing was sent again. Reload to see whether it is recorded as sent.",
  send_failed: "The email provider returned an error. The notice is kept as it was; you may try again today. It may still have been delivered.",
};

export const STATUS_FALLBACK: Record<number, string> = {
  503: "The crawler is switched off, so this action is unavailable.",
  429: "Too many requests. Try again later.",
};

/** One human sentence for any error response. Unknown codes are shown generically. */
export function messageFor(table: Record<string, string>, status: number, code: string | undefined) {
  if (code && table[code]) return table[code];
  if (status === 503) return STATUS_FALLBACK[503];
  if (status === 429) return STATUS_FALLBACK[429];
  return `Not done (${code ?? `status ${status}`}). Nothing was sent.`;
}

export type CallResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string; formUrl?: string };

async function call<T>(table: Record<string, string>, send: () => Promise<Response>): Promise<CallResult<T>> {
  try {
    const response = await send();
    const body = (await response.json().catch(() => null)) as (T & { error?: string; formUrl?: string }) | null;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: body?.error,
        message: messageFor(table, response.status, body?.error),
        ...(typeof body?.formUrl === "string" ? { formUrl: body.formUrl } : {}),
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, message: "The request failed. Nothing was changed." };
  }
}

export type RevealedAddress = { pageUrl: string; imageUrl: string };
export type ReviewOutcome = { status: "APPROVED" | "AWAITING_SECOND_REVIEW" | "DISMISSED" };

export const revealFinding = (id: string, reason: RevealReason) =>
  call<RevealedAddress>(REVEAL_ERRORS, () =>
    csrfFetch(`/api/admin/findings/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`, { cache: "no-store" }),
  );

export const reviewFinding = (id: string, decision: "approve" | "dismiss") =>
  call<ReviewOutcome>(REVIEW_ERRORS, () =>
    csrfFetch(`/api/admin/findings/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ decision }) }),
  );

export const previewNotice = (id: string, caseId: string) =>
  call<NoticePreview>(NOTICE_ERRORS, () =>
    csrfFetch(previewPath(id), { method: "POST", body: JSON.stringify({ caseId }), cache: "no-store" }),
  );

export const sendNotice = (id: string, caseId: string, contentDigest: string) =>
  call<SendResult>(NOTICE_ERRORS, () =>
    csrfFetch(dispatchPath(id), { method: "POST", body: JSON.stringify({ caseId, contentDigest }) }),
  );

/**
 * Saves the notice PDF the preview already returned. Built in the browser
 * from those bytes: nothing is fetched.
 */
/** Asked before the PDF is saved: the file holds both addresses. */
export const PDF_DOWNLOAD_CAUTION =
  "This PDF contains the page and image addresses. Save it only where Asmita keeps its records, and never keep it on a personal device. Download it now?";

/** Shown next to copy buttons: the clipboard holds the address afterwards. */
export const COPY_CAUTION =
  "Copying puts the address on this device's clipboard. Paste it only into Asmita's own systems, then clear the clipboard; never on a personal device.";

/** No case reference in the file name: a file name travels further than its contents. */
export const PDF_FILE_NAME = "representative-notice.pdf";

/** Saves the previewed PDF after the analyst confirms. Returns whether it was saved. */
export function downloadPdf(preview: Pick<NoticePreview, "pdfBase64">, confirm: (message: string) => boolean = (m) => window.confirm(m)) {
  if (!confirm(PDF_DOWNLOAD_CAUTION)) return false;
  const bytes = Uint8Array.from(atob(preview.pdfBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = PDF_FILE_NAME;
  anchor.href = objectUrl;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return true;
}
