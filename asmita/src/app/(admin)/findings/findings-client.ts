// The findings console's calls to the API, and every shape and message it
// depends on, in one place. The notice preview and dispatch routes were built
// in parallel: when they land, adjust NoticePreview, SendResult and the two
// paths below, nothing else.

import { csrfFetch } from "@/lib/client-csrf";
import type { RevealReason } from "@/lib/admin-access-log";

export const REVEAL_SECONDS = 30;

export const REVEAL_REASON_OPTIONS: Array<[RevealReason, string]> = [
  ["check_removal", "Check whether it was removed"],
  ["survivor_asked", "The survivor asked"],
  ["platform_asked", "The platform asked"],
  ["other", "Other"],
];

// --- Assumed shapes (not yet confirmed against the real routes) -----------

/** POST /api/admin/findings/[id]/notice/preview -> { preview: NoticePreview } */
export type NoticePreview = {
  /** How this platform takes notices. */
  channel: "email" | "form_only";
  /** False when the platform has no human-verified contact. */
  contactVerified: boolean;
  platformName: string;
  recipient: string | null;
  subject: string;
  body: string;
  /** Content digest the dispatch call must echo back. */
  digest: string;
  /** For form_only platforms: the platform's own form. */
  formUrl?: string | null;
};

/** POST /api/admin/findings/[id]/notice/dispatch { digest } -> SendResult */
export type SendResult = { sentAt: string; recipient?: string | null };

export const previewPath = (id: string) => `/api/admin/findings/${encodeURIComponent(id)}/notice/preview`;
export const dispatchPath = (id: string) => `/api/admin/findings/${encodeURIComponent(id)}/notice/dispatch`;

// --- Messages --------------------------------------------------------------

const COMMON: Record<string, string> = {
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Your admin role cannot do this.",
  unauthenticated: "You are signed out. Sign in again.",
  rate_limited: "Too many requests. Try again later.",
  finding_not_found: "This finding no longer exists.",
  finding_expired: "This finding passed the retention period and its address was deleted.",
  url_expired: "This finding passed the retention period and its address was deleted.",
  consent_withdrawn: "The survivor withdrew their authorisation for the crawler. Nothing was done.",
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

export const NOTICE_ERRORS: Record<string, string> = {
  ...COMMON,
  template_not_reviewed: "The notice template has not been legally reviewed yet. Nothing was sent.",
  verified_platform_contact_required: "The platform has no human-verified contact. Nothing was sent.",
  notice_changed: "The notice changed since you previewed it. Preview it again before sending. Nothing was sent.",
  email_already_sent: "This notice was already emailed. Nothing was sent again.",
  finding_not_approved: "Only an approved finding can have a notice sent.",
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

export type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; message: string };

async function call<T>(table: Record<string, string>, send: () => Promise<Response>): Promise<CallResult<T>> {
  try {
    const response = await send();
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) {
      return { ok: false, status: response.status, code: body?.error, message: messageFor(table, response.status, body?.error) };
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

export const previewNotice = (id: string) =>
  call<{ preview: NoticePreview }>(NOTICE_ERRORS, () =>
    csrfFetch(previewPath(id), { method: "POST", body: JSON.stringify({}) }),
  );

export const sendNotice = (id: string, digest: string) =>
  call<SendResult>(NOTICE_ERRORS, () =>
    csrfFetch(dispatchPath(id), { method: "POST", body: JSON.stringify({ digest }) }),
  );
