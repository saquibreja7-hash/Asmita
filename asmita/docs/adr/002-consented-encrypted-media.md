# ADR 002: Media May Be Stored, But Only Encrypted, Consented, and Time-Limited

See also ADR 006 (`006-hash-matching-crawler.md`), which builds opt-in resurfacing monitoring on this ADR's conditions without accepting it; this ADR's status is unchanged.

Status: proposed (blocked on legal sign-off)

## Context

ADR 001 and the original safety charter state that the server never fetches, stores, or processes intimate image content. Only PDQ hashes and text reach the server. This kept Asmita architecturally simple and legally clean.

The survivor-security platform direction (see `docs/product/survivor-security-roadmap.md`) needs capabilities that this rule forbids:

- An evidence vault that preserves screenshots, threat messages, and payment demands so a survivor can escalate to a platform, the police, or a court after the original content is deleted.
- Optional server-side content-authenticity assessment (deepfake detection) for images that carry no client-readable credential.
- Opt-in resurfacing monitoring.

The decision recorded here is to change the charter from "no media, ever" to "media only under strict, consented, encrypted, time-limited conditions."

## Decision

We will allow media storage and server-side media processing under all of the following conditions. Every one is a hard requirement, not a guideline.

1. **Adults only.** Any path that could involve a person under 18, or an image created when the subject was under 18, is routed to the child-protection flow and is never uploaded to Asmita. This preserves the existing "minors never reach the case flow" principle without exception.
2. **Explicit, specific consent** per feature. Consent to open a case is not consent to store an image. Consent to store evidence is not consent to run detection. Each is asked separately and recorded in the audit log.
3. **Encrypted at rest**, with keys managed so that ordinary staff and general infrastructure access cannot read the plaintext.
4. **Time-limited by default.** Every stored object has a deletion date. The survivor can delete immediately at any time. Deletion is real, not a soft flag.
5. **In-memory for detection.** Server-side authenticity checks process the image in memory and discard it. No detection path writes the image to disk or database.
6. **Purpose-bound.** An object stored for evidence is used only for that survivor's case. It is never reused for training, aggregate research, or identifying other people.
7. **Never a gate.** The result of any detection never decides whether a survivor receives help. See the roadmap's content-authenticity section.

## Enforcement (to be built alongside the features)

- The "no media, ever" lint tests and `no-fetch` monitor remain in force for the takedown and notice pipelines. Those pipelines still never touch media. The new media paths are separate, opt-in, and covered by their own tests.
- A minor-exclusion gate must sit in front of every upload entry point, tested to fail closed.
- Retention and deletion must have automated tests proving objects expire and hard-delete.

## Documented exception: OpenAI content-provenance check

The `/check-image` deeper check (`/api/check-image`) forwards the image to OpenAI's `content_provenance_checks` endpoint to read OpenAI's own signals (its Content Credentials and the SynthID watermark). This is a third-party processor, which conditions 5 and 6 above would otherwise forbid.

It is allowed as a narrow, opt-in exception because:

- It is **opt-in per image**, behind an explicit consent line naming OpenAI, on top of the adults-only gate.
- The image is **held only in memory** on our server for the request and **never written down** by us.
- It returns a **fact-based signal** (a credential or watermark), not a guess, so it cannot falsely accuse a genuine photo, and the result **never gates help**.
- It is an interim measure until direct SynthID access or our own in-house model is available.

Residual risk accepted by Saquib (2026-08-02): OpenAI receives the image and retains it briefly under its own API data policy. This exception must be revisited if we move detection fully in-house.

Current shipping state: the route and its UI are behind `ENABLE_PROVENANCE_CHECK`. With the flag unset, `/api/check-image` returns 404 and the deeper-check UI is hidden, so setting `OPENAI_API_KEY` alone does not make the feature live.

Go-live decision (2026-08-02): Saquib chose to enable the flag in production and preview (`ENABLE_PROVENANCE_CHECK=true` plus `OPENAI_API_KEY` set in Vercel) ahead of full legal sign-off, accepting the residual risks below. This means the feature is live before the ADR's blockers are formally cleared; that is a deliberate product decision, recorded here so the written record matches what is deployed.

Open follow-up before this can be considered safe (still outstanding while live): the adults-only gate is client self-attestation, which a caller can bypass on a public endpoint by calling `/api/check-image` directly, so a minor's image could be relayed to OpenAI. This must be closed by binding the route to a started/authenticated case that already passed the adult age gate. Legal sign-off on ADR 002 remains required and is now happening in parallel with the feature being live rather than before it.

## Decision recorded (19 November 2026, Saquib)

The owner has decided that **this one route** — `/api/check-image`, the OpenAI content-provenance check — is accepted to run in production when `ENABLE_PROVENANCE_CHECK=true` (set in the production Worker vars; `OPENAI_API_KEY` is set only as a Worker secret, never a var). The old production force-off in `provenanceCheckEnabled()` (`src/lib/dev-flags.ts`) is removed; the flag alone decides, and without the key the route answers 503 "not configured" and the page hides the button.

What is accepted, per check: the image she explicitly consents to send leaves for OpenAI, over TLS, held in memory only on our side — never stored, never logged (no bytes, no filename, no hash), and the OpenAI response is reduced to the fields the page shows. The adults-only gate and the per-check consent tick stay mandatory and are enforced on the server; the result never gates help.

What is **not** accepted: everything else ADR 002 proposes — the evidence vault, and any media storage or server-side media processing of any other kind. That part of this ADR stays **proposed and blocked on legal sign-off**, unchanged. The WP38 safety review of the route also closed the stale note above about the in-memory IP rate limit: the route now uses the same shared Postgres `RateLimitBucket` counters as every other route (with the standard in-memory fallback), and additionally rejects oversized bodies before reading them, sniffs magic bytes so only real JPEG/PNG/WebP images are ever relayed, and caps the size at 20 MB.

## Status and blockers

This ADR is **proposed, not accepted**. It must not ship until:

- Indian counsel reviews it against the DPDP Act, the IT Rules, and the MeitY NCII SOP, including obligations around holding intimate imagery of adults.
- The retention, encryption, and deletion design has a written security review.
- The child-protection routing has an explicit protocol (see the POCSO/Take It Down work).

Until then, features that depend on it are designed and specced but built behind a flag that is off in all environments, or built only up to the point where no real media is stored.
