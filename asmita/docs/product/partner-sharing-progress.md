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
- Tests (synthetic data only): `tests/unit/partner-auth.test.ts`, `partner-admin.test.ts`, `partner-admin-routes.test.ts`, `partner-admin-kysely.test.ts`, `partner-admin-prisma.test.ts` — 60 tests covering Rules 5 and 6 as WP30 touches them (admin approval gates, keys issued by an admin and shown once, hash-only storage, revocation honoured, suspension stops authentication, one audit entry per action, per-route rate limits, scoped key access, encrypted channel email, no key material or email in audit data).

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
- A domain belongs to one partner: a candidate primary or extra domain that another partner already owns (primary or extra) is refused (`domain_in_use`), so Rule 1's "the reported URLs on that partner's own domains" is never ambiguous.
- `createdFromApplicationId` carries no foreign key, like `AuditLog.actorId`: provenance, not integrity.
- Same-status changes answer `409 no_change`; re-approving or re-declining a terminal application answers `409 invalid_status`.
- Suspending a partner keeps its keys but they stop authenticating until reactivation.
