# Partner programme, part 2: sharing fingerprints with partner platforms

Owner decision, 19 November 2026 (Saquib): platforms that join through `/for-platforms` get survivors' fingerprints (only with the survivor's agreement), a dedicated takedown channel, alerts when Asmita's crawler finds a match on their service (only with the platform's written permission), and a way to report outcomes back. Part 1 (the page, the sign-up form, `PlatformPartnerApplication`, `/admin/partners`) is already on this branch.

Read first: root `CLAUDE.md` (safety principles: no media on the server, real data stays out of code, notice integrity, dispatch gates, minors, never invent facts), `asmita/AGENTS.md`, `asmita/docs/adr/006-hash-matching-crawler.md`, the page `src/app/(public)/for-platforms/page.tsx` (what we promised partners: the code must match it), and these existing patterns you must reuse instead of inventing new ones:

- API keys: `src/lib/ngo-api-keys.ts` + `NgoApiKey`, and `CrawlServiceKey` + the crawler routes under `src/app/api/crawler/` (key hashed with sha256, shown once, revocable, `lastUsedAt`).
- Consent: `CrawlConsent` + `src/lib/crawl-consent.ts` (template text + digest, `hashSubmissionIds`, `withdrawnAt`), the crawl tick-box on the case page, and `prisma/template-seeds.ts` (templates are created with `reviewedByLegal: false`; never set it to true anywhere).
- Fingerprints: `HashSubmission` (status, `algorithm` PDQ or VPDQ, encrypted hash), `src/lib/case-hash-annex.ts`.
- Admin pages: `src/app/(admin)/*` with `deniedFor(permission)`, re-exported under `src/app/admin/*`, listed in `src/app/(admin)/admin-nav.ts` and in `tests/unit/admin-nav-permissions.test.ts`.
- Dual backend: memory store without `DATABASE_URL` (dev/tests), Prisma/Kysely otherwise; Kysely types are generated, never hand-written.

## Rules for all four work packages

1. **Only the fingerprint string leaves Asmita.** Partners receive 64-hex PDQ hashes (and, for VPDQ, the list of frame hashes), a fingerprint id, the reported URLs on that partner's own domains, and a case reference. Never an image, a frame, survivor name, email, phone, IP, or any URL on another platform.
2. **Survivor agreement is per fingerprint and revocable.** A fingerprint is shared only if the survivor ticked the partner-sharing box for it, it is `APPROVED`, the case is an adult case, and the agreement is not withdrawn. Withdrawal, case deletion, or a fingerprint rejection removes it from every partner feed and tells partners to delete it (a withdrawal entry in the feed).
3. **Minors never reach this.** POCSO-routed cases and anything flagged as possibly a minor are excluded at the query, with a test.
4. **New legal and consent text is created unreviewed** (`reviewedByLegal: false`), written plainly, and listed in your final notes as needing the owner's approval. Survivor-facing strings go in `en.json` and `hi.json`; new Hindi keys are listed as machine translated in `src/i18n/hi-review-status.json`.
5. **Admin gates:** a partner is active only after an admin approves the application in the console; keys are issued only by an admin and shown once; crawler monitoring of a partner's domains starts only after an admin records the platform's written permission. Every admin action writes an audit entry (existing audit helpers).
6. **Security:** every partner route authenticates with a partner key (hashed lookup, constant-time compare, revocation honoured), is rate limited (Postgres buckets as elsewhere), validates input with strict Zod schemas, caps body size, and logs counts only. Partners only ever see their own data.
7. **Tests use synthetic data only** (example domains such as `example.test`, random hex hashes). Never real URLs or real people.
8. Do not change anything under `crawler/` except where WP33 says so. Do not edit root `CLAUDE.md`.

## WP30. Partners and their keys (app)

- New `PlatformPartner` (name, primary domain, extra domains `String[]`, status ACTIVE/SUSPENDED, `channelEmail` encrypted, `createdFromApplicationId`, `crawlPermissionRecordedAt`/`ById`/`Note`, timestamps) and `PlatformPartnerKey` (partnerId, keyHash unique, label, createdAt, revokedAt, lastUsedAt). Migration with RLS like `20261119120000_platform_partner_applications`.
- `/admin/partners`: each application gets actions: mark contacted, approve (creates the `PlatformPartner`, application status ONBOARDED), decline. A partner detail page lists domains (editable), status (suspend/reactivate), keys (issue: shown once; revoke), and "Record written permission to crawl" (date + note). Permission `platforms:edit`.
- `src/lib/partner-auth.ts`: authenticate `Authorization: Bearer <key>` for partner routes.

## WP31. The survivor agrees to share (app)

- New consent `PartnerShareConsent` (caseId, `hashSubmissionIds`, templateId, templateDigest, agreedAt, withdrawnAt), modelled on `CrawlConsent` but with a tick box (like the crawl opt-in), not a signature.
- New template `PARTNER_SHARING_CONSENT` in `template-seeds.ts`, unreviewed. Plain wording to start from (counsel will review): "I agree that Asmita may send the fingerprints listed below to online platforms that have joined Asmita's partner programme, so they can find and remove copies of my images and stop them being uploaded again. Platforms receive only the fingerprints, never my images or my name. I can withdraw this at any time from my case page, and Asmita will ask the platforms to delete them."
- On the case page, under the existing crawl opt-in and in the same visual style (no left-border stripes): one tick box "Also share my fingerprints with partner platforms", the list of eligible fingerprints (masked as elsewhere), and a withdraw action with a confirm step. Hidden when there is no approved adult fingerprint. API routes with CSRF, session ownership checks, and audit entries.

## WP32. The partner feed (app)

- `GET /api/partner/v1/fingerprints?cursor=` (partner key): an append-only feed of `{ seq, type: "add" | "withdraw", fingerprintId, kind: "image" | "video", hash?, frames?, caseRef }` for fingerprints currently shareable under Rule 2, ordered by a monotonic sequence, paginated (max 500), with `nextCursor`. A new `PartnerFeedEvent` table written when a fingerprint becomes shareable or stops being shareable (consent given/withdrawn, approval, rejection, deletion, purge). `caseRef` is the case reference only.
- `POST /api/partner/v1/outcomes` (partner key): `{ fingerprintId?, url?, outcome: "removed" | "blocked_reupload" | "not_found" | "not_our_content", note? }`; the URL must be on the partner's own domains. Stored as `PartnerOutcome`, audited, shown on the admin case page; when it names a reported `SubmittedUrl` on that partner's domain, its status updates the same way an admin-recorded removal does today (reuse that path).
- `docs/product/partner-api.md`: a short integration guide for platform engineers (auth, feed polling, deletion on withdraw, outcome reporting, how to match PDQ with distance ≤ 31 and require human review). Linked from the FAQ on `/for-platforms`.

## WP33. Notices and crawler alerts through the partner channel (app; crawler only if needed)

- When a notice is dispatched to a platform that has an ACTIVE partner with a `channelEmail`, send it there (in addition to the verified grievance contact, never instead of it), with the same signed content and the existing idempotency key pattern.
- Crawler findings on a partner's domains: allowed only after `crawlPermissionRecordedAt` is set; the partner's domains then appear as crawl sources needing the usual admin enable. When an analyst accepts such a finding, the partner channel gets an alert (case reference, the URL on their domain, the fingerprint id; never the image). Keep the analyst review step unchanged.
- Admin metrics: per partner, fingerprints delivered, outcomes reported, median time to outcome.

## Done means

All checks pass (`C:\hermes\check.ps1`), new tests cover every rule above (especially Rules 1–3 and 6: a non-consented, unapproved, withdrawn, minor or other-partner fingerprint never appears in a feed; a revoked key is refused; a partner cannot report on another partner's domain), and your final commit message lists what was not verified (for example real Postgres, real email) and the text that needs the owner's approval.
