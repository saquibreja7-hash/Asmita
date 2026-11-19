# Partner programme part 2: progress

Working notes for `partner-sharing-spec.md`, one entry per work package, appended by whoever builds it.

## WP30. Partners and their keys (app) — built 19 November 2026

**What was built**

- `PlatformPartner` and `PlatformPartnerKey` in `prisma/schema.prisma`, with the migration `20261119130000_platform_partners` (additive only, RLS on both tables like every other table). A partner is created only by an admin approving a `PlatformPartnerApplication`; its channel email is encrypted at rest; `crawlPermissionRecordedAt/ById/Note` hold the recorded written permission to crawl.
- `src/lib/partner-store.ts`: the in-memory twin for dev/tests without a database, in the style of `crawl-store.ts`.
- `src/lib/partner-auth.ts` (the spec's file): bearer-key auth for the future partner routes. Keys are `ppk_…`, issued by an admin, only sha256-stored, shown once, revocable, with `lastUsedAt`; lookup by hash plus constant-time compare; IP and per-key rate limits; a suspended partner's valid key answers `403 partner_suspended`, every other key problem answers the same `401 unauthorized`. `readPartnerBody` gives WP32's routes the Rule-6 body cap plus strict-Zod parsing. No `ENABLE_*` switch: a partner is gated by the admin's approval and its key, not a deployment flag.
- `src/lib/partner-admin.ts`: application actions (mark contacted, approve, decline), partner domains and channel email, suspend/reactivate, key issue/revoke, "record written permission to crawl" — every action audited (`ADMIN_ACTION`, `partner_*`), memory/Kysely/Prisma paths like the crawl modules.
- Six admin routes under `/api/admin/partners/…`, all `platforms:edit` + CSRF + strict Zod + per-admin rate limit.
- Admin console: the requests list on `/admin/partners` gained actions and a platform-partners table; a partner detail page (`/admin/partners/[partnerId]`) lists and edits domains, suspends/reactivates, issues keys (shown once, with copy-and-dismiss), revokes keys, and records the written permission (date + note).
- Tests (synthetic data only): `tests/unit/partner-auth.test.ts`, `partner-admin.test.ts`, `partner-admin-routes.test.ts`, `partner-admin-kysely.test.ts`, `partner-admin-prisma.test.ts` — 63 tests covering Rules 5 and 6 as WP30 touches them (admin approval gates, keys issued by an admin and shown once, hash-only storage, revocation honoured, suspension stops authentication, one audit entry per action, per-route rate limits, scoped key access, encrypted channel email, no key material or email in audit data).

**Not verified**

- Real Postgres: the migration is written but not applied; the Prisma and Kysely paths are exercised only against mocks and the memory store (the repo-wide open item).
- Real email: nothing here sends email.
- The admin pages in a browser (the repo's checks run lint, type-check and vitest only; E2E is a separate suite).
- No partner routes exist yet (WP32), so `authenticatePartner` is tested directly rather than through a route.

**Text that needs the owner's approval**

- None as legal or survivor-facing text: WP30 adds no survivor-facing strings and no templates (nothing to set `reviewedByLegal` on). The new admin-console wording (English, hardcoded like the rest of the console) is mine and factual; read it once. In particular: "Approving creates the platform partner… it does not share anything by itself", the key copy ("shown only once"), and the permission form.

**Decisions made on my own**

- On approval the application's contact email becomes the partner's channel email (the ciphertext is copied as-is, no decrypt/re-encrypt round trip; in memory it is encrypted), and admins can edit or clear it on the detail page — the spec lists `channelEmail` on the model and WP33 sends notices there, so it must be settable somewhere.
- `crawlPermissionRecordedAt` stores the date the admin enters (the date on the written permission), not the moment of recording; the recording moment is the audit entry. Re-recording overwrites.
- A domain belongs to one partner: a candidate primary or extra domain that another partner already owns (primary or extra) is refused — `domain_in_use` when editing a partner, `partner_exists` when approving an application — so Rule 1's "the reported URLs on that partner's own domains" is never ambiguous. (Review pass, same day: the approve path had checked only primary domains; it now refuses a domain that any partner owns as an extra domain too, before any write, with a test on each backend.)
- `createdFromApplicationId` carries no foreign key, like `AuditLog.actorId`: provenance, not integrity.
- Same-status changes answer `409 no_change`; re-approving or re-declining a terminal application answers `409 invalid_status`.
- Suspending a partner keeps its keys but they stop authenticating until reactivation.
- Follow-up (same day): `prisma/schema.prisma` and the partners console page had been committed with CRLF line endings, against this repository's LF convention (`core.autocrlf=false`, no `.gitattributes`), which made the branch diff show ~900 phantom changes. Both were normalised back to LF with no content change (verified with `git diff --ignore-cr-at-eol`); every other WP30 file was already LF.

## WP31. The survivor agrees to share (app) — built 19 November 2026

**What was built**

- `PartnerShareConsent` in `prisma/schema.prisma` (caseId, `hashSubmissionIds`, templateId, templateDigest, agreedAt, withdrawnAt) with migration `20261119140000_partner_share_consent`: additive only, RLS like every table, a partial unique index `PartnerShareConsent_one_live_per_case` (one live agreement per case, the crawl authorisation's pattern), and three new enum values (`TemplateType.PARTNER_SHARING_CONSENT`, `AuditEventType.PARTNER_SHARE_CONSENT_GIVEN` / `_WITHDRAWN`).
- New template `PARTNER_SHARING_CONSENT` in `prisma/template-seeds.ts`, created unreviewed like every template, seeded to `reviewedByLegal: false`; the wording starts from the plain text the spec gives. `prisma/seed.ts` needed no change.
- `src/lib/partner-share-consent.ts`: the consent's state, the draft she reads (template rendered for the case + the hash annex of the approved fingerprints, `templateRef` pinning text and fingerprint ids), agreeing (one live row per case, template id + digest pinned, refused when the text or fingerprints changed since the page loaded), withdrawal, the account-deletion hook, and `listPartnerShareableFingerprints()` — the Rule 2 query (live agreement × fingerprint `APPROVED`/`DISPATCHED`) with the Rule 3 adult check at the query (`User.ageOver18` on both database backends). Memory / Prisma / Kysely paths like the crawl modules; audits carry internal ids and counts only.
- `/api/cases/[caseId]/partner-share` (GET state + draft, POST agree, DELETE withdraw): CSRF, `requireSession({ adultOnly: true })`, case ownership, 10 changes/hour rate limit, strict Zod (`{ agreed: true, templateRef }` — a name, contact or signature field is a 400), template legal gate unless `DEV_SKIP_LEGAL_REVIEW`, withdrawal always works whatever the switches.
- Case page: `PartnerShareConsent` component under the crawl opt-in, same visual style (no stripes), one tick box "Also share my fingerprints with partner platforms", the eligible fingerprints masked (`••••••••`, like the fingerprints section), a withdraw action with a confirm step (three plain sentences), the full agreement in an optional disclosure. Hidden when there is no approved fingerprint and no live agreement; once she has agreed it stays visible so she can always withdraw. 25 `partnerShare.*` strings in `en.json` and `hi.json`, the Hindi machine-translated and listed in `src/i18n/hi-review-status.json`.
- Deletion wiring: a deletion request withdraws the agreement on every case at once (`deactivateUser`); account erasure deletes the rows on all three backends (Kysely, Prisma, memory store), counted as `partnerShareConsents` in `HardDeleteCounts`. A fingerprint rejection needs no hook: sharing follows the fingerprint's own status.
- Tests (synthetic data only): `tests/unit/partner-share-consent.test.ts` (16), `partner-share-route.test.ts` (17), `partner-share-ui.test.ts` (18), the extended `notice-template-seeds.test.ts`, and the three erasure/overlap tests extended for the new model — Rules 2, 3, 4, 6 and 7 as WP31 touches them. Full checks: `C:\hermes\check.ps1 -Scope asmita` → ALL CHECKS PASSED (lint, type-check, 1300 tests).

**Not verified**

- Real Postgres: the migration is written but not applied; the Prisma and Kysely paths are exercised only against mocks and the memory store (the repo-wide open item).
- Nothing is actually shared yet: WP32's partner feed does not exist, so `listPartnerShareableFingerprints()` has no consumer beyond its tests.
- The case page in a browser (the checks run lint, type-check and vitest only; E2E is a separate suite). No email is sent here.

**Text that needs the owner's approval**

- The `PARTNER_SHARING_CONSENT` template, unreviewed (`reviewedByLegal: false`) until a human legal reviewer records the review. Point 2 adds the platforms' undertakings (use the fingerprints only to find, remove and block; delete them when Asmita says so), which mirror what `/for-platforms` promises partners — counsel should confirm both together.
- The 25 `partnerShare.*` strings (English and Hindi). The Hindi is machine-translated, listed in `src/i18n/hi-review-status.json` as pending native review. In particular "Asmita asks the platforms to delete them" promises WP32/WP33 behaviour.
- The three stop-sharing sentences ("Asmita stops sharing…", "Asmita asks the platforms to delete…", "Copies that platforms have already removed or blocked stay removed.").

**Decisions made on my own**

- The agreement is standing, not a fixed list: a fingerprint approved after she ticked is covered too. WP32's spec lists approval as a feed event that makes a fingerprint shareable, so the recorded `hashSubmissionIds` are the record of what the page listed when she ticked, not a gate; sharing follows the live agreement plus each fingerprint's own approval. A rejected or deleted fingerprint stops being shared by its status alone, without withdrawing her whole agreement.
- Rule 2's "APPROVED" is read as `APPROVED` or `DISPATCHED` (an advisory already went out), the same approved set the crawl pool uses (`src/lib/crawl-pool.ts`).
- No PDF and no agreement-record block: the spec's column list names no document column, and the tick is not a signature. The template id + digest pin the exact text, the ids pin the fingerprints she was shown, and the audit entry records the account and the time.
- Availability: the tick appears only when hash upload is on, a reviewed template exists, and the case has an approved fingerprint. There is no `ENABLE_*` switch for the partner programme (WP30's decision) and no gate on partners existing — nothing is shared until WP32 serves a feed anyway. Withdrawal works with every switch off.
- Once agreed, the section stays visible even if every fingerprint is later rejected (nothing is shared then, but she must still be able to end the agreement before a future fingerprint is approved). The spec's "hidden when there is no approved adult fingerprint" is applied to the offering of the tick box, not the withdrawal.
- Rule 3 "excluded at the query": the database queries join through to `User.ageOver18`. No separate possibly-a-minor flag exists on cases in the schema, and the memory store carries no age at all, so the memory path relies on the `adultOnly` session gate as everywhere else; the adult filter is asserted on both database backends.
- The full agreement in the disclosure includes the hash annex (like the crawl authorisation), so the text she can read is the text the digest pins; the list beside the tick box stays masked.
- Line endings: the editing tools re-materialised five files with CRLF against the repository's LF convention; all were normalised back to LF with no content change (verified with `git diff --ignore-cr-at-eol`), the same follow-up WP30 recorded.
