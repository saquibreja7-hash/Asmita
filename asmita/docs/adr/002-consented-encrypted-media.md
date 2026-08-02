# ADR 002: Media May Be Stored, But Only Encrypted, Consented, and Time-Limited

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

The `/check-image` deeper check (`/api/check-image`) forwards the image to OpenAI's `content_provenance_checks` endpoint to read C2PA credentials and the SynthID watermark. This is a third-party processor, which conditions 5 and 6 above would otherwise forbid.

It is allowed as a narrow, opt-in exception because:

- It is **opt-in per image**, behind an explicit consent line naming OpenAI, on top of the adults-only gate.
- The image is **held only in memory** on our server for the request and **never written down** by us.
- It returns a **fact-based signal** (a credential or watermark), not a guess, so it cannot falsely accuse a genuine photo, and the result **never gates help**.
- It is an interim measure until direct SynthID access or our own in-house model is available.

Residual risk accepted by Saquib (2026-08-02): OpenAI receives the image and retains it briefly under its own API data policy. This exception must be revisited if we move detection fully in-house.

Current shipping state: the route and its UI are behind `ENABLE_PROVENANCE_CHECK`, off by default. With the flag unset, `/api/check-image` returns 404 and the deeper-check UI is hidden, so setting `OPENAI_API_KEY` alone does not make the feature live. The flag stays off in production and preview until the blockers below clear.

Known limitation to resolve before enabling: the adults-only gate is client self-attestation, which a caller can bypass on a public endpoint. Before the flag is turned on anywhere real, the route must be bound to an authenticated case that already passed the adult age gate, and the in-memory IP rate limit must move to the Redis driver (it does not hold across stateless serverless instances).

## Status and blockers

This ADR is **proposed, not accepted**. It must not ship until:

- Indian counsel reviews it against the DPDP Act, the IT Rules, and the MeitY NCII SOP, including obligations around holding intimate imagery of adults.
- The retention, encryption, and deletion design has a written security review.
- The child-protection routing has an explicit protocol (see the POCSO/Take It Down work).

Until then, features that depend on it are designed and specced but built behind a flag that is off in all environments, or built only up to the point where no real media is stored.
