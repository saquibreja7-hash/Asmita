# Security audit: what is left to do (November 2026)

This list covers what is still open after the November 2026 security audit and the fixes on branch `fix/security-audit-2026-11`. Everything here was either decided as "later", needs the owner or an outside person, or could not be checked from code.

## Before the next production deploy

These must happen before this branch goes live, or admins and survivors will hit errors.

- [ ] **Add `ADMIN_ROLES` on production.** Without it every admin is locked out after this deploy. Every email in `ADMIN_EMAILS` needs an exact uppercase role, for example `you@yourdomain=SUPER_ADMIN`. Roles: `SUPER_ADMIN`, `LEGAL_ADVISOR`, `CASE_REVIEWER`, `GO_EDITOR`, `SUPPORT_AGENT`.
- [ ] **Apply the two database migrations to production:** `20261110000000_platform_contact_two_person` and `20261110010000_pin_signed_notice_template`.
- [ ] **Rotate the key behind the key-shaped secret name.** One secret on `asmita-production` has an API key (starting `sk_`) as its name. Change that key with its provider, then delete the misnamed secret.
- [ ] **Build from a clean copy** with `NEXT_PUBLIC_APP_URL` set (see the deploy runbook in `docs/infra/cloudflare-migration.md`). The local `dist/` folder in the worktree holds a test build.

## Check by hand after the next deploy

- [ ] An admin requests a sign-in code and the email arrives. The email is now sent after the page answers, so a failure only shows in the security log (`email_failed`).
- [ ] Open the sign page, see the notice preview, and sign. Check the browser console for blocked scripts (new stricter security policy).
- [ ] Make one voice call on `/talk` with the browser console open.
- [ ] `asmita-production.<account>.workers.dev` no longer answers (only `meriasmita.org` should).
- [ ] A fingerprint-only case with two email platforms: after approval, both platforms get the notice.
- [ ] A survivor who asked for deletion signs in again: the account works and the deletion is cancelled.

## Owner settings outside the code

- [ ] **Cloudflare rate limit rule** on `meriasmita.org`: `POST /api/auth/request-otp`, counted per IP, 3 requests per 10 seconds, block. Add a second rule for `/api/admin/auth/request-otp` if the plan allows. This slows one source down; it does not stop many attackers working together.
- [ ] **Turnstile** (Cloudflare's free bot check) on the sign-in code form. This is the stronger fix against many attackers draining the hourly sign-in code budget. Needs a small code change plus a site key.
- [ ] **GitHub settings:**
  - Require one approving review on `master`, and apply the rules to admins too.
  - Turn on secret scanning and push protection while the repo is public.
  - Add protection rules to the "Production" deploy environments.
  - Pin third-party actions to a commit hash instead of a tag, especially the AI review action, which holds the Claude token.
- [ ] **Making the repo private:** on the free plan, branch protection and secret scanning stop working, and CI uses the 2,000 free minutes a month. Consider GitHub Pro first.
- [ ] **Staging:** the staging Worker and its database connection were deleted on 2026-11-13. The `deploy:staging` script and the staging block in `wrangler.jsonc` still exist; remove them or set up a separate staging database before using them again.

## Needs access we do not have yet

- [ ] **Asmita database security check.** The Supabase connection used by Claude only sees the TASI projects. Reconnect it (read-only) with the account that owns the Asmita project, then check:
  - row level security on every table;
  - the Supabase security and performance advisors;
  - the grants of the `asmita_worker` role;
  - backup retention;
  - that both migrations above are applied.
- [ ] **Deployed cron schedule** could not be read from the command line. Confirm the three cron triggers exist on `asmita-production`.

## Planned work (not started)

- [ ] **ADR 005: keyed hashing and key rotation** (`docs/adr/005-keyed-hashing-and-key-rotation.md`). Stored emails are scrambled in a way anyone can repeat, and one encryption key protects everything with no way to change it. About 13 days of work in seven phases. Needs five decisions first:
  1. Change admin ids to the new safe form (recommended: yes).
  2. Blank out email digests in old audit log rows while keeping tamper detection (recommended: yes, after legal advice).
  3. Keep security logs 90 days and admin access IP hashes 180 days.
  4. Accept a one-time reset of sign-in rate limits at switch-over.
  5. Keep the old encryption key in safe storage until every older backup has expired, then destroy it.
- [ ] **Hindi copy through Sarvam.** New Hindi messages written during the audit (signing errors, deletion page, voided signature notices, fingerprint notice signing) were written by AI helpers, not Sarvam, and are not in `hi-review-status.json`.
- [ ] **Hindi in the case export PDF.** The export is in English for both languages because the PDF library places some Hindi vowel signs wrongly. Real Hindi needs a font that covers both scripts and glyph-level drawing.
- [ ] **Security policy for styles.** Pages still allow inline styles (`style-src 'unsafe-inline'`). Next step after scripts: a nonce for styles, then tighten API responses once the PDF preview is tested.

## Smaller follow-ups found during the audit

- [ ] The admin dispatch form does not pre-select the platforms the survivor chose for the fingerprint notice.
- [ ] The fingerprint notice sign route trusts the platform list sent by the browser; it could read it from the case instead.
- [ ] Admin queues still send an admin to a case that dispatch would refuse for reasons other than the template (missing portal token, fingerprints pending or changed).
- [ ] A deleted account's fingerprints are kept forever; check that kept fingerprints still marked pending review on deleted cases do not clutter the admin queues.
- [ ] A link the survivor filed on a platform's own form shows as "Sent, waiting for the platform". Decide whether "sent" is the right word for a form filing.
- [ ] A failed follow-up hold writes up to about 24 failure entries per notice before the next step takes over.
- [ ] Repeated deletion requests create duplicate deletion jobs (harmless, all cancelled together).
- [ ] `playwright.config.ts` still sets `MAINTENANCE_MODE`, which no longer does anything.
- [ ] The comment in `src/lib/admin-cases.ts` saying a sent link keeps the queued status is out of date; confirm the earlier status migration covered every old sent link.
- [ ] `npm audit` reports 31 vulnerable dependency versions (15 moderate, 16 high). Review and update.
- [ ] `ci.yml` has an out-of-date comment saying runtime secrets live only in Vercel.
