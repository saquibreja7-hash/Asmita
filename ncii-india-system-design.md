# Asmita Phase 2: Client-Side Hash Generation and Encrypted Hash Dispatch
## System Design Document v2.0 (supersedes v1.0 "Surakshit")

> **What changed from v1.0:** v1.0 was written as a standalone greenfield app with anonymous
> case-ID+PIN access, a Fastify backend, and hash relay through StopNCII / NCMEC partner
> APIs. Asmita Phase 1 already exists as a Next.js application with OTP-based accounts,
> Prisma/PostgreSQL, a verified-platform directory, notice templates, email dispatch,
> escalation, and an append-only audit log. **We are not partnering with StopNCII, NCMEC,
> or any NGO at this time.** Phase 2 therefore drops the partner-relay model entirely and
> replaces it with direct, encrypted email dispatch of perceptual hashes + legal notices to
> the verified compliance/grievance contacts we maintain ourselves, built on the Phase 1
> dispatch pipeline.

---

## 1. Vision and Positioning

Asmita is an independent, India-context NCII protection tool. Phase 2 adds the preventive
pillar on top of the Phase 1 reactive pillar:

| Pillar | Status | What it does |
|---|---|---|
| **A. Reactive URL takedown (Phase 1, built)** | Live in app | Victim submits URLs; Asmita routes IT Rules 2021 notices by email to verified Grievance Officers / compliance contacts, tracks deadlines, escalates |
| **B. Preventive hash dispatch (Phase 2, this doc)** | Building now | Victim generates PDQ perceptual hashes of intimate images **on their own device**; Asmita dispatches the hash + legal notice by encrypted email to compliance contacts at social platforms, porn sites, and intermediaries so they can proactively block/match the content |

The two pillars compose: if the victim has a copy of the content on their phone, they hash
it (Pillar B). If the content is already live at known URLs, they use Pillar A. Both can run
on the same case. If the victim has no local copy, Phase 1 alone still works — nothing in
Phase 2 is mandatory.

**No partner network.** Hashes are not relayed to StopNCII, Take It Down, or any third-party
matching service. Asmita's own verified contact directory (the existing `Platform` table:
grievance officers, compliance officers, abuse desks at social media platforms and
pornographic sites operating in/reaching India) is the distribution network. Each dispatch
is a transactional email from our DKIM/SPF/DMARC-verified domain containing the legal
notice and the hash annex.

---

## 2. Workflow (end to end)

1. **Sign up / log in** — existing Phase 1 flow: email OTP, adult attestation,
   JWT session. (No anonymous case+PIN mode; that v1.0 idea is dropped to match the
   shipped auth model.)
2. **Create case** — existing flow, with signed declaration (consent + penalty warning).
3. **Generate hash (new)** — victim selects image(s) from their device. PDQ hashing runs
   entirely in the browser (Meta ThreatExchange open-source algorithm). The image is read
   into memory, hashed, and released. **The image never leaves the device** — this is shown
   visually to the user and enforced server-side (the API accepts only 64-hex-char hashes,
   never file uploads; the Phase 1 no-fetch/no-media architecture rule extends here).
4. **Declare where it spread (optional)** — victim names the channels/platforms where the
   content is circulating or threatened (e.g. "Instagram, Telegram, <porn site>"). Asmita
   maps each to the verified `Platform` directory entry.
5. **Submit hashes** — only the 256-bit hash, hash quality score, and declarations go to
   the backend over TLS. Hashes are stored AES-256-GCM field-encrypted at rest (existing
   `encryption.ts`), with a SHA-256 lookup digest for dedup.
6. **Admin review gate** — same human-review posture as Phase 1 notices: an admin reviews
   the hash submission + target platform list before any outbound dispatch (abuse
   prevention, see §7).
7. **Encrypted hash dispatch (new)** — for each target platform with a verified compliance
   contact, Asmita sends one transactional email (Resend, TLS in transit, verified sender
   domain) containing:
   - the legally reviewed notice (IT Rules 2021 / IT Act citations, same template engine
     as Phase 1, new `HASH_ADVISORY` template type),
   - a hash annex: PDQ hash(es), algorithm name + version, quality score, and matching
     guidance ("PDQ, Hamming distance ≤ 31 recommended match threshold"),
   - case reference number; no victim PII (enforced by the existing
     `assertNoticeBodySafe` PII guards).
8. **Track + escalate** — dispatches land in the same Notice/Escalation machinery as
   Phase 1: delivery proof webhooks, response tracking, follow-ups on non-response.
9. **URL flow continues unchanged** — if content is already live, URLs are submitted and
   routed exactly as in Phase 1; the notice for a URL on a case that also has hashes
   includes the hash annex so the platform can both remove the URL and block re-uploads.

### Minor-victim branching

Unchanged from Phase 1, with one hard rule: **hash intake is adult-only**. If the user
indicates the person depicted was under 18 when the image was taken, the hash flow is
blocked and the existing `minor-support` route (POCSO guidance, helpline 1098,
cybercrime.gov.in) is shown. We do not partner with NCMEC, so there is no Take It Down
relay; minors are routed to law-enforcement-first guidance. This stays a routing decision —
the tool never touches content.

---

## 3. Architecture

```
+----------------------------------------------------------------------+
|  CLIENT (Next.js app, browser)                                        |
|                                                                        |
|  Phase 1: case wizard, URL intake, dashboard          (built)          |
|  Phase 2: HashGenerator component                     (new)            |
|    - <input type=file> -> canvas -> ImageData                          |
|    - PDQ hash computed in-browser (TS module, WASM-ready interface)    |
|    - image buffer released; ONLY hash + quality + declarations POSTed  |
+--------------------------------┬--------------------------------------+
                                 | hashes, URLs, declarations only (TLS)
                                 v
+----------------------------------------------------------------------+
|  BACKEND (same Next.js app — API routes, src/lib)                      |
|                                                                        |
|  case-ops.ts            case lifecycle (Prisma)            (built)     |
|  hash-submission.ts     validate/store/encrypt hashes      (new)       |
|  notice-generator.ts    + hash annex rendering             (extend)    |
|  notice-dispatch.ts     email dispatch, idempotent         (built)     |
|  hash-dispatch.ts       fan-out hash advisory per platform (new)       |
|  escalation-engine.ts   timers, follow-ups                 (built)     |
|  audit.ts               append-only hash-chained log       (built)     |
|  jobs/queue.ts          BullMQ (redis) or memory           (built)     |
+--------------------------------┬--------------------------------------+
                                 v
|  PostgreSQL (Prisma) — cases, urls, hash_submissions, platforms,      |
|  notices, audit. NO media storage. NO image columns. Ever.            |
|  Hash values AES-256-GCM encrypted at rest.                           |
+----------------------------------------------------------------------+

Outbound: Resend transactional email (DKIM/SPF/DMARC on asmita.in, TLS)
          -> verified Platform directory contacts (grievance/compliance
             officers at social media platforms, porn sites, hosts)
```

Key deltas from v1.0: single Next.js service (no separate Fastify backend, no React+Vite
PWA), existing OTP accounts (no anonymous mode), no StopNCII/NCMEC/Google-API
integrations, no partner credentials. The "Hash Relay" service from v1.0 becomes
**hash-dispatch**: our own email fan-out over our own verified contact list.

### 3.1 Client-side hashing detail

1. File read in browser only (`FileReader`/`createImageBitmap`), drawn to an offscreen
   canvas, `ImageData` extracted.
2. PDQ (Meta ThreatExchange) computes a 256-bit perceptual hash + quality score [0,100].
   Implementation: TypeScript port living in `src/lib/pdq/`, dependency-free so it runs
   in any browser including low-end Android WebView. The module interface is
   WASM-compatible so the Emscripten-compiled reference implementation can be swapped in
   later for speed; budget ≤ 3s per image on a 3-year-old budget Android.
3. **Bit-exactness gate:** before real dispatch is enabled, the TS implementation must be
   validated against Meta's reference PDQ test vectors (hamming distance ≤ 2 on the
   reference corpus). Until then `ENABLE_HASH_UPLOAD=false` stays.
4. v1 supports images only. Video (TMK+PQF) is Phase 4 — stated clearly in the UI.
5. Low-quality hashes (PDQ quality < 50, e.g. flat/blurred images) warn the user and are
   flagged for admin attention; platforms weigh them less.

### 3.2 Encryption posture ("very encrypted in nature")

- **In transit:** TLS for client→server; SMTP TLS for server→platform email (Resend
  enforces STARTTLS). Where a platform publishes a PGP key for its abuse desk, the hash
  annex can additionally be PGP-encrypted (stored per-platform as `pgpPublicKey`,
  Phase 2.1 — optional, most grievance inboxes have no PGP).
- **At rest:** hash values AES-256-GCM field-encrypted (existing `encryptField`),
  SHA-256 digest column for dedup/lookup. Emails already stored hashed+encrypted.
- **Integrity:** every dispatch logs a `payloadHash` (SHA-256 of the rendered body) in the
  Notice row and the append-only audit chain, so any notice can be proven verbatim later.

---

## 4. Data Model (additions to existing Prisma schema)

```
HashSubmission
  id                 uuid PK
  caseId             -> Case
  algorithm          PDQ (enum HashAlgorithm; room for PDQ_WASM, TMK later)
  hashEncrypted      AES-256-GCM ciphertext of the 64-hex-char hash
  hashDigest         sha256(hash) — dedup + lookup, never reversible to image
  quality            Int (PDQ quality 0..100)
  clientVersion      String (pdq-ts version used, for bit-exactness audits)
  status             PENDING_REVIEW | APPROVED | DISPATCHED | REJECTED
  flaggedForReview   Boolean, flagReason String?
  submittedAt, reviewedAt, reviewedById

HashDispatch
  id                 uuid PK
  hashSubmissionId   -> HashSubmission
  platformId         -> Platform (verified contact required)
  noticeId           -> Notice (reuses Phase 1 notice/delivery-proof machinery)
  dispatchedAt

New enums/values:
  HashAlgorithm { PDQ }
  HashSubmissionStatus { PENDING_REVIEW, APPROVED, DISPATCHED, REJECTED }
  TemplateType  += HASH_ADVISORY
  AuditEventType += HASH_SUBMITTED, HASH_APPROVED, HASH_REJECTED, HASH_DISPATCHED
```

Retention: hash submissions follow the case deletion lifecycle (existing `DeletionJob`);
hard-deleting a case hard-deletes its hashes. No new PII is introduced — a PDQ hash is
not reversible to the image.

---

## 5. API Surface (new)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/cases/[caseId]/hashes` | POST | session, adult-only, CSRF, rate-limited, idempotent | Submit 1–10 client-generated hashes + declaration |
| `/api/cases/[caseId]/hashes` | GET | session (owner) | List hash submissions + dispatch status |
| `/api/admin/hashes` | GET | admin | Review queue |
| `/api/admin/hashes/[id]/approve` | POST | admin (CASE_REVIEWER+), MFA | Approve + trigger dispatch fan-out |
| `/api/admin/hashes/[id]/reject` | POST | admin | Reject with reason |

Validation: hash must match `/^[0-9a-f]{64}$/i` (256-bit hex). Any payload resembling
file content (base64 blobs, data URLs, oversized bodies) is rejected and logged as a
security event — the server must never accept media.

Feature gate: every Phase 2 route returns 404 unless `ENABLE_HASH_UPLOAD=true`.

---

## 6. Dispatch and Notice Content

- New `HASH_ADVISORY` notice template (legally reviewed before activation, same
  `reviewedByLegal` gate as Phase 1 templates). Cites IT Rules 2021 Rule 3(2)(b)
  due-diligence obligations, IT Act 66E/67/67A, BNS 77/78 where applicable.
- Hash annex block appended to: (a) standalone hash advisories, (b) Phase 1 URL notices
  on cases that also have approved hashes.
- Recipients come exclusively from the verified `Platform` directory
  (`lastContactVerifiedByHuman=true`); the existing `assertVerifiedNoticeRecipient`
  guard blocks anything else. Dispatch is idempotent per
  (hashSubmission, platform) — re-runs never double-send.
- Delivery proof, response tracking, and non-response escalation reuse Phase 1 plumbing
  (`EmailDeliveryProof`, `Escalation`, cron follow-ups).

---

## 7. Abuse Prevention

The classic attack: hashing someone's ordinary photos to censor them. Without StopNCII's
human-moderation backstop, **our admin review gate is the backstop**:

- Mandatory signed declaration (existing flow) with legal-penalty language, logged with
  timestamp + template version in the audit chain.
- Every hash submission lands in `PENDING_REVIEW`; nothing dispatches without an admin
  (CASE_REVIEWER or above, MFA) approving. Note: the admin sees only the hash + case
  metadata — by design nobody at Asmita can see the image, so review checks account
  reputation, volume anomalies, declaration integrity, and target-list plausibility,
  not content.
- Rate limits: per-case and per-IP hash submission caps (mirroring URL caps);
  `abuse-detection.ts` extended with hash-burst heuristics (many hashes across many
  cases from one account → flag).
- The advisory email identifies Asmita as sender on behalf of a complainant; platforms
  can challenge through us, and every outbound body is hash-logged for accountability.

---

## 8. India-Specific Principles (carried forward from v1.0)

Still authoritative for UX work: shame/family-device dynamics, Quick Exit, no-jargon
language ("a digital fingerprint of your photo — the photo itself never leaves your
phone"), voice-first guidance, 13-language roadmap, budget-Android performance target,
caste-targeting capture (optional, strengthens notices via SC/ST Act), sextortion
("not posted yet but threatened") as a first-class flow — hash dispatch is exactly the
tool for that scenario. These land incrementally; Hindi+English first (existing i18n).

---

## 9. Legal Framework (bake into HASH_ADVISORY template)

- IT Rules 2021 Rule 3(2)(b): 24-hour removal on complaint — extended here to a
  proactive-blocking request framed under intermediary due diligence (Rule 3(1)(b)).
- IT Act S.66E, S.67, S.67A; S.67B + POCSO for minors (law-enforcement routing only).
- BNS 2023 S.77 (voyeurism), S.78 (stalking); SC/ST Act where caste-targeted.
- DPDP Act 2023 self-compliance: hash-only architecture is purpose-limited and minimal
  by construction.
- All templates legally reviewed and versioned before `ENABLE_HASH_UPLOAD` flips on.

---

## 10. Rollout Gates (Phase 2 cannot go live until all pass)

1. PDQ TS implementation validated (≤2 hamming) against Meta reference vectors.
   **STATUS: PASSED 2026-06-12** — hamming distance 1/256 on all 8 images of the
   ThreatExchange dih regression corpus, quality scores exact
   (`tests/unit/pdq-reference-vectors.test.ts`, runs in CI).
2. `HASH_ADVISORY` template legally reviewed (`reviewedByLegal=true`).
3. Platform directory: compliance contacts human-verified for every dispatch target
   (social media + porn-site abuse desks), with bounce monitoring live.
4. Admin review queue + MFA enforcement tested end-to-end.
5. Security review of the new API surface (media-rejection guard, rate limits, IDOR).
6. Performance: ≤3s/image hashing on representative low-end Android.
7. Then and only then: `ENABLE_HASH_UPLOAD=true` in production.

---

## 11. Phased Roadmap (revised)

- **Phase 1 (done):** URL takedown orchestration, accounts, admin, escalation, audit.
- **Phase 2 (now):** client-side PDQ hashing, hash submission API + review queue,
  encrypted hash advisory dispatch via verified contact directory.
- **Phase 2.1:** PGP-encrypted annexes for platforms that publish keys; WASM PDQ swap-in;
  hash dedup warnings across cases.
- **Phase 3:** remaining languages, voice guidance, disguised-PWA mode, opt-in WhatsApp
  status updates.
- **Phase 4:** video hashing (TMK+PQF), deepfake-specific flow, re-upload monitoring
  guidance. Partnerships (StopNCII/NCMEC/NGOs) revisited only if/when the org context
  supports vetting — nothing in the architecture depends on them.

---

## 12. Key Risks

1. **No partner matching network** means platforms must act on our hashes voluntarily.
   Mitigation: legally grounded notices, verified compliance contacts, deliverability
   investment, response-rate tracking per platform (already built) to focus effort.
2. **Hash abuse without StopNCII's moderation layer.** Mitigation: §7 admin gate,
   declarations, rate limits, account reputation.
3. **PDQ port correctness.** Mitigation: reference-vector gate (§10.1), `clientVersion`
   recorded on every submission for retroactive audits.
4. **Stale compliance contacts.** Mitigation: existing `lastContactVerifiedAt` +
   quarterly re-verification + bounce auto-flagging.
5. **Telegram and rogue porn sites ignore advisories.** Be honest in the UI about
   expected outcomes per platform; route toward cybercrime.gov.in / 1930 drafts.
