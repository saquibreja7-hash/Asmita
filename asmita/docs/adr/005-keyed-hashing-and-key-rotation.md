# ADR 005: Keyed Hashing, Versioned Encryption and Key Rotation

Status: proposed (2026-11-10). Decision owner: Saquib. Not yet implemented.

Numbering note: 003 is left free because the September 2026 removal-engine memo proposes an ADR 003 (status-only verification fetch) that has not been written into this folder yet.

## Context

The November 2026 security audit (branch `fix/security-audit-2026-11`) found two weaknesses that cannot be fixed with a quick patch, because production rows already depend on the current scheme:

1. Identifiers with little entropy (emails, one-time codes, IP addresses, URLs) are stored as plain, unsalted SHA-256 digests.
2. Every encrypted field uses one AES key with no key identifier, so the key can never be rotated piece by piece.

A third finding follows from the first: the append-only audit log keeps a survivor's email digest after her account is deleted.

This ADR records the verified current state and the plan a later engineer implements. Everything below was checked against code on 2026-11-10. Nothing was checked against the live database, Cloudflare account or Supabase project.

### Terms

- **Hash (digest):** a one-way fingerprint of a value. SHA-256 of the same input always gives the same output, so anyone can hash a list of guesses and compare. For an email address or a 6-digit code, guessing is cheap: a list of known email addresses, or all one million codes, can be tried in seconds.
- **Salt:** a random value stored next to a hash and mixed into it, different for every row. It defeats precomputed tables but means the same email gives a different hash in every row.
- **Pepper / keyed hash (HMAC):** a hash mixed with a secret key that is kept outside the database. HMAC-SHA-256 is the standard construction. Without the key, a database thief cannot test guesses at all. With the key, the same input always gives the same output, so equality lookups still work.
- **HKDF:** a standard way to derive several independent keys from one root secret, by labelling each with a purpose string.
- **Authenticated encryption (AES-256-GCM):** encryption that also detects tampering. Decryption fails if a single byte of the ciphertext or its tag changes.
- **AAD (additional authenticated data):** a label bound into the authentication tag but not encrypted. If a ciphertext is copied into a different column, decryption fails because the label no longer matches.
- **Key id (kid):** a short name written into each ciphertext saying which key encrypted it, so several keys can be live at once and old data can be moved to a new key gradually.
- **Crypto-shredding:** making data unreadable by destroying the key it depends on, instead of finding and deleting every copy.

### Current hashing (`src/lib/hash.ts`)

`sha256(value)` is `createHash("sha256")` from `node:crypto`, hex output. `hashEmail(email)` is `sha256(email.trim().toLowerCase())`. `hashIp(ip)` is `sha256(ip.trim())`. There is no salt or key anywhere. The same formula is copied into `prisma/seed.ts` (`hashEmail`) and `scripts/issue-admin-enrolment-code.mjs` (`sha256(email)`), and `scripts/worker-smoke.mjs` recomputes a rate-limit key the same way.

Every use, grouped by what is hashed:

| What is hashed | Function and call site | Where the digest is stored or sent | Lookup by equality | Exposed elsewhere | Sensitivity today |
|---|---|---|---|---|---|
| Survivor email | `hashEmail` in `case-ops.ts` `upsertVerifiedUser`, `auth/otp.ts`, `api/auth/request-otp`, `api/auth/verify-otp` | `User.emailHash` (unique); `OtpToken.emailHash` | Yes: login upsert `ON CONFLICT (emailHash)`, OTP lookup, hard delete removes `OtpToken` by it | `audit_log.entityId` for `USER_REGISTERED` (written on every OTP request, including people who never verify) and `USER_VERIFIED`; `SecurityEventLog.actorHash`; `console.warn` JSON of every security event (Cloudflare logs); JWT claim `emailHash`; rate-limit key `otp:<emailHash>` | High. Recovers the email by dictionary, and so whether a named person used Asmita |
| Admin email | `hashEmail` in `auth/admin-allowlist.ts`, `api/admin/auth/*`, `api/admin/mfa/reset` | `AdminMfaSecret.emailHash` (primary key), `AdminEnrolmentCode.emailHash` (primary key), `AdminSavedView.ownerEmailHash`, `Platform.contactChangedBy`, `PlatformGoHistory.verifiedBy`, JWT claim | Yes: MFA secret and enrolment lookup; saved views; two-person check in `api/admin/platforms/[platformId]/verify` compares `contactChangedBy` with the session hash | `SecurityEventLog.actorHash`; console logs; rate-limit keys `admin-otp:`, `admin-verify:`, `admin-mfa-confirm:` | Medium. Admin emails are known inside the organisation, but should not be confirmable from a leak |
| Admin id | `createAdminIdentity`: `admin-` plus the first 24 hex characters of the email digest | `audit_log.actorId`, `AdminAccessLog.adminId`, `PlatformGoHistory.changedById`, JWT `sub`, rate-limit key `admin-url-reveal:<sub>` | Yes: admin audit page filters by `actorId` | Survivor audit trail (`api/cases/[caseId]/audit-trail`) returns `actorId` of admins who acted on her case | Medium. 96 bits of the unsalted digest are enough to confirm an admin's email |
| ADMIN_EMAILS / ADMIN_ROLES entries | `resolveAdminRoleByHash` hashes every entry of both lists on every admin request | Not stored | Compared with the session's `emailHash` | None | Not stored, but sets the per-request cost budget |
| Survivor OTP (6 digits) | `sha256(token)` in `auth/otp.ts` | `OtpToken.tokenHash` | Compared in constant time after lookup by `emailHash`; 10-minute life, 5 failed attempts, one live code per email | Rows are never pruned: only a hard delete removes them | High while live: a reader of the live table recovers the code in milliseconds and can sign in as the survivor within the 10 minutes. Low once expired |
| Admin enrolment code (12 digits) | `sha256(code)` in `auth/admin-enrolment.ts` and the bootstrap script | `AdminEnrolmentCode.codeHash` | Yes, with `emailHash`, single use, 24 hours | None | Medium. 10^12 SHA-256 guesses is hours on one GPU, inside the 24-hour life |
| Submitted URL (normalised) | `sha256(normalizedUrl)` in `url-parser.ts` | `SubmittedUrl.urlHash` (cleared to `""` by the 30-day purge in `url-retention.ts`) | Yes, within a case: dedupe in `case-ops.ts` (`findFirst({ caseId, urlHash })` and the in-batch map) | First 16 characters shown to the survivor as a reference | High. Anyone holding a candidate URL (including the perpetrator) can confirm it was reported, and by which account |
| PDQ fingerprint (64 hex) | `sha256(validated.hash)` in `hash-submission.ts` | `HashSubmission.hashDigest`; unique `(caseId, hashDigest)` | Yes, within a case, for dedupe | Prefix shown on the admin hashes page and the survivor case page | Medium. Confirms an exact known fingerprint was submitted; does not allow near matching |
| Client IP | `hashIp` in `admin-access-log.ts` | `AdminAccessLog.ipHash` | No | Admin console | Medium. All IPv4 addresses can be hashed in minutes |
| Rate-limit bucket name | `sha256(key)` in `rate-limit.ts` | `RateLimitBucket.key` (primary key), pruned after 2 days | Yes, upsert by key | None | Medium. Keys embed raw IPs (`registration-ip:`, `case-create-ip:`, `chat-message-ip:`, `voice-session-ip:`, `url-submit-ip:`, `feedback-ip:`), email digests and email domains, so the IP or email is recoverable for two days |
| Check-image IP | `sha256(ip)` inside the bucket name in `api/check-image` | Through the rate-limit key | As above | None | As above |
| Case registration idempotency key | `sha256(idemKey)` in `api/cases/create` | `Case.registrationKeyHash`, unique with `userId` | Yes | None | Low if the client sends a random key (it should; not verified for every client) |
| NGO API key | `sha256(secret)` in `ngo-api-keys.ts` | `NgoApiKey.keyHash` (the code path is in memory only today) | Yes | None | Low. The secret is 192 random bits |
| Audit chain | `sha256(canonicalize(record))` in `audit.ts` | `audit_log.eventHash`, `previousHash` | Chain verification | None | Not a secret; integrity only |
| Notice body, template text, webhook event | `payloadHash`, `signed-template.ts`, `email-delivery-proof.ts`, `alerts.ts` id | Various | Integrity and dedupe | None | Not secret; high-entropy or public inputs |
| Resend idempotency keys | `sha256` in `notice-dispatch.ts`, `hash-dispatch.ts` | Sent to Resend | Resend dedupes on it | Resend | Low. Inputs are internal ids and the platform's public grievance address |
| CSRF token | `sha256(nonce + ":" + CSRF_SECRET)` in `csrf.ts` | Cookie and header | Compared | Browser | Low, but this is a home-made MAC; HMAC is the right construction |

Columns that exist but are never written by current code: `audit_log.ipHash` (no caller passes `ipHash` to `writeAuditLog`), `Case.declarationIpHash` (only ever set to null), `SessionToken` (only deleted, never created; sessions are JWTs), `UrlPortalToken` (only deleted) and `AdminProfile.mfaSecret`. The live database should be checked to confirm they are empty.

### Current encryption (`src/lib/encryption.ts`)

`encryptField` uses AES-256-GCM from `node:crypto` with a random 12-byte IV and the 16-byte GCM tag. The output is `ivHex:tagHex:ciphertextHex`. The key is `ENCRYPTION_KEY`, 32 bytes as hex, read on every call. There is no key id, no version marker and no AAD. Outside `NODE_ENV=production` a missing key silently becomes 32 zero bytes.

So the mode is authenticated (tampering is detected), but:

- one key protects every column, and its leak exposes all of them;
- there is no way to tell which key encrypted a value, so rotation means re-encrypting every row in one step with downtime;
- ciphertext can be moved between columns or rows and still decrypt (no AAD);
- hex encoding makes stored PDFs 2.7 times the size of the PDF (base64 then hex).

Every encrypted column:

| Column | Plaintext | Written by | Read by | Cleared by | Sensitivity |
|---|---|---|---|---|---|
| `User.emailEncrypted` | Survivor email | `upsertVerifiedUser` (on every sign-in) | `getVerifiedUserEmail`, `escalation-engine.ts` | Hard delete sets `"deleted"` | High |
| `SubmittedUrl.urlEncrypted` | Normalised URL of the intimate content | `case-ops.ts` (create case, add URLs) | `preview-notice`, `sign-notice`, admin `reveal` | 30-day purge sets `""`; hard delete removes the row | Very high |
| `SubmittedUrl.signedNoticePdf` | Base64 of the signed notice PDF (name, declaration, URL) | `sign-notice` | `notices/dispatch` | 30-day purge sets null | Very high |
| `Case.signedHashAdvisoryPdf` | Base64 of the signed hash advisory PDF | `sign-hash-advisory` | `hash-dispatch.ts` | Hard delete sets null | High |
| `HashSubmission.hashEncrypted` | PDQ fingerprint, 64 hex | `hash-submission.ts` | `case-hash-annex.ts` (annex, sign, dispatch) | Hard delete | High. PDQ values are invertible to a recognisable approximation of the image, so they must stay decryptable for near matching and must never be replaced by a keyed hash (ADR 004, hash bank) |
| `Feedback.comment` | Free-text feedback | `feedback.ts` | Not read in app code found | Hard delete | Medium |
| `AdminMfaSecret.secretEncrypted` | Admin TOTP secret | `admin-mfa-store.ts` | Sign-in verify; `confirmAdminMfa` also uses the ciphertext itself as an optimistic-concurrency check | MFA reset | High (admin takeover with the email OTP) |

The memory-mode `store.ts` uses the same functions; it is not a production path.

### The audit log

`writeAuditLog` (`src/lib/audit.ts`) appends to `audit_log` under a table lock. Each row's `eventHash` is SHA-256 of the canonical JSON of the event fields (`eventType`, `entityType`, `entityId`, `actorId`, `data`, `ipHash`, `sequence`, `createdAt`, `previousHash`), and `previousHash` is the prior row's `eventHash`. `validateAuditChainFromDb` recomputes every hash, but only over the first 10,000 rows. Editing `entityId` on an old row makes its recomputed hash differ and verification fails at that row.

`USER_REGISTERED` (every OTP request) and `USER_VERIFIED` (every successful sign-in) put the survivor's email digest in `entityId`. The hard delete in `case-ops.ts` (`eraseUserWithKysely` and `eraseUserWithPrisma`) tombstones the user (`emailHash = "deleted:<id>"`, `emailEncrypted = "deleted"`) but leaves these audit rows, and leaves `SecurityEventLog` rows carrying the same digest. Neither table is pruned. With an unsalted digest this is, in effect, a list of every email address that ever asked Asmita for a code.

### Correction to the brief

The brief assumed the raw email is not stored, so users could only be re-keyed when they next sign in. That is wrong: `User.emailEncrypted` holds the email under `ENCRYPTION_KEY`. A server-side job can decrypt it and re-key every live user without waiting for them to return. Only tombstoned users (`emailEncrypted = "deleted"`) cannot be re-keyed, and they need no lookup key. Admin emails are also available in plaintext, in the `ADMIN_EMAILS` Worker secret.

## Threat model

| Attacker | What they get | What they recover today |
|---|---|---|
| Database dump or stolen backup (Supabase backups, a `pg_dump` on a laptop, the `.env` with `DATABASE_URL`) | Every table, no Worker secrets | Every survivor and admin email that is in any email list they hold (confirming whether a named person used Asmita, and when she signed in, from `audit_log`); every IP in the last two days of rate-limit keys and in `AdminAccessLog`; whether a candidate URL or PDQ fingerprint was reported; admin emails from `actorId`. No ciphertext. Expired OTPs are harmless |
| Supabase insider or anyone with live read access (including a leaked read-only role) | As above, live | All of the above, plus live OTP codes: hash all one million codes, match `tokenHash`, and sign in as the survivor within 10 minutes using the email recovered from `emailHash` (if it is in their list) or a targeted guess. This is an account takeover path |
| Log access (Cloudflare Workers Logs, tail, anything logs are forwarded to) | `console.warn` JSON of every security event | Email digests, so emails by dictionary, linked to routes and failure reasons |
| Leak of `ENCRYPTION_KEY` alone | One secret | Nothing without the database |
| Leak of `ENCRYPTION_KEY` plus the database | Both | Everything encrypted: emails, URLs, signed PDFs, PDQ fingerprints (and so approximate images), feedback, admin TOTP secrets. The key cannot be rotated without re-encrypting everything at once |
| Compromised Worker or Cloudflare account | All secrets and the Hyperdrive binding | Everything. No storage scheme fixes this; it is defended by account security (hardware keys, few people with access) and, later, an external key service |

The plan below aims for: a database or backup leak alone yields no email, IP, URL, code or fingerprint; a secret leak alone yields nothing; keys can be rotated one at a time without downtime; and a deleted survivor leaves nothing in the database that identifies her by email.

## Decision

### 1. Lookup keys become HMAC-SHA-256 with a server-side secret

Every equality-lookup digest of a low-entropy value becomes `HMAC-SHA-256(purpose key, input)`.

**Rejected: per-row salts.** A per-row salt makes the same email hash differently in every row, so `WHERE emailHash = ?` can no longer find the row. Login, OTP lookup, admin MFA lookup and URL dedupe would all need a full scan that hashes every row, which is impossible at scale and on Worker CPU limits. Salts are the right tool for passwords checked against one known row, not for lookup keys.

**Rejected: slow password hashes (bcrypt, scrypt, Argon2) for lookup keys.** With a secret pepper, a database thief cannot test guesses at all, so slowness adds little. On the other hand, slowness costs Worker CPU on every login, every OTP request and every admin request (the allowlist hashes each entry), and Argon2 needs a WebAssembly build in workerd.

**Inputs are normalised before hashing, as today:** email trimmed and lower-cased, URL normalised by `url-parser.ts`, PDQ lower-case hex, IP trimmed.

**Stored format:** `h1:` followed by 64 hex characters. Legacy digests are bare 64 hex. Tombstones stay `deleted:<id>`. The prefix lets code tell versions apart, lets operators count legacy rows, and lets a later key rotation introduce `h2:`.

### 2. One root secret, purpose keys derived with HKDF

A new Worker secret, `LOOKUP_HASH_ROOT_KEY` (32 random bytes, hex), is the root. Each purpose key is `HKDF-SHA-256(root, salt = "asmita-lookup", info = "asmita/lookup/<purpose>/v<n>")`, derived once per isolate and cached.

| Purpose | Input | Columns |
|---|---|---|
| `email` | Normalised email (survivor or admin) | `User.emailHash`, `OtpToken.emailHash`, `AdminMfaSecret.emailHash`, `AdminEnrolmentCode.emailHash`, `AdminSavedView.ownerEmailHash`, `Platform.contactChangedBy`, `PlatformGoHistory.verifiedBy`, `SecurityEventLog.actorHash`, JWT claim |
| `admin-id` | Normalised admin email | `admin-` plus 24 hex of the HMAC, used as admin `sub` and `actorId` |
| `otp` | `otpRowId + ":" + code` | `OtpToken.tokenHash` |
| `enrolment` | `emailHash + ":" + code` | `AdminEnrolmentCode.codeHash` |
| `url` | Normalised URL | `SubmittedUrl.urlHash` |
| `pdq-digest` | PDQ hex | `HashSubmission.hashDigest` |
| `ip` | Client IP | `AdminAccessLog.ipHash` |
| `rate-limit` | Bucket name | `RateLimitBucket.key` |

Why HKDF from one root rather than independent secrets: every purpose key lives in the same Worker, so independent secrets do not protect against a Worker compromise, and a database leak exposes none of them either way. One root means one secret to generate, back up and rotate. HKDF still keeps purposes separate (an `ip` digest can never be confused with an `email` digest), allows rotating one purpose by bumping its version, and allows handing a single derived key to a tool (for example the email key to the admin bootstrap script) without handing over the root.

The lookup root is a separate secret from the encryption keyring. Tools such as the bootstrap script need the email key; they must never need a key that decrypts survivor data.

High-entropy or non-secret inputs keep plain SHA-256: the audit chain, `payloadHash`, template digests, webhook event digests, alert ids, `NgoApiKey.keyHash` (192 random bits) and `registrationKeyHash`. `csrf.ts` should move to `HMAC(CSRF_SECRET, nonce)` when it is next touched; it is not part of the data migration because tokens are short-lived.

### 3. OTP codes: keyed hash, no slow hash

A 6-digit code has one million values. Its real defences are the 10-minute life, the 5-attempt cap, one live code per email and the rate limits. The weakness today is that anyone who can read the table recovers the live code offline. HMAC with the `otp` key removes that: without the root, offline guessing is impossible. Binding the row id into the input means a hash copied from one row into another never verifies. A slow hash would only matter against an attacker who has both the live database and the Worker secret, and such an attacker can already insert their own OTP row. Not worth the CPU. The row id must be generated in code before insert on both the Kysely and Prisma paths (Kysely already does).

The same applies to the 12-digit enrolment code, bound to the admin's email digest.

### 4. Encryption: versioned ciphertext, key id, keyring, AAD

New format:

```
e1:<kid>:<iv base64url>:<tag base64url>:<ciphertext base64url>
```

- `e1` is the format version. Legacy values are recognised as exactly three hex parts.
- `kid` is a short key name such as `k2026a` (lower-case letters and digits, at most 16 characters).
- AES-256-GCM as today, 12-byte random IV.
- AAD is `asmita|<column>`, for example `asmita|SubmittedUrl.urlEncrypted`. A ciphertext moved to another column fails to decrypt. Binding the row id as well would also stop swaps between rows, but it requires generating ids before every insert and complicates the re-encryption job; it is left as an open question.
- base64url instead of hex cuts stored PDFs by about a third.

The keyring is one Worker secret, `ENCRYPTION_KEYRING`, holding JSON of the form `{"active":"k2026a","keys":{"k2026a":"<64 hex>"}}`. New writes use `active`; reads use the `kid` in the value. The legacy `ENCRYPTION_KEY` stays as the implicit key for legacy-format values until none remain. Keys in the keyring are independent random keys, not derived from one another, so destroying an old key after rotation actually shreds data that was never moved.

One keyring for all columns is kept for now. PDQ fingerprints are the most likely candidate for a separate keyring later (the future hash bank wants its key held outside the general app), and the format supports that because the `kid` can name a key from a different ring.

Rejected: per-row data keys wrapped by a key-encryption key (classic envelope encryption). Without an external key service the wrapping key sits in the same Worker secret as the data key would, so it adds complexity without separating anything. Revisit when the database moves to AWS and AWS KMS in Mumbai becomes available (see open questions).

PDQ fingerprints stay reversibly encrypted. A keyed hash would destroy Hamming-distance matching, which is the point of PDQ.

### 5. Where the keys live on Cloudflare

Worker secrets (`wrangler secret put`) for `LOOKUP_HASH_ROOT_KEY` and `ENCRYPTION_KEYRING`, set separately on `asmita-production` and `asmita-staging` with different values. Worker secrets are encrypted at rest by Cloudflare, are not readable back from the dashboard or API once set, and are available synchronously on `env`.

Cloudflare Secrets Store (account-level secrets bound into Workers) is not needed now. Its benefit is sharing one secret across several Workers, which we specifically do not want between staging and production. Its binding is read asynchronously, which would turn every hash call into an async call. Its current status and any data-location implications were not checked; revisit only if more Workers need these keys.

### 6. Crypto API on workerd

The Worker runs with `nodejs_compat` (`wrangler.jsonc`). The current code already uses `createHmac` (Resend webhook verification, TOTP) and `createCipheriv("aes-256-gcm")` from `node:crypto` in production, so both work in workerd. The plan keeps `node:crypto` because it is synchronous: `hashEmail` is called synchronously in `admin-allowlist.ts`, and moving to Web Crypto (`crypto.subtle`, which supports HMAC, HKDF and AES-GCM with AAD, but is async only) would make every caller async.

Two primitives are not yet used anywhere and must be confirmed in `scripts/worker-smoke.mjs` before relying on them: `cipher.setAAD()` and `hkdfSync()`. If `hkdfSync` is missing, HKDF is two HMAC calls (RFC 5869) and can be written with `createHmac`.

### 7. Admin allowlist cost

`resolveAdminRoleByHash` hashes every `ADMIN_EMAILS` and `ADMIN_ROLES` entry on every admin request. HMAC-SHA-256 of a short string costs microseconds, so for a handful of admins the cost is negligible. Cache the computed set per isolate, keyed by the raw env strings so a secret change takes effect on the next isolate. During the migration the allowlist accepts both the `h1:` and legacy digest of each entry, so admin sessions issued before the switch (up to 8 hours) keep working.

### 8. The audit log stops carrying email digests

New rows: `USER_VERIFIED` records the `User.id` (a random UUID) as `entityId`. After a hard delete the user row is a tombstone, so the id links to nothing identifying. `USER_REGISTERED` (an OTP request, often before any user row exists) records no identifier at all; the per-email security signal it gave already lives in `SecurityEventLog` and the rate limits. Rule for all new audit events: `entityId` and `actorId` are internal ids, never digests of personal data.

Existing rows cannot be edited without breaking verification. Three options were considered:

- **Leave them.** Rejected: with an unsalted digest they are the emails.
- **Rewrite the chain.** Recompute every hash from the first redacted row onward. Rejected: it destroys the tamper-evidence the chain exists to give; anyone could later claim the log was rewritten.
- **Redaction with commitments (recommended).** First verify the whole chain. Then, for each legacy row whose `entityId` is an email digest (`entityType = "User"` and `eventType` `USER_REGISTERED` or `USER_VERIFIED`), compute a redacted hash: SHA-256 of the canonical record with `entityId` replaced by the fixed string `[redacted]`. Append one or more `AUDIT_REDACTED` events (at most 500 rows each) listing `{sequence, originalEventHash, redactedHash}` and a reason code. In the same transaction, set those rows' `entityId` to `[redacted]`. The verifier reads redaction events first, then walks the chain: for a redacted row it checks the stored `eventHash` equals the listed `originalEventHash` (the next row's `previousHash` still links to it) and that the row's current content hashes to `redactedHash`. Any other edit to a redacted row, or to any other row, is still detected. The redaction itself is permanently recorded in the chain.

Crypto-shredding (a per-user key that is destroyed on deletion) was considered for new rows and rejected as unnecessary once audit rows hold only internal ids.

`SecurityEventLog` is not chained. Its legacy `actorHash` values are re-keyed where the email is known (admins), and otherwise set to null; then rows older than a retention period are pruned. The hard delete also removes that user's `SecurityEventLog` rows (both digest forms) and `OtpToken` rows (both forms).

## Migration plan for production data

Principle: deploy readers before writers, keep the dual-read release as the only rollback target once anything has been rewritten, and never remove a legacy path until counts and metrics show it is unused.

The point of no return is the first row written in a new format. After that, rolling back to code older than Phase 1 locks out every re-keyed user and makes every re-encrypted value unreadable. Rollback from any later phase is to the Phase 1 release, which reads everything.

### Phase 0: stop new leaks (no keys, no data migration)

1. `USER_VERIFIED` writes `User.id`; `USER_REGISTERED` writes no identifier.
2. The maintenance cron deletes `OtpToken` rows that expired more than 24 hours ago, and `SecurityEventLog` rows older than the agreed retention (recommended 90 days).
3. `logSecurityEvent` stops writing `actorHash` to `console.warn` (the database row keeps it).
4. The hard delete also deletes the user's `SecurityEventLog` rows by `actorHash`.
5. Paginate `validateAuditChainFromDb` so it verifies the whole log, not the first 10,000 rows.

Rollback: ordinary redeploy. Verify: no new `audit_log` rows with a 64-hex `entityId` after the deploy (`select count(*) from audit_log where "createdAt" > <deploy> and "entityId" ~ '^[0-9a-f]{64}$'`).

### Phase 1: dual-read release (writes unchanged)

1. Generate and set `LOOKUP_HASH_ROOT_KEY` and `ENCRYPTION_KEYRING` on production (runbook below). `ENCRYPTION_KEYRING`'s first key is new; `ENCRYPTION_KEY` stays.
2. Ship `src/lib/hash.ts` and `src/lib/encryption.ts` with both versions: `lookupKeys(purpose, input)` returns `[h1, legacy]`; `decryptField` accepts legacy and `e1`. All writes still produce the legacy format.
3. Every equality lookup reads both forms: `where emailHash in (h1, legacy)`, and the same for `OtpToken`, admin tables, `urlHash`, `hashDigest`. The two-person check treats `contactChangedBy` as the same admin if it equals either form of the session admin's email, so no admin can verify their own change during the transition. The allowlist accepts both forms.
4. Add counters (a log line with a fixed event name per column and version, no values): `legacy_lookup_hit`, `legacy_decrypt`.
5. Confirm in `worker-smoke.mjs` that HKDF, HMAC and AES-GCM with AAD work in workerd.

Rollback: redeploy the previous release; nothing has been rewritten. Soak for at least a few days and one full cron cycle.

### Phase 2: write new formats

1. All new lookup digests are written as `h1:`. All new ciphertext is written as `e1:` under the active `kid`.
2. `upsertVerifiedUser` first runs, in one transaction, `update "User" set "emailHash" = h1 where "emailHash" = legacy`, then the upsert on `h1`. Without this step a returning, not-yet-migrated user would get a second `User` row, because the upsert conflicts only on the exact digest.
3. New OTPs use the `otp` key; verification tries the stored format (`h1:` prefix or bare hex). Pending OTPs created before the deploy keep verifying through dual-read for their 10 minutes; at worst a survivor asks for a new code.
4. Rate-limit buckets switch to the `rate-limit` key. Old buckets are not read; they are pruned within 2 days. This resets every counter once, which gives an abuser one fresh window (at most 24 hours on the daily limits). Deploy at a quiet hour. If that is unacceptable, read the legacy bucket's count for one window and add it to the new one; this is optional.
5. Admin sessions: JWTs issued before the deploy carry the legacy claim; dual-read covers them until they expire (8 hours).
6. Admin ids: new admin sessions use the `admin-id` derived id. Write one `ADMIN_ID_CHANGED` audit event per admin recording old and new id so history stays linkable, and make the admin audit page resolve both. (Owner decision below; the alternative is to keep legacy admin ids.)

Rollback: to the Phase 1 release, which reads both formats.

### Phase 3: re-key existing lookup values

Admins first, by an authenticated, idempotent admin-only route or cron step that reads `ADMIN_EMAILS`, computes both forms for each entry, and rewrites `AdminMfaSecret`, `AdminEnrolmentCode`, `AdminSavedView`, `Platform.contactChangedBy`, `PlatformGoHistory.verifiedBy` and admin `SecurityEventLog.actorHash` from legacy to `h1:`. This is a handful of rows and runs in one transaction. Dual-read means a failure half-way locks nobody out. An admin whose email is no longer in `ADMIN_EMAILS` cannot be re-keyed and should have their MFA row removed by a SUPER_ADMIN.

Then survivors, by a batch step added to the hourly cron (`/api/cron/sweep-due-jobs` or a new `/api/cron/rekey` behind `CRON_SECRET`):

- `User`: select up to N rows where `emailHash` is bare 64 hex (not `h1:`, not `deleted:`), decrypt `emailEncrypted`, compute `h1`, `update ... set "emailHash" = h1 where id = ? and "emailHash" = legacy`. The conditional update makes the job safe to run while users sign in. Deactivated users (in the 30-day deletion grace) are re-keyed like anyone else. Users who never return are handled by this job; nothing waits for sign-in. Tombstones are skipped.
- `SubmittedUrl.urlHash`: decrypt `urlEncrypted` where it is not `""`, recompute. Purged rows already have `urlHash = ""`.
- `HashSubmission.hashDigest`: decrypt `hashEncrypted`, recompute. The unique `(caseId, hashDigest)` cannot collide across formats.
- `OtpToken`: not re-keyed. Legacy rows expire in 10 minutes and are pruned by Phase 0.
- `AdminAccessLog.ipHash`: the IP is not stored, so legacy values cannot be re-keyed. Set them to null (owner decision on retention).
- `SecurityEventLog.actorHash` for survivors: no reliable reverse mapping without a dictionary; set legacy values to null.
- `DeletionJob` needs nothing: it references `caseId`. The hard delete must delete `OtpToken` and `SecurityEventLog` rows under both forms, computed from the decrypted email before the tombstone overwrites it.

Batch sizing: each row costs one decrypt, one HMAC and one update; the crypto is native and takes microseconds, so the limit is database round trips. Start with 200 rows per run, stop early after a wall-time budget, and loop on the hourly schedule. The Worker plan and its CPU limit for Cron Triggers were not checked; confirm before raising batch sizes.

Verify (all must be zero before Phase 5):

```sql
select count(*) from "User" where "emailHash" ~ '^[0-9a-f]{64}$';
select count(*) from "SubmittedUrl" where "urlHash" ~ '^[0-9a-f]{64}$';
select count(*) from "HashSubmission" where "hashDigest" ~ '^[0-9a-f]{64}$';
select count(*) from "AdminMfaSecret" where "emailHash" ~ '^[0-9a-f]{64}$';
-- and the same for the other admin-keyed columns, OtpToken and SecurityEventLog
```

Rollback: to the Phase 1 release.

### Phase 4: re-encrypt existing ciphertext

A batch step in the same cron route, one column at a time, smallest first: `AdminMfaSecret`, `Feedback.comment`, `User.emailEncrypted`, `HashSubmission.hashEncrypted`, `SubmittedUrl.urlEncrypted`, then the PDFs (`SubmittedUrl.signedNoticePdf`, `Case.signedHashAdvisoryPdf`).

- Select rows whose value is legacy format (three hex parts), skipping `""`, `"deleted"` and null.
- Decrypt with `ENCRYPTION_KEY`, encrypt with the active `kid` and the column's AAD, `update ... where id = ? and <column> = <old value>`. If another request changed the value in between (a re-sign, a purge, a delete), the update affects zero rows and the row is picked up next run if still legacy.
- PDFs are large: limit by bytes as well as rows (for example 2 MB of ciphertext per run).
- `confirmAdminMfa` compares the stored ciphertext as a concurrency check, so an admin confirming enrolment at the exact moment their row is re-encrypted gets one failure and retries. Acceptable; or re-encrypt `AdminMfaSecret` only where `confirmedAt` is set.
- Rows purged by the 30-day URL retention during the migration need nothing.

Verify: count of legacy-format values per column is zero, and `legacy_decrypt` counters are zero for 7 consecutive days.

Rollback: to the Phase 1 release. Never remove `ENCRYPTION_KEY` before verification passes.

### Phase 5: audit redaction (needs owner sign-off)

Run the redaction-with-commitments procedure from Decision 8 once, from an admin-only, SUPER_ADMIN-gated route, after a full chain verification, in batches of 500 rows. Ship the two-pass verifier in the same release and run it immediately after. Take a database backup before the run and record its id in the redaction event. Rollback is restoring that backup, which is why sign-off comes first.

### Phase 6: contract

1. Remove legacy reads and the legacy digest computation.
2. Remove the `ENCRYPTION_KEY` secret. Destroy the old key material.
3. Update `prisma/seed.ts`, `scripts/issue-admin-enrolment-code.mjs` and `scripts/worker-smoke.mjs` to the new scheme. The bootstrap script takes the derived email key (not the root) from an environment variable entered at run time.

Rollback: to the Phase 4 release; nothing is rewritten in this phase.

### Ordering with the pending 20261110 migrations

`20261110000000_platform_contact_two_person` and `20261110010000_pin_signed_notice_template` are part of the uncommitted security-fix branch and must be applied and deployed first. The first adds `Platform.contactChangedBy`, which starts filling with legacy admin digests from that deploy; Phase 1 dual-read and the Phase 3 admin re-key cover it. Migrations from this ADR take later timestamps. Do not start Phase 2 until the security-fix deploy is stable, so a rollback of one does not tangle with the other.

## Schema changes (described, not written)

- No column type changes for lookup digests: they are `TEXT` and the `h1:` prefix fits.
- Encrypted columns are `TEXT`; the new format fits.
- New enum values in `AuditEventType`: `AUDIT_REDACTED`, `ADMIN_ID_CHANGED`. Postgres enum additions cannot run inside a transaction with their first use, so they get their own migration, as `20261110000000` did for `GO_CONTACT_VERIFIED`.
- Optional index on `SecurityEventLog("actorHash")` so the hard delete can remove a user's rows without a scan.
- Optional, later: drop the unused `Case.declarationIpHash`, `audit_log.ipHash` (only once the verifier tolerates its absence; it is part of the canonical record when present), `AdminProfile.mfaSecret`, `SessionToken` and `UrlPortalToken` if they are confirmed empty and unused. Separate ADR or PR.

## Tests to add

- Unit: `h1:` digests are deterministic, differ by purpose, and differ from legacy; normalisation matches the legacy function exactly (otherwise dual-read misses).
- Unit: `e1` round trip; wrong `kid`, wrong AAD (moved between columns), truncated tag and tampered byte all fail; legacy values still decrypt; unknown `kid` fails closed with a clear error.
- Unit: keyring parsing rejects a missing `active` key, short keys and duplicate ids; production refuses to start without both secrets; no zero-key fallback when `NODE_ENV` is not `development` or `test`.
- Integration (Postgres): a legacy user signs in after Phase 2 and ends up with one `User` row, re-keyed; an OTP issued before the switch verifies after it; an admin with legacy MFA row signs in; the two-person check refuses an admin verifying their own change across formats; the hard delete removes OTP and security-log rows in both forms.
- Integration: re-key and re-encrypt jobs are idempotent, respect batch limits, and skip `deleted:`, `""` and null; a concurrent update during re-encryption is not overwritten.
- Audit: the two-pass verifier accepts a correctly redacted chain and rejects an edit to any other field of a redacted row, an edit to an unredacted row, and a redaction event that lists a wrong original hash.
- Lint test, alongside `tests/lint/`: no new call to plain `sha256` with an email, IP, URL or code (an allowlist of the call sites that keep SHA-256).
- `worker-smoke.mjs`: exercise HKDF, HMAC and AES-GCM with AAD in workerd, and one login and decrypt through the production bundle.

## Operational runbook

- **Key generation:** 32 bytes from a cryptographically secure generator on a trusted machine (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), never in a shared terminal history or chat. Set with `wrangler secret put` using the method in the project's Windows secret-handling note (never piped through PowerShell stdin).
- **Separate values per environment.** Staging and production never share a key.
- **Escrow:** the root lookup key and every live keyring key are also stored offline (password manager vault with hardware-key protection, plus a sealed paper copy) because Worker secrets cannot be read back. Losing the keyring loses every encrypted field; losing the lookup root locks every user out until re-keyed from `emailEncrypted`.
- **Who holds them:** the decision owner, plus one named backup person. Recorded in the ops doc, not in the repo.
- **Rotation cadence:** encryption keyring yearly, and on any staff change among key holders. Add a new `kid`, make it active, run the Phase 4 job against the previous `kid`, verify zero values remain under it, then remove and destroy it. Lookup root: only on suspected compromise, because rotating it means re-keying every lookup column (possible, since emails are recoverable from `emailEncrypted` and URLs and fingerprints from their ciphertext). Bump the purpose version (`h2:`) and reuse the Phase 1 to 6 sequence.
- **Suspected leak of the encryption key:** add a new key and make it active immediately; run re-encryption at a raised batch size; destroy the leaked key once its count is zero; review database access logs for the same period. Data copied while both were exposed must be treated as disclosed.
- **Suspected leak of the lookup root:** rotate as above. Until rotation completes, assume emails, URLs and IPs in any leaked database copy are recoverable.
- **Suspected database leak with no key leak:** after this ADR, nothing in the database is directly identifying. Rotate the database credentials and Hyperdrive config; keys need not change.
- **Incident duties:** whether a leak must be reported, to whom and how fast is a legal question below.

## Risks and open questions for the owner

1. **Admin ids.** Change admin ids to the keyed form (old ids recoverable to emails remain in history, linked by `ADMIN_ID_CHANGED`), or keep legacy admin ids. Recommendation: change them, and separately stop returning admin `actorId` in the survivor audit trail.
2. **Audit redaction.** Approve the redaction-with-commitments procedure for legacy `USER_REGISTERED` and `USER_VERIFIED` rows. Recommendation: yes, after the re-key is complete. Does redacting entries in an append-only audit log conflict with any record-keeping duty? `[CITATION REQUIRED - verify with legal advisor]`
3. **Retention of security logs and admin IP hashes.** Recommendation: 90 days for `SecurityEventLog`, 180 days for `AdminAccessLog.ipHash`, then null. What retention of IP or access logs does Asmita owe? `[CITATION REQUIRED - verify with legal advisor]`
4. **Rate-limit reset at cutover.** Accept one reset, or build the one-window legacy read. Recommendation: accept, and deploy at a quiet hour.
5. **Row-bound AAD.** Bind ciphertext to the row id as well as the column. Recommendation: not now; revisit with the evidence vault (ADR 002), which needs it.
6. **External key service.** When the database moves to AWS, hold the keyring in AWS KMS (Mumbai) with envelope encryption, so a Cloudflare compromise alone does not expose keys. Recommendation: yes, as a follow-up ADR at the AWS move. Is holding the key with a different provider from the data a requirement or only good practice for survivor data? `[CITATION REQUIRED - verify with legal advisor]`
7. **Breach notification.** If a database copy from before this migration is ever found to have leaked, the email digests must be treated as plaintext emails. What notification is required, and to whom? `[CITATION REQUIRED - verify with legal advisor]`
8. **Backups.** Supabase backups taken before the migration still hold legacy digests and legacy ciphertext under `ENCRYPTION_KEY`. Destroying `ENCRYPTION_KEY` makes old backups' ciphertext unreadable, including for disaster recovery. Recommendation: keep `ENCRYPTION_KEY` in escrow until every backup older than the Phase 4 completion date has aged out, then destroy it. Backup retention on the current plan was not verified.
9. **PDQ values sent to platforms.** Re-encryption does not change that bare PDQ values go out in the hash annex and FORM_ONLY copy text. Already open with counsel (ADR 004, Phase 4).

Not verifiable from code alone: the live Hyperdrive database role and its grants, Supabase backup and PITR retention, the Cloudflare Worker plan and Cron Trigger CPU limit, Workers Logs retention and any log forwarding, whether the unused columns are empty in production, how many legacy audit rows exist, and whether staging or preview Workers have `ENCRYPTION_KEY` set (a missing key outside `NODE_ENV=production` silently becomes all zeros).

## Effort estimate

| Phase | Scope | Estimate | Ships alone |
|---|---|---|---|
| 0 | Stop email digests in audit and logs; prune OTP and security logs; full-chain verification | 1 day | Yes |
| 1 | Keyring and lookup libraries, dual-read everywhere, counters, workerd smoke checks, tests | 3 days | Yes |
| 2 | Write new formats; login migrate-on-read; OTP and rate-limit switch; admin id change | 2 days | Yes, after Phase 1 soak |
| 3 | Admin re-key, survivor re-key job, URL and fingerprint digests, verification queries | 2 days | Yes |
| 4 | Re-encryption job, PDFs by byte budget, verification | 2 days | Yes |
| 5 | Audit redaction and two-pass verifier | 2 days | Yes, after sign-off |
| 6 | Remove legacy paths and `ENCRYPTION_KEY`; update seed and scripts | 1 day | Yes, after counts are zero for 7 days |

About 13 developer days, spread over three to four weeks to allow soak time between phases.

## Consequences

- A database or backup leak alone no longer reveals who used Asmita.
- Keys can be rotated one at a time without downtime, and a leaked encryption key can be retired.
- Two new secrets must be generated, escrowed and never lost. Losing the keyring is unrecoverable data loss.
- Every equality lookup carries a second form for several weeks, and the legacy path must be removed deliberately at the end.
- The audit log gains a redaction mechanism, which must stay rare, recorded and approved.
