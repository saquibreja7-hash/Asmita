# Platform API — outbound notice dispatch to partner platforms

Status: **built, disabled everywhere.** `ENABLE_PLATFORM_API=false` in every
shipped environment (`wrangler.jsonc`, Playwright). No platform in the seed
directory has an `apiEndpoint`. Enabling a live partner is a partnership +
configuration task (see Rollout), not a code change.

## What it is

A transport, not a new notice. The same legally reviewed, survivor-signed
notice packages that go out by email can instead be POSTed to a partner
platform's reporting endpoint over HTTPS+JSON:

- **URL notices** — `POST /api/notices/dispatch` (admin console) routes each
  platform through `routeTier1OrFallback` (`src/lib/tier1-api-client.ts`) and
  dispatches via `dispatchTier1ApiNotice` (`src/lib/notice-dispatch.ts`).
- **Hash advisories** — `dispatchHashAdvisories` (`src/lib/hash-dispatch.ts`)
  sends the signed advisory package (annex + fingerprints + signed PDF) to the
  platform endpoint before falling back to the email channel.

On any send failure the email channel runs exactly as before whenever a
human-verified grievance contact exists. Nothing about the email path changes
while the switch is off.

## Safety model

1. **No new content leaves the building.** The payload body is the *same*
   rendered template text the email would carry — produced by the same
   template, same gates (`reviewedByLegal`, signed PDF required, fingerprints
   approved). The reported URL itself is never in the payload; it exists only
   inside the signed PDF, which is attached as base64 exactly like the email
   attachment.
2. **Fingerprint values, not digests.** The payload carries the real PDQ
   strings, decrypted from `hashEncrypted` at dispatch time — the same values
   the annex text lists. The sha256 `hashDigest` (dedup key) never leaves.
3. **Four human acts to enable.** A platform dispatches via API only when ALL
   hold: `ENABLE_PLATFORM_API=true`, an admin-set `apiEndpoint` on the
   platform row, the id in `TIER1_API_ENABLED_PLATFORMS`, and a token
   (`TIER1_API_TOKEN_<ID>` or the shared fallback). Each is deliberate.
4. **Idempotency, three layers.** (a) `Idempotency-Key` header so the partner
   can dedupe; (b) the `Notice` table (`method: "API"`) blocks re-dispatch in
   database-persistence mode; (c) the in-memory map covers dev/isolate
   restarts. Hash advisories keep the `HashDispatch` unique
   `(hashSubmissionId, platformId)` constraint on top.
5. **Audit trail.** Success: `NOTICE_SENT` / `HASH_DISPATCHED` with
   `transport: "platform_api"`, status, and the partner's `referenceId`.
   Failure: `NOTICE_FAILED` with `transport` and reason, written against
   `SubmittedUrl` / `Case` — never entity type `Notice`, so escalation-ladder
   block detection (which filters `entityType: "Notice"`) is unaffected.
6. **Transport failures never throw.** Non-2xx, network error and timeout all
   resolve to `{ ok: false }` and fall back; timeouts via `AbortController`
   (`TIER1_API_TIMEOUT_MS`, default 10s).

## Configuration

| Variable | Meaning |
|---|---|
| `ENABLE_PLATFORM_API` | Master switch. `false` everywhere shipped. |
| `TIER1_API_ENABLED_PLATFORMS` | Comma-separated platform ids allowed to dispatch via API. |
| `TIER1_API_TOKEN_<PLATFORM_ID>` | Per-platform bearer token (id upper-cased, non-alphanumerics → `_`, e.g. `TIER1_API_TOKEN_X_TWITTER`). |
| `TIER1_API_ACCESS_TOKEN` | Shared fallback token when no per-platform token exists. |
| `TIER1_API_TIMEOUT_MS` | Outbound request timeout, clamped to 1s–60s (default 10s). |

Secrets live in Worker secrets, never in `wrangler.jsonc` (same rule as the
Resend key). `docs/infra/cloudflare-migration.md` keeps its instruction: leave
`ENABLE_PLATFORM_API=false` until each external integration is configured and
tested.

## Payload contract (v1)

```json
POST {platform.apiEndpoint}
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <sha256-derived key>

{
  "schemaVersion": 1,
  "kind": "URL_NOTICE" | "HASH_ADVISORY",
  "caseReference": "ASMITA-2026-00001",
  "noticeBasis": "IT_RULES_2021" | "DMCA" | "IT_RULES_AND_DMCA",
  "subject": "…rendered template subject…",
  "body": "…rendered template body + fingerprint annex text…",
  "fingerprints": [{ "algorithm": "PDQ", "digest": "<64-hex>", "quality": 90 }],
  "signedNoticePdfBase64": "…survivor-signed PDF, same as the email attachment…",
  "idempotencyKey": "<same value as the header>",
  "sentAt": "2026-11-12T00:00:00.000Z"
}
```

Expected response: any 2xx. Optional JSON body `{ "referenceId": "…" }` (or
`{ "id": "…" }`) is stored as `Notice.messageId` for reply correlation.
Everything else (3xx/4xx/5xx, timeout, network error) is a failure → email
fallback if available, else the caller sees `platform_api_failed` (502).

Known limitation: platforms whose `noticeBasis` is `FORM_ONLY` (Meta, X,
LinkedIn) have no notice template today, so API dispatch returns
`email_notice_not_supported` for them. Extending to them requires choosing
their notice basis and legally reviewing templates for it — a legal task
before any code task.

## Routing decision

`routeTier1OrFallback(platform, config)`:

| Condition | Channel |
|---|---|
| Switch on + TIER_1 + endpoint + enabled id + token | **API** |
| Verified grievance email, API not fully configured | **EMAIL** (reason: `platform_api_disabled` / `api_not_configured` / `not_tier_1`) |
| Neither | **FORM_HANDOFF** |

The admin case page shows the channel (`Platform API` vs `Email`) in the Send
notice dialog, and the admin queues count an API-configured platform as
dispatchable instead of `blocked_contact`.

## Partner landscape (why no endpoint is configured)

Research (2026-11-12; see also `docs/research/stopncii-findings.md`):

- **StopNCII.org** (SWGfL / Revenge Porn Helpline, Meta-derived tech) — the
  hash bank platforms consume is partner-gated ("Approved Participants" /
  "Programme Partners"); there is no public API documentation, and it accepts
  hashes only from the depicted person. Asmita's survivor-initiated design
  could interoperate only through a signed partnership.
- **Meta / Google** — no public API for third parties to submit NCII notices
  or hashes; access is partnership/MOU-gated. Google's Priority Flagger
  program is invitation-only policy flagging, not a legal-notice channel, and
  its Content Safety API is CSAM-only. Google Search itself consumes
  StopNCII hashes (since Sept 2025). No endpoint is invented here.
- **I4C national hash bank (India)** — under the MeitY SOP (11 Nov 2025) and
  the Madras HC order (WP 25017/2025), intermediaries hash collated NCII,
  takedown similar content, and communicate hashes to I4C through the Sahyog
  Portal **where onboarded** (MHA RTI, Dec 2025: hash-bank data sharing will
  run through Sahyog). The same RTI says the hash bank is still under
  development, and Sahyog/NCRP access is documented only for authorised
  government agencies and onboarded intermediaries (NCRP's only API lane is
  with banks, for financial fraud). **No private/NGO integration channel
  with I4C, Sahyog or the hash bank is documented in any official source.**
  Any Asmita ↔ I4C integration must wait for a government-mediated
  onboarding that does not exist yet.

Every `apiEndpoint` in the database therefore starts `null`, and enabling a
partner is a deliberate act with a signed agreement behind it.

## Rollout checklist (per partner)

1. Signed partner agreement (PRD Feature 2.2/2.3 gate).
2. Partner endpoint + token verified; token stored as a Worker secret.
3. Platform row updated through the admin GO editor (`apiEndpoint`).
4. The platform's notice basis has an active, legally reviewed template
   (`reviewedByLegal: true`).
5. Staging dispatch exercised with a synthetic case, including the email
   fallback path.
6. Only then: add the id to `TIER1_API_ENABLED_PLATFORMS` and flip
   `ENABLE_PLATFORM_API=true`.
