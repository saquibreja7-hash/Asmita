# Crawler notice flow

Status: built behind `ENABLE_CRAWLER`, 2026-11-16. Nothing goes out in production until the `CRAWL_REPRESENTATIVE_NOTICE` and `CRAWL_AUTHORISATION` templates have a human legal review.

A link on a case comes from one of two places, and each has its own dispatch path. Neither path can send the other's links.

| | Survivor link (`source: SURVIVOR`) | Crawler link (`source: CRAWLER`) |
|-|-|-|
| Who found it | The survivor | Asmita's crawler, approved by one or two analysts |
| Who signs | She signs the notice (`signedNoticePdf`) | Nobody signs the notice. Asmita sends it as her authorised representative under her signed crawl authorisation (`CrawlConsent`) |
| Routes | `GET /api/cases/[caseId]/preview-notice`, `POST .../sign-notice`, `POST /api/notices/dispatch` | `POST /api/admin/findings/[id]/notice/preview`, `POST /api/admin/findings/[id]/notice/dispatch` |
| Template | `IT_RULES_2021` / `DMCA` / `IT_RULES_AND_DMCA`, pinned at signing | `CRAWL_REPRESENTATIVE_NOTICE`, the newest active version |
| Fingerprint annex | Every fingerprint listed when she signed (`buildSignedHashAnnex`) | Only the fingerprint the approved finding matched (`buildRepresentativeHashAnnex`, same renderer) |
| Document of record | `signedNoticePdf` and the `signed*` fields | `representativeNoticePdf` (encrypted), `representativeNoticeDigest`, `representativeTemplateId`, `representativeTemplateDigest`, `representativeConsentId`, `representativeSentById`, `representativeApprovedById` |
| Transport | Email, or the platform API when configured | Email only (this wave) |
| Follow-ups and ladder | 24h follow-up, 48h and 7-day survivor emails, ladder on her case page | None. See "Not covered yet" |
| Audit `NOTICE_SENT` | `{ caseId, messageId, idempotencyKey, fingerprintIds }` | The same fields plus `{ source: "crawler", findingId, consentId, approvedById, secondApprovedById, sentById, transport }`. Ids only, never a URL or fingerprint value |

The survivor routes refuse a crawler link with 409 `crawler_link_not_survivor_signed`. Signing prompts (`findSignableNotice`, sign page, acknowledgement) never offer one.

## What the analyst sees

Both routes need `findings:review` (SUPER_ADMIN, CASE_REVIEWER), CSRF, and `ENABLE_CRAWLER=true`. The console (`/admin/findings/[id]`) reads the address-free summary (`GET /api/admin/findings/[id]/summary`), asks the analyst to acknowledge that a preview is a recorded reveal before the preview button works, never previews by itself, shows both the PDF text and the email body, offers the PDF for download from the returned bytes, and turns every code below into a sentence (`src/app/(admin)/findings/findings-client.ts`; a test fails if a code here has none).

**Preview.** `POST /api/admin/findings/[id]/notice/preview` with `{ "caseId": "..." }` runs every gate below, renders the notice as this admin would send it today, and sends nothing. The response shows the page and image addresses, so it counts as a reveal. It writes an access-log row (`finding_notice_previewed`, which is required) and a `URL_REVEALED` audit entry. It is limited to 20 an hour per admin and is sent `no-store`.

```json
{
  "findingId": "...", "caseId": "...", "caseReference": "ASMITA-...", "urlId": "...",
  "platformName": "...", "recipientEmail": "grievance@...", "transport": "email",
  "subject": "...",
  "body": "PDF text, with the page and image addresses",
  "emailBody": "the same text, addresses replaced by placeholders",
  "noticeDate": "16 November 2026", "signedAs": "ASMITA-REVIEWER-XXXXXXXXXX",
  "consent": { "id": "...", "signedAt": "ISO" }, "templateId": "...", "fingerprintIds": ["..."],
  "approvedById": "...", "secondApprovedById": null,
  "pdfBase64": "...", "contentDigest": "64 hex"
}
```

**Dispatch.** `POST /api/admin/findings/[id]/notice/dispatch` with `{ "caseId": "...", "contentDigest": "<from preview>" }` re-runs every gate. It sends only if the notice it would send now has the same digest, so the analyst sends exactly what they reviewed. The digest covers the recipient, subject, both bodies, the date, the template, the authorisation, the fingerprint ids and the sending admin. If another admin, or the same admin on another day, tries to send, the request is refused with `notice_changed` and they must preview again. The admin who approved the finding may also send it, and both ids are recorded. Success returns `{ dispatched, transport: "email", messageId, sentAt, contentDigest }`. `dispatched: false` means this Worker had already sent it. Where sends are recorded in the database (`NOTICE_DISPATCH_PERSISTENCE=database`, every deployed Worker), the link is then `NOTICE_SENT` and a repeat gets 409 `url_not_ready_for_dispatch`. The route is limited to 60 an hour per admin, but every send needs a preview first, so the 20-an-hour preview cap is the real limit.

The notice consists of:

1. the reviewed template, with `{{url}}` set to the page address and `{{declarationReference}}` set to the authorisation id and its signing date;
2. a particulars block naming the page address, the image address and the authorisation;
3. the annex for the matched fingerprint;
4. the line "For Asmita, as authorised representative of the Complainant", the reviewer reference and the date.

The reviewer reference is a hash of the admin id, never a name or email. Her signature is not attached. The email carries the same text with the two addresses replaced by placeholders, the same rule as survivor notices, and the PDF is attached.

## Gates and codes

Checked in this order, on both preview and dispatch, server-side at send time.

| Code | Status | Meaning |
|-|-|-|
| `crawler_disabled` | 503 | `ENABLE_CRAWLER` is off |
| `database_required` | 503 | Memory store (local dev without `DATABASE_URL`) |
| `finding_not_found` | 404 | No such finding, or it belongs to another case than `caseId` |
| `finding_not_approved` | 409 | Not `APPROVED` |
| `second_review_required` | 409 | Distance above 20 and no second reviewer |
| `finding_expired` | 410 | Finding past 30-day retention or its addresses purged |
| `crawler_link_not_found` | 409 | No `CRAWLER` link for this finding on this case. This also covers approval that reused the survivor's own link: hers is never sent this way |
| `consent_withdrawn` | 409 | The link was stopped by a withdrawal (permanent), no live authorisation exists, or the live one does not list the matched fingerprint |
| `url_expired` | 410 | The link is past retention |
| `url_not_ready_for_dispatch` | 409 | The link status is not `NOTICE_QUEUED` (already sent, removed, or pending review) |
| `crawler_link_not_survivor_signed` | 409 | Defence in depth: the link carries a survivor signature |
| `finding_link_mismatch` | 409 | The finding's page no longer matches the link |
| `authorisation_template_changed` | 409 | The authorisation text she signed is no longer the stored text (digest) |
| `authorisation_template_not_reviewed` | 409 | That template is inactive or its legal review was withdrawn |
| `fingerprint_not_approved` / `hash_upload_disabled` | 409 | The matched fingerprint is no longer `APPROVED`/`DISPATCHED`, or hash upload is off |
| `template_missing` | 409 | No active `CRAWL_REPRESENTATIVE_NOTICE` |
| `template_not_reviewed` | 409 | Not `reviewedByLegal`. Only `DEV_SKIP_LEGAL_REVIEW` bypasses this, through `dev-flags.ts`, and never in production |
| `notice_template_requires_review` | 409 | The template has retired portal wording |
| `platform_not_resolved` | 409 | No known platform for the link |
| `platform_not_dispatchable` | 409 | The platform is inactive |
| `verified_platform_contact_required` | 409 | FORM_ONLY, no grievance email, or the contact is not human-verified. The response includes `formUrl` when a human verified the platform's form |
| `notice_render_failed` / `notice_pdf_failed` | 409 | The text failed the body safety checks or the PDF font |

Dispatch only:

| Code | Status | Meaning |
|-|-|-|
| `notice_changed` | 409 | The digest differs from the preview |
| `dispatch_in_progress` | 409 | Another request claimed the link first |
| `earlier_attempt_unconfirmed` | 409 | A different stored notice was never recorded as sent; it may have reached the platform. Needs a human: `docs/ops/crawler-runbook.md`, "Unconfirmed send" |
| `email_already_sent` | 409 | Resend already accepted this notice. Nothing is sent twice |
| `send_failed` | 502 | Resend returned an error. The error may come after the request reached Resend, so the stored notice is kept and a retry the same day resends it. After the date changes, the retry gets `earlier_attempt_unconfirmed` |

## Sending and retries

Before sending, the encrypted PDF and digest are stored on the link as a claim. A retry resends the same stored bytes under the same Resend idempotency key, so a send that succeeded but was not recorded is never repeated. The claim is released only when a withdrawal is noticed right after this request made it, before anything was sent. The same `Notice` row, status transition and verified-recipient check are used as for survivor notices. URL retention blanks `representativeNoticePdf` at 30 days, as it does `signedNoticePdf`.

## Withdrawal

When she withdraws her authorisation, every crawler link on the case with no notice sent gets `crawlConsentWithdrawnAt`. The UI can show this through `crawlConsentWithdrawn` on the case views. Those links can never be sent, even under a later authorisation. Notices already sent are untouched. Unreviewed findings are deleted, as before.

If she later signs a new authorisation, findings are deduplicated per authorisation: each finding records the authorisation it was matched under (`CrawlFinding.crawlConsentId`), and the dedup digest includes it. A copy reported again under the new authorisation is a new finding that analysts review from the start. On final approval it gets its own `CRAWLER` link, because approval never reuses a link a withdrawal stopped. The old finding and its stopped link stay as they were, as the record of the first authorisation. A finding recorded under one authorisation is refused under another (`consent_withdrawn`). A copy whose notice was already sent under the old authorisation is not sent again: approval of the new finding reuses that sent link, which has no representative notice of its own to send (`crawler_link_not_found`). Dismissed findings can likewise reappear under a new authorisation.

## Not covered yet

- **Follow-ups and escalation.** Representative notices are excluded from the hourly sweep (24h follow-up, 48h and 7-day survivor emails) and from the ladder:
  - The follow-up cover (`ESCALATION_L1`) restates the notice as a Rule 3(2)(b) complaint with a two-hour deadline, which the representative notice does not state.
  - The survivor emails say a deadline passed.
  - The survivor view gets `representativeNoticeSentAt` instead of `noticeSentAt`, so no two-hour ladder is drawn.

  Bringing them in needs a reviewed representative follow-up template and a deadline counsel confirms.
- The platform API transport.
- `earlier_attempt_unconfirmed` and `dispatch_in_progress` have no admin action to clear them. Neither does the survivor path's `email_already_sent`, so none was invented here: the console says what happened, and the owner resolves it by hand (`docs/ops/crawler-runbook.md`, "Unconfirmed send").
- The memory-store path for preview and dispatch.

## For counsel

The particulars block and the signature line are the only text that code adds. Please review the wording in `src/lib/crawl-notice.ts` (`particulars`, `signatureBlock`). Both template seeds still carry `[CITATION REQUIRED — verify with legal advisor]` for the legal basis of acting as representative and for the removal period.
