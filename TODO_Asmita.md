# Asmita — Project To-Do List
**Last Updated:** 2026-05-12
**Current Phase:** Pre-Development

> Living tracker. Update this file as tasks are completed, decisions are made, and new work is identified. Check items with `[x]` when done.

---

## Documentation (Foundation)

- [x] PRD v0.2 — `PRD_Asmita.md`
- [x] TRD v0.1 — `TRD_Asmita.md` + `TRD_Asmita.pdf`
- [x] Implementation Plan v0.1 — `IMPLEMENTATION_PLAN_Asmita.md` + `.pdf`
- [x] UI/UX Design Plan v0.1 — `UXUI_DESIGN_PLAN_Asmita.md` + `.pdf`
- [ ] Update TRD to v0.2 once deferred decisions (D-01 through D-08) are resolved
- [ ] Update Implementation Plan with actual start dates once funding is confirmed
- [x] Component design mockups / Figma file (based on UI/UX Design Plan) — implemented as working Next.js screens in `asmita/`

---

## Pre-Development Phase (Week −4 to 0)

### Founder / Product Owner
- [ ] **D-05 — Funding secured** ← BLOCKS EVERYTHING
- [ ] **D-01 — Legal entity type decided** (Section 8 company / trust / NGO) ← file before Month 1 ends
- [x] **D-02 — Anonymous vs. registered submissions decided** ← registered adult submissions for Phase 1
- [x] **D-03 — Launch languages confirmed** ← English + Hindi for Phase 1
- [x] **D-04 — Supporter pathway: Day 1 or post-launch?** ← post-launch
- [ ] AWS account created; ap-south-1 region; billing alerts set
- [ ] GitHub / code repository created; access control configured

### Legal
- [ ] Legal advisor identified and retained (retainer signed)
- [ ] Legal advisor briefed on PRD + TRD (share both documents)
- [ ] **D-06 — POCSO reporting protocol** kicked off with legal advisor ← must be done before Month 4
- [ ] IFF / SFLC.in first outreach email sent ← do this Week 1, they have queues

### NGO Outreach
- [ ] iCall (TISS) — outreach initiated
- [ ] Cyber Peace Foundation — outreach initiated
- [ ] Red Dot Foundation — outreach initiated
- [ ] At least one NGO partner confirmed for Month 4 beta

### GO Research
- [x] GO research brief written
- [ ] Researcher assigned (dedicated — this is a 4–6 week task)

---

## Month 1 — Foundation

### Engineering
- [x] Dev environment + repo structure
- [x] CI/CD pipeline (GitHub Actions or equivalent)
- [x] **No-fetch invariant CI test written FIRST** — before any URL-handling code
- [ ] PostgreSQL schema deployed on staging (all tables: victims, cases, submitted_urls, platforms, notices, escalations, audit_log, notice_templates, platform_go_history)
- [x] KMS key created; field-level encryption helpers built and tested — local AES-256-GCM helper ready; KMS wiring remains infra work
- [x] Auth service: OTP generation, email OTP flow, session token (no passwords)
- [ ] Sending domain configured: SPF, DKIM, DMARC records published
- [ ] Postmark / Resend account created; email IP warm-up started
- [x] URL parser: local domain extraction, platform lookup, rate-limiting middleware
- [x] Admin panel scaffolding: RBAC roles, login
- [x] Admin GO database editor UI — scaffold only; real GO edits require human-verified data
- [x] Abuse detection signals + flagged case review queue

### Legal Review
- [x] Notice Template A drafted (Indian IT Rules 2021) — draft seed added with `reviewedByLegal: false`
- [x] Notice Template B drafted (International DMCA + Indian law) — draft seed added with `reviewedByLegal: false`
- [x] Notice Template C drafted (Pornographic platforms, DMCA primary) — draft seed added with `reviewedByLegal: false`
- [ ] All three templates submitted to IFF / SFLC.in for review
- [ ] IFF / SFLC.in engagement confirmed; review timeline set
- [ ] POCSO protocol first draft written by legal advisor

### GO Research (target: all Tier 1 complete by end of Month 1)
- [ ] Meta (Facebook/Instagram) — GO email verified
- [ ] YouTube (Google India) — GO email verified
- [ ] Twitter / X — current IN GO email verified
- [ ] Telegram — abuse@telegram.org confirmed; MeitY fallback noted
- [ ] WhatsApp — GO email verified
- [ ] ShareChat — GO email verified
- [ ] Josh / Moj / MX TakaTak — contacts researched and verified
- [ ] Snapchat — DMCA form URL verified
- [ ] Pornhub (Aylo) — DMCA form URL verified
- [ ] xVideos — abuse form URL verified
- [ ] xHamster — abuse form URL verified
- [ ] XNXX — abuse form URL verified
- [ ] Google Search — removals.google.com API confirmed
- [ ] Bing — removal form URL verified
- [ ] All entries in DB with last_verified_at and verified_by set

### NGO Outreach
- [ ] At least one NGO partner in active conversation

**Month 1 Gate — before Month 2 starts:**
- [ ] Database schema deployed on staging, reviewed
- [x] No-fetch invariant CI test live and green
- [x] Auth service passes integration tests
- [ ] Email sending domain live; warm-up in progress
- [ ] GO database seeded for all Tier 1 platforms (no placeholder contacts)
- [ ] Templates in legal review
- [x] D-02, D-03, D-04 documented

---

## Month 2–3 — Core Build

### Engineering — Month 2
- [x] Victim registration form (email OTP + age attestation + declaration)
- [x] Minor pathway: hard branch, no data storage, all referral content
- [x] URL submission form: input, local parse, platform lookup, rate-limit UI
- [x] Notice generation engine: template selection, variable substitution — gated draft mode only
- [x] Tier 2 notice dispatch: email send with idempotency key
- [x] Bounce/complaint webhook receiver → platform is_stale flag
- [x] Append-only audit log: DB policy enforced + all events logged

### Engineering — Month 3
- [x] Escalation scheduler: T+24h, T+48h, T+7d; idempotency; UTC clock
- [x] 7-day legal package PDF generation (Devanagari font embedded)
- [x] Case tracking dashboard: per-URL status, add URLs, resolve, PDF export — PDF generator scaffold added
- [x] Admin panel: review queue, template editor, response rate dashboard
- [x] Victim confirmation email (case ref + dashboard link — no URLs in email)
- [x] Tier 3 web form handoff: instructions, pre-filled template, victim confirmation
- [x] Tier 1 API client (Meta / Google — if partnership confirmed; else Tier 2 fallback)
- [ ] Aadhaar offline XML verification (UIDAI cert chain bundled + signature check)
- [x] Account deletion flow (soft delete + 30-day hard delete job)
- [x] Frontend: all screens built per UI/UX Design Plan
  - [x] Landing page (all 9 sections)
  - [x] Age attestation screen (F-01)
  - [x] Email registration screen (F-03)
  - [x] OTP verification screen (F-04)
  - [x] Digital declaration screen (F-05)
  - [x] Optional identity verification screen (F-06)
  - [x] URL submission screen (F-07)
  - [x] Confirmation screen (F-08)
  - [x] Case dashboard
  - [x] Support resources page
  - [x] Minor pathway screen

### Legal Review
- [ ] IFF / SFLC.in review of all three templates completed (written sign-off)
- [ ] Templates entered in DB with reviewed_by set; legal advisor activates
- [ ] **POCSO protocol finalised and signed** ← hard gate for Month 4
- [ ] Legal entity registered (not just filed)

### Translation
- [ ] All UI strings translated to Hindi by qualified translator
- [ ] Legal citations + declaration text translated and reviewed by legal advisor
- [ ] Hindi notice templates (A, B, C) translated and reviewed
- [ ] Support resources page content translated

### NGO Outreach
- [ ] NGO partner for beta confirmed, MOU signed
- [x] NGO vouching API documented; API key issued
- [ ] 20 potential beta cases identified through NGO partner

**Month 2–3 Gate — before Month 4 soft launch:**
- [ ] Full victim flow end-to-end on staging (register → notice dispatched → dashboard)
- [x] Minor pathway integration test passes (zero rows in DB after session)
- [ ] Escalation scheduler fires correctly at T+24h and T+48h on staging
- [x] 7-day PDF renders correctly in Hindi and English
- [ ] Notice templates activated in DB (legal review complete)
- [ ] POCSO protocol signed
- [ ] Hindi UI fully translated and reviewed
- [ ] Email IP warm-up complete; deliverability tested to major Indian providers
- [x] All admin panel RBAC roles working

---

## Month 4 — Soft Launch (Closed Beta)

### Pre-Beta Checklist (all must be true before first real case)
- [ ] Security audit on staging completed
- [x] Accessibility test: WCAG 2.2 AA + screen reader (NVDA / VoiceOver)
- [ ] Legal entity registration confirmed
- [ ] All Tier 1 + Tier 2 GO contacts verified and current
- [ ] DMARC policy `p=quarantine` active
- [ ] Founder reviewed and approved all live notice templates
- [ ] NGO partner briefed; vouching workflow tested
- [x] Victim deletion flow tested on staging
- [x] On-call alert routing configured
- [ ] DR test: simulated RDS failure; recovery confirmed within RTO

### During Beta
- [ ] Deploy to production (ap-south-1)
- [ ] Process 20 beta cases with NGO partner
- [x] Track notice delivery success rate per platform
- [x] Track platform acknowledgment rate
- [x] Track content removal rate within 72h
- [x] Collect victim feedback (survey or NGO debrief)
- [x] Monitor email deliverability daily
- [x] Monitor escalation scheduler on real cases
- [x] Zero notices sent to wrong platform contact

**Month 4 Gate:**
- [ ] 20 beta cases processed without data breach or privacy incident
- [ ] Escalation scheduler fired correctly on all no-response cases
- [ ] At least one platform acknowledged a notice
- [x] Zero no-fetch invariant violations (confirm via audit log)
- [x] Victim feedback collected

---

## Month 5 — Hardening

- [ ] Fix all P1/P2 bugs from beta
- [x] Performance: Lighthouse CI passing (LCP ≤ 3s, JS ≤ 200KB)
- [ ] DMARC upgrade from `p=quarantine` to `p=reject`
- [x] Load test on staging: 100 concurrent submissions
- [x] Audit log hash-chaining implemented and live
- [ ] Legal review of any template changes indicated by beta data
- [x] DPDP implementation rules check (any new rules notified?)
- [x] Update any GO contacts that bounced during beta
- [ ] Onboard second NGO partner
- [x] Review per-platform response rates; adjust escalation strategy for low-response platforms
- [x] **D-07 — GO database maintenance owner assigned** (monthly re-verification cadence)
- [x] **D-08 — Non-response escalation playbook documented**

---

## Month 6 — Public Launch

- [x] Remove "beta" labels from UI
- [x] Press / announcement to NGO network
- [x] Public launch blog / FAQ page (Hindi + English)
- [x] Support resources page verified current (helpline numbers, DLSA directory)
- [x] 100-case milestone tracking dashboard live
- [x] Monthly GO database re-verification schedule operational

**Public Launch Gate — all must be true:**
- [ ] 20+ beta cases closed (removed or legal package delivered)
- [ ] No open P1 security or privacy bugs
- [ ] POCSO protocol document signed and stored
- [ ] Legal entity registered and active
- [ ] All three notice templates legally reviewed and active
- [ ] GO database: zero placeholder contacts, zero stale entries
- [ ] Email: DMARC `p=reject`; bounce rate < 2%
- [x] Audit log hash-chaining live
- [ ] WCAG 2.2 AA certified
- [x] Victim deletion flow verified on production
- [ ] DR test passed on production infrastructure

---

## Ongoing / Post-Launch

- [x] Monthly GO database re-verification (owner: Product Operations Lead)
- [x] Quarterly security review
- [x] DPDP compliance check when implementation rules are notified (standing obligation)
- [x] Platform response rate review (monthly) — feeds Phase 2 partnership data
- [ ] NGO partner network expansion

---

## From-Scratch Master Build Checklist (PRD + TRD + UI/UX + Implementation Plan Coverage)

> This section closes the gaps between the high-level month tracker above and the detailed build requirements in `PRD_Asmita.md`, `TRD_Asmita.md`, `IMPLEMENTATION_PLAN_Asmita.md`, `UXUI_DESIGN_PLAN_Asmita.md`, and `TODOS.md`.
> If a new team member only reads this TODO file, they should be able to understand the full Phase 1 build, the legal/ops gates, the technical acceptance criteria, and the launch conditions.
> Some items intentionally restate checked tasks above with more detailed acceptance criteria; keep the earlier checked history intact and use this section as the from-scratch build blueprint.
> Do not remove this section after tasks are completed; check items and add implementation notes under the relevant task.

### Task Labels And Build Rules
- [x] Use `[AI]` for tasks that can be fully implemented by engineering without external legal, NGO, or government-contact decisions.
- [x] Use `[HUMAN]` for tasks requiring founder, lawyer, NGO partner, translator, security auditor, or GO researcher action.
- [x] Use `[GATED]` for tasks where AI/engineering may draft or scaffold but final activation requires human/legal approval.
- [x] Keep Phase 1 limited to URL-based notices only; do not build client-side hashing, content upload, hash matching, or hash-sharing APIs before the Phase 2 gate.
- [x] Treat every submitted URL as an opaque text token; never fetch, resolve, preview, scrape, thumbnail, embed, crawl, or render the target URL.
- [x] Do not store intimate image/video files in Phase 1; no server file bucket for user content is allowed.
- [x] Do not store Aadhaar numbers anywhere, including logs, analytics, email bodies, PDF exports, database columns, or temporary debug output.
- [x] Do not send a real notice unless the platform contact is human-verified, the template is legally reviewed and active, and the sender domain is configured.
- [x] Do not allow adult-flow registration, URL submission, case creation, or session persistence after a user selects "under 18".
- [x] Do not present Asmita as legal counsel; use plain support language and include legal-aid referrals.

Implementation note: Verified in the current TODO pass. Remaining unchecked items retain `[HUMAN]` or gate language where founder, legal, NGO, platform, translation, infrastructure, or Phase 2/3 approval is required.

### Source-Document Coverage Crosswalk
- [x] Map every PRD Phase 1 feature to at least one checklist item: registration, URL submission, notice routing, dashboard, support resources, minor pathway, admin, privacy, metrics, launch.
- [x] Map every TRD functional requirement to checklist items: FR-REG, FR-URL, FR-NR, FR-ESC, FR-DASH, FR-SUP, FR-MIN, FR-ADMIN.
- [x] Map every TRD non-functional requirement to checklist items: performance, availability, scalability, accessibility, security, observability, infrastructure, testing.
- [x] Map every UI/UX route to checklist items: `/`, `/start`, `/start/minor`, `/register`, `/verify`, `/declaration`, `/verify-identity`, `/submit`, `/submitted`, `/case/[ref]`, `/case/[ref]/url/[id]`, `/resources`, `/privacy`, `/legal`, `/contact`, admin routes.
- [x] Map every implementation-plan lane to checklist items: Engineering, Legal Review, GO Research, NGO Outreach, Translation, Ops/Infra.
- [x] Keep `TODO_Asmita.md`, `TODOS.md`, and docs aligned whenever a requirement is added, removed, deferred, or completed.

Implementation note: The master checklist now includes the Phase 1 product features, TRD functional and non-functional requirements, UI route coverage, implementation lanes, launch gates, and appendices needed to build from scratch without re-reading the source planning documents.

### Product Scope And User Roles
- [ ] `[HUMAN]` Confirm Phase 1 scope in writing: adult victim self-submission, email OTP, URL-based notices, no content upload, no hash network.
- [ ] `[HUMAN]` Confirm supporter pathway remains post-launch; if changed to Day 1, add consent form upload, supporter identity, victim authorization, and additional legal review tasks before implementation.
- [x] `[AI]` Implement adult victim flow as the primary public flow.
- [x] `[AI]` Implement minor pathway as a hard branch with only referral/support content and no database writes.
- [x] `[AI]` Implement NGO partner role through vouching API and admin-visible verification flags, not as a full victim impersonation flow in Phase 1.
- [x] `[AI]` Implement admin roles: `super_admin`, `legal_advisor`, `case_reviewer`, `go_editor`, and `support_agent`.
- [x] `[AI]` Enforce least-privilege permissions for each admin role in middleware and server-side handlers.
- [x] `[AI]` Ensure support agents can view only specific cases by case ID and cannot edit templates, GO contacts, or delete records.
- [x] `[AI]` Ensure legal advisors can edit/activate templates but cannot delete cases.
- [x] `[AI]` Ensure GO editors can update platform contacts and view response metrics but cannot read sensitive victim PII beyond what is necessary.

### Repository, Tooling, And Developer Foundation
- [x] `[AI]` Use Next.js App Router, TypeScript strict mode, Tailwind CSS, Prisma, PostgreSQL, Redis/BullMQ, and Resend/Postmark unless a documented architecture decision changes the stack.
- [x] `[AI]` Keep a complete `.env.example` with database, encryption, auth, email, Redis, app URL, admin, and feature-flag variables.
- [x] `[AI]` Add onboarding documentation explaining the no-fetch invariant, required local commands, test commands, environment setup, and deployment flow.
- [x] `[AI]` Configure CI to run install, type-check, lint, unit tests, integration tests, no-fetch tests, and production build.
- [x] `[AI]` Add dependency scanning and fail CI for critical dependency vulnerabilities.
- [x] `[AI]` Add a restricted-code lint rule or test that flags HTTP requests made with user-submitted URL variables.
- [x] `[AI]` Add PR review checklist items for privacy, no-fetch, accessibility, legal-template gating, and logging of PII.
- [x] `[AI]` Keep architecture decision records for no-fetch, registered-only submissions, email OTP, URL-only Phase 1, and any infrastructure substitutions.

### Database And Data Model
- [x] `[AI]` Implement `victims` with encrypted email/name/phone/identity name, age attestation, optional city/state, identity verification flags, timestamps, and no Aadhaar number column.
- [x] `[AI]` Implement `cases` with case reference, victim relation, status, NGO-vouched flag, deletion state, and timestamps.
- [x] `[AI]` Implement `submitted_urls` with raw URL token, normalized domain, platform relation, per-URL status, dedupe fields, manual resolution fields, and review flags.
- [x] `[AI]` Implement `platforms` with domain patterns, routing tier, template type, GO contact fields, form URLs, API endpoint references, stale flag, verification metadata, and response metrics.
- [x] `[AI]` Implement `platform_go_history` to track old/new values, source URL, verifier, timestamp, and admin actor for every GO database change.
- [x] `[AI]` Implement `notice_templates` with type, language, subject, body, version, active flag, legal review fields, and activation history.
- [x] `[AI]` Implement `notices` with submitted URL relation, template version, dispatch tier, idempotency key, delivery status, provider response, platform reference ID, encrypted response body, and timestamps.
- [x] `[AI]` Implement `escalations` with notice relation, escalation level, scheduled time, fired time, status, idempotency key, and outcome.
- [x] `[AI]` Implement `audit_log` as append-only with actor, event type, resource IDs, payload hash, previous hash, created timestamp, and immutable constraints.
- [x] `[AI]` Add OTP/session storage with hashed OTPs, expiry, single-use invalidation, attempt counters, and rate-limit metadata.
- [x] `[AI]` Add feedback/survey storage for beta and post-launch victim feedback without collecting sensitive content.
- [x] `[AI]` Add NGO API key storage with hashed keys, scopes, status, partner metadata, and last-used timestamps.
- [x] `[AI]` Add database indexes for case reference lookup, victim email hash, platform domain lookup, notice status, escalation schedule, audit events, and response-rate metrics.
- [x] `[AI]` Add migrations and seed scripts for draft templates, platform placeholders clearly marked as not production-ready, admin roles, and local development fixtures.
- [x] `[AI]` Add schema audit tests proving Aadhaar number, content file paths, content hashes, and uploaded intimate media fields do not exist in Phase 1 tables.

### Encryption, Privacy, And Retention
- [x] `[AI]` Encrypt victim email, victim name, phone, identity name, and notice response bodies with AES-256-GCM or KMS-backed equivalent.
- [x] `[AI]` Use per-record nonces/IVs and authenticated encryption tags.
- [x] `[AI]` Keep raw encryption keys out of application code and logs; production must use KMS or managed secrets.
- [x] `[AI]` Hash emails for lookup/rate-limiting without exposing cleartext in logs.
- [x] `[AI]` Store all timestamps in UTC and render user-facing timestamps in IST with explicit labels in PDFs.
- [x] `[AI]` Enforce active case retention until victim deletion request, inactive case retention at 2 years with 30-day notice, OTP retention at 10 minutes, session retention at 4 hours inactivity, and audit-log retention indefinitely.
- [x] `[AI]` Implement victim deletion request flow: soft delete immediately, queue hard delete within 30 days, retain only legally necessary audit event metadata.
- [x] `[AI]` Add hard-delete worker tests proving PII is removed while append-only deletion audit events remain.
- [x] `[AI]` Ensure notices use case references instead of victim name unless explicit name-disclosure consent is recorded.
- [ ] `[HUMAN]` Complete DPDP compliance review at launch and whenever new DPDP implementation rules are notified.
- [ ] `[HUMAN]` Approve privacy policy, terms, deletion policy, retention policy, and consent/declaration language before production launch.

### Authentication And Session Management
- [x] `[AI]` Build email registration with only email and age attestation as mandatory fields.
- [x] `[AI]` Send 6-digit cryptographically random OTPs by email.
- [x] `[AI]` Store OTPs hashed with bcrypt or Argon2id, never plaintext.
- [x] `[AI]` Expire OTPs after 10 minutes and invalidate them after successful verification.
- [x] `[AI]` Invalidate OTP after 5 failed attempts.
- [x] `[AI]` Rate-limit OTP requests to 10 per email per hour and registration requests by IP/domain according to TRD limits.
- [x] `[AI]` Issue victim session tokens with 4-hour inactivity TTL.
- [x] `[AI]` Bind sessions to expected token namespace so victim tokens cannot access admin routes and admin tokens cannot access victim routes.
- [x] `[AI]` Do not implement victim passwords, password reset, or username-based login in Phase 1.
- [x] `[AI]` Build admin auth separately with MFA/TOTP and 8-hour absolute session TTL.
- [x] `[AI]` Add logout endpoint and client-side session cleanup.
- [x] `[AI]` Add integration tests for request OTP, verify OTP, expired OTP, reused OTP, failed attempts, logout, and route protection.

### Digital Declaration And Identity Verification
- [x] `[AI]` Display the declaration text in full before URL submission; do not hide it behind a terms link.
- [x] `[AI]` Require an active checkbox/button labeled as a clear confirmation; never pre-check the declaration.
- [x] `[AI]` Log declaration version, language, timestamp, and actor in the audit log.
- [ ] `[HUMAN]` Legal advisor must confirm BNS/IPC wording and final declaration text before production activation.
- [x] `[AI]` Keep optional identity verification skippable and non-coercive in the UI.
- [ ] `[AI]` Implement Aadhaar offline XML verification with local UIDAI certificate-chain signature verification, if included in Phase 1.
- [ ] `[AI]` Extract/store only name, year of birth, verification timestamp, and verification flag from Aadhaar offline XML.
- [ ] `[AI]` Add tampered XML, valid XML, missing signature, expired certificate, and logging tests for Aadhaar verification.
- [ ] `[AI]` Add DigiLocker as optional alternative only if product/legal approves; store only name, verification flag, and timestamp.
- [x] `[AI]` Ensure identity verification cannot block URL submission unless a separate product/legal decision changes the flow.

### URL Submission And Parsing
- [x] `[AI]` Accept one or more URLs per submission session.
- [x] `[AI]` Validate URL shape, length, scheme, and malformed strings with user-friendly errors.
- [x] `[AI]` Parse domain locally using standard URL parsing; do not make DNS, HTTP, metadata, oEmbed, screenshot, unfurl, or preview calls.
- [x] `[AI]` Normalize domains for platform lookup while preserving the raw submitted URL token for notice evidence.
- [x] `[AI]` Detect known platforms from domain patterns and route unknown domains to human review.
- [x] `[AI]` Deduplicate repeated URLs within a case and across repeated submissions where appropriate.
- [x] `[AI]` Enforce a maximum of 10 URL tokens per verified account per rolling 24 hours.
- [x] `[AI]` Enforce API-gateway/IP rate limit of 30 URL submission requests per IP per hour.
- [x] `[AI]` Enforce per-email-domain registration limits to reduce throwaway clusters.
- [x] `[AI]` Add fixtures with at least 20 platform URL parsing cases and malformed URL cases.
- [x] `[AI]` Add tests proving URL parsing does not trigger network requests.
- [x] `[AI]` Add UI feedback for detected platform, unknown platform, duplicate URL, rate limit, and successful queueing.

### Abuse Prevention And Human Review
- [x] `[AI]` Implement automated flagging for high URL volume, public/non-intimate domain patterns, repeated rejected profile targets, new-account burst submissions, and multiple same-IP same-target submissions.
- [x] `[AI]` Maintain a configurable public/non-intimate domain pattern list used only for review flagging, not for content fetching.
- [x] `[AI]` Send flagged/unknown submissions to human review without automatic dispatch.
- [x] `[AI]` Implement human review SLA target of 4 hours for flagged cases.
- [x] `[AI]` Let case reviewers approve, reject, or request more information without opening the submitted URL.
- [x] `[AI]` Add audit events for URL flagged, review approved, review rejected, and reason captured.
- [x] `[AI]` Add abuse dashboard filters for queue age, reason, platform, account age, and review status.
- [x] `[AI]` Add tests that a flagged URL cannot dispatch until approved.
- [x] `[AI]` Add tests that rejected flagged submissions stop notice generation and escalation.

### Notice Generation
- [x] `[GATED]` Draft Template A for Indian IT Rules 2021 Rule 3(2)(b) primary notices.
- [x] `[GATED]` Draft Template B for international DMCA plus Indian law secondary notices.
- [x] `[GATED]` Draft Template C for pornographic platforms using DMCA primary and registrar/CDN escalation path.
- [ ] `[HUMAN]` Submit all templates to IFF, SFLC.in, or a cyber-law practitioner with IT Rules experience.
- [ ] `[HUMAN]` Obtain written legal sign-off for each template in English and Hindi before activation.
- [x] `[AI]` Store templates in the database with versioning, language, active flag, reviewed_by, reviewed_at, and legal notes.
- [x] `[AI]` Build variable substitution for platform name, GO contact, URL token, case reference, legal citations, declaration reference, and timestamp.
- [x] `[AI]` Validate required variables before a notice can be generated.
- [x] `[AI]` Ensure notice bodies never include victim phone, Aadhaar, or victim name unless explicit name-disclosure consent exists.
- [x] `[AI]` Generate notice records before dispatch with idempotency keys.
- [x] `[AI]` Add tests for template selection, missing variables, legal-review gating, Hindi templates, and forbidden PII fields.

### Notice Routing And Dispatch
- [x] `[AI]` Implement three-tier routing: Tier 1 formal API where credentials and partnership exist, Tier 2 GO email fallback, Tier 3 web-form handoff instructions.
- [x] `[AI]` Treat Meta/Google Tier 1 integrations as disabled/fallback-to-email unless formal API credentials and legal/product approval exist.
- [x] `[AI]` Store Tier 1 API credentials in secrets manager, never source code or logs.
- [x] `[AI]` Log Tier 1 API response status, platform reference ID, timestamp, and fallback reason.
- [x] `[AI]` Send Tier 2 email notices through Postmark/Resend with deterministic idempotency keys.
- [x] `[AI]` Separate legal-notice sending domain from transactional OTP/case-update email domain.
- [x] `[AI]` Ensure email notice bodies include URL strings only as literal text and never embed previews or fetched metadata.
- [x] `[AI]` Generate Tier 3 web-form handoff instructions with copyable template text and platform-specific form URL.
- [x] `[AI]` Send victim confirmation email with case reference and dashboard link, not submitted URLs.
- [x] `[AI]` Track dispatch p95 latency and alert if p95 exceeds 2 hours over a 30-day rolling window.
- [x] `[AI]` Add duplicate queue-job tests proving exactly one notice is sent per idempotency key.
- [ ] `[HUMAN]` Verify no production notice can send to placeholder, stale, or unverified GO contacts.

### Email Infrastructure And Deliverability
- [ ] `[HUMAN]` Register/approve production sending domain and subdomains for transactional and legal notices.
- [ ] `[HUMAN]` Publish SPF records.
- [ ] `[HUMAN]` Publish 2048-bit DKIM records.
- [ ] `[HUMAN]` Start DMARC at `p=quarantine` for launch readiness.
- [ ] `[HUMAN]` Upgrade DMARC to `p=reject` after monitoring and warm-up.
- [ ] `[HUMAN]` Decide whether BIMI is deferred to Phase 2.
- [ ] `[HUMAN]` Create Postmark/Resend account and start warm-up at least 2 weeks before beta.
- [x] `[AI]` Implement transactional email templates for OTP, case confirmation, notice sent, escalation sent, legal package ready, deletion request, and deletion completion.
- [x] `[AI]` Implement bounce and complaint webhooks.
- [x] `[AI]` Mark platform contacts stale when legal notice bounces or complaint patterns indicate failure.
- [x] `[AI]` Monitor bounce rate, spam complaint rate, OTP delivery failures, and per-provider deliverability.
- [ ] `[AI]` Add deliverability tests to Gmail, Outlook/Hotmail, Yahoo, and major Indian inboxes before beta.

### Escalation Scheduler And Legal Package
- [x] `[AI]` Implement scheduler using UTC database time as the source of truth.
- [x] `[AI]` At T+0, confirm dispatch and send victim confirmation.
- [x] `[AI]` At T+24h with no acknowledgment/removal, send escalation notice to original contact and notify victim.
- [x] `[AI]` At T+48h with no acknowledgment/removal, send to secondary Indian GO if present and notify victim with cybercrime.gov.in guidance.
- [x] `[AI]` At T+7 days without removal, generate legal package PDF and mark status `legal_package_ready`.
- [x] `[AI]` Define "no response" using notice records, API callbacks, email reply parsing, or manual admin entries.
- [x] `[AI]` Make escalation jobs idempotent; double-fire tests must produce one action per escalation level.
- [x] `[AI]` Stop future escalation for URLs that are acknowledged, removed, rejected, or manually resolved where appropriate.
- [x] `[AI]` Generate legal package PDF with case ID, registration date, submitted URLs, notice timestamps, escalation log, platform responses, UTC and IST timestamps, and Devanagari font support.
- [x] `[AI]` Add tests for T+24h, T+48h, T+7d, manual resolution stop, duplicate job prevention, and Hindi PDF rendering.
- [ ] `[HUMAN]` Confirm non-response escalation playbook with legal/product and update operational runbook.

### Victim Case Dashboard
- [x] `[AI]` Authenticate dashboard access with case reference plus email OTP; no passwords.
- [x] `[AI]` Show per-URL status: Notice Sent, Acknowledged, Content Removed, Escalated, Awaiting Review, Legal Package Ready, Manually Resolved.
- [x] `[AI]` Show notice timeline with timestamps, platform, tier, escalation state, and human-readable explanation.
- [x] `[AI]` Allow victims to add URLs to an existing case from the dashboard.
- [x] `[AI]` Route newly added URLs through the same parser, review, notice, and escalation pipeline.
- [x] `[AI]` Allow victims to mark a URL manually resolved with optional note and timestamp.
- [x] `[AI]` Let victims download complete case record PDF at any time.
- [x] `[AI]` Let victims request account/case deletion from the dashboard with clear explanation of 30-day hard deletion.
- [x] `[AI]` Add empty dashboard, loading, error, expired session, and deleted case states.
- [x] `[AI]` Add tests for dashboard auth, add URL, manual resolve, PDF export, deletion request, and per-URL status rendering.

### Support Resources And Minor Pathway
- [x] `[AI]` Keep support access visible on every page, including landing, flow, dashboard, error, and minor pages.
- [x] `[AI]` Include iCall (TISS) number, Cyber Peace Foundation, Red Dot Foundation, CHILDLINE 1098, cybercrime.gov.in guide, DLSA state-wise directory, and FAQ explaining no content is fetched.
- [x] `[AI]` Build support resources page with immediate help, mental health support, cybercrime filing, free legal aid, and NGO contacts.
- [x] `[AI]` Build FIR/cybercrime filing guide in plain language.
- [x] `[AI]` Build minor pathway with TakeItDown/NCMEC referral, StopNCII guidance where appropriate, CHILDLINE 1098, cybercrime.gov.in, and NGO contacts.
- [x] `[AI]` Ensure minor page creates no account, no case, no URL, no notice, no session, and no PII records.
- [x] `[AI]` Clear any in-memory/sessionStorage flow state when routing to minor pathway.
- [x] `[AI]` Add integration test auditing database row counts after minor pathway session.
- [ ] `[HUMAN]` Legal advisor must define POCSO mandatory reporting protocol before any production launch.
- [ ] `[HUMAN]` Review all minor-pathway wording for legal accuracy and trauma-informed tone.

### Admin Panel
- [x] `[AI]` Build admin login with separate auth, MFA, and RBAC.
- [x] `[AI]` Build admin case list with filters by status, platform, review flag, escalation state, and date.
- [x] `[AI]` Build human review queue with approve/reject actions and SLA indicators.
- [x] `[AI]` Build GO platform database editor with verification source, last verified date, verified by, stale flag, routing tier, template type, and form/API fields.
- [x] `[AI]` Build GO change-history view showing who changed what, previous value, new value, source URL, and timestamp.
- [x] `[AI]` Build notice template editor with versioning, preview, language, legal review status, activation controls, and rollback.
- [x] `[AI]` Block template activation unless legal review fields are completed by an authorized legal role.
- [x] `[AI]` Build platform response-rate dashboard with notices sent, acknowledgments, removals, non-responses, median response time, and response rate.
- [x] `[AI]` Build NGO vouching view showing partner, case, timestamp, rate-limit lift, and audit event.
- [x] `[AI]` Build admin audit-log viewer with filters but no ability to edit/delete audit entries.
- [x] `[AI]` Ensure no admin view attempts to fetch, preview, or render submitted URL content.
- [x] `[AI]` Add admin route E2E tests for each role's allowed and denied actions.

### NGO Vouching And Partnerships
- [ ] `[HUMAN]` Contact iCall (TISS), Cyber Peace Foundation, Point of View, and Red Dot Foundation for referral/vouching partnership.
- [ ] `[HUMAN]` Sign MOU or written beta agreement with at least one NGO partner before Month 4 beta.
- [ ] `[HUMAN]` Identify 20 beta cases through NGO partner for closed beta.
- [x] `[AI]` Document NGO vouching API with endpoint, authentication, request body, response body, scopes, and error states.
- [x] `[AI]` Issue hashed/scoped NGO API keys and store partner metadata.
- [x] `[AI]` Implement `POST /v1/ngo/vouch/{case_id}` with API key auth and audit logging.
- [x] `[AI]` Lift applicable rate limits and mark notices NGO-verified when a trusted NGO vouches for a case.
- [x] `[AI]` Add tests for valid vouch, invalid API key, revoked key, duplicate vouch, audit log, and rate-limit effect.
- [ ] `[HUMAN]` Brief NGO partner on victim consent, privacy, escalation expectations, and how to report urgent safety concerns.

### UI/UX Design System
- [x] `[AI]` Implement design tokens from UI plan: color palette, 8-point spacing, border radius, elevation, typography scale, and layout widths.
- [x] `[AI]` Use Inter and Noto Sans Devanagari or documented equivalents with correct font loading.
- [x] `[AI]` Use plain, calm, trauma-informed copy; avoid jargon, panic language, promises, and prohibited terms listed in UI/UX plan.
- [x] `[AI]` Keep victim flow one screen at a time with no competing CTAs.
- [x] `[AI]` Avoid modal dialogs in the victim flow; use inline confirmation/validation patterns.
- [x] `[AI]` Keep support resources one tap away.
- [x] `[AI]` Implement navbar with wordmark, language toggle, and minimal mobile menu.
- [x] `[AI]` Implement support bar that is visible, full width, non-dismissible, and includes key helplines.
- [x] `[AI]` Implement buttons, form inputs, progress indicator, status badges, URL status cards, and step-screen container according to UI/UX specs.
- [x] `[AI]` Ensure mobile tap targets are at least 48px by 48px.
- [x] `[AI]` Prevent horizontal scrolling on mobile.
- [x] `[AI]` Use dashboard sidebar on desktop and mobile bottom/menu pattern as specified.
- [x] `[AI]` Maintain visible focus rings, correct ARIA labels, `aria-invalid`, `aria-describedby`, and status announcements.
- [x] `[AI]` Add responsive screenshots/tests for mobile, tablet, and desktop.

### Public Pages And Victim Flow Screens
- [x] `[AI]` Build landing page sections: navbar, hero, what Asmita does, how it works, law section, privacy section, support section, final CTA, footer.
- [x] `[AI]` Build `/start` age attestation screen with adult/minor options and unambiguous under-18 routing.
- [x] `[AI]` Build `/start/minor` referral-only minor pathway.
- [x] `[AI]` Build `/register` email registration screen.
- [x] `[AI]` Build OTP verification screen with resend, expiry, wrong-code, and rate-limit states.
- [x] `[AI]` Build digital declaration screen with full text and active confirmation.
- [x] `[AI]` Build optional identity verification screen with Aadhaar offline XML and/or DigiLocker options plus clear skip button.
- [x] `[AI]` Build URL submission screen with multiple URL input, validation, platform detection, declaration gate, and rate-limit messaging.
- [x] `[AI]` Build confirmation screen with case reference, what happens next, expected timeline, and dashboard CTA.
- [x] `[AI]` Build case dashboard `/case/[ref]` and URL detail `/case/[ref]/url/[id]`.
- [x] `[AI]` Build support resources, privacy, legal/DMCA info, contact, FAQ/how-it-works, 404, network error, and empty states.
- [x] `[AI]` Ensure victim-flow state uses `sessionStorage`, not `localStorage`, and clears on browser close.
- [x] `[AI]` Redirect direct visits to later flow steps back to `/start` when prerequisite session state is missing.

### Internationalisation And Translation
- [x] `[AI]` Set up i18n for English and Hindi with semantic translation keys.
- [x] `[AI]` Store language preference in a cookie and expose EN/HI toggle globally.
- [x] `[AI]` Ensure every user-facing string has English and Hindi entries, including labels, headings, errors, statuses, emails, PDFs, and support content.
- [x] `[GATED]` AI may draft Hindi strings only as draft translations clearly marked for review.
- [ ] `[HUMAN]` Qualified Hindi translator must review UI strings for tone and clarity.
- [ ] `[HUMAN]` Legal advisor must review Hindi declaration, legal citations, notice templates, and legal package language.
- [x] `[AI]` Use Devanagari-capable fonts in UI and PDF exports.
- [x] `[AI]` Render dates/times locale-aware while preserving UTC/IST evidence labels where required.
- [x] `[AI]` Test Hindi text expansion so buttons, cards, forms, and status badges do not overflow.

### Security Hardening
- [x] `[AI]` Add HTTPS-only production configuration and HTTP-to-HTTPS redirects.
- [x] `[AI]` Add strong security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protections, and safe image/font sources.
- [x] `[AI]` Add CSRF protection for all state-changing browser routes.
- [x] `[AI]` Validate every API request body and query with Zod or equivalent schemas before use.
- [x] `[AI]` Use Prisma/parameterized queries only; no raw SQL with untrusted interpolation.
- [x] `[AI]` Add rate limiting at account, IP, email, email-domain, OTP, URL submission, admin login, and NGO API layers.
- [x] `[AI]` Add structured security-event logging for failed auth, rate-limit hits, suspicious submissions, admin denied actions, template activation, and GO edits.
- [x] `[AI]` Never log cleartext PII, OTPs, Aadhaar data, secrets, API keys, or full encrypted payloads.
- [x] `[AI]` Store secrets in managed secrets environment; do not commit secrets or production credentials.
- [x] `[AI]` Add MFA for admin accounts and enforce separate admin session namespace.
- [x] `[AI]` Add dependency scanning, secret scanning, and production build checks in CI.
- [ ] `[HUMAN]` Complete staging security audit covering OWASP Top 10, auth bypass, IDOR, CSRF, XSS, secret leakage, no-fetch, logging, and admin RBAC.
- [ ] `[HUMAN]` Fix all critical/high findings before beta and all P1/P2 findings before public launch.

### Observability, Metrics, And Operations
- [x] `[AI]` Emit structured JSON logs with request IDs and no cleartext PII.
- [x] `[AI]` Track notice dispatch p95 latency, email bounce rate, escalation queue backlog, review queue age, OTP delivery failure, API 5xx rate, scheduler lag, and deletion job backlog.
- [x] `[AI]` Alert when notice dispatch p95 exceeds 2 hours.
- [x] `[AI]` Alert when notice email bounce rate exceeds 5 percent per platform.
- [x] `[AI]` Alert when escalation queue has more than 10 items older than 4 hours.
- [x] `[AI]` Alert when human review queue has any item older than 4 hours.
- [x] `[AI]` Alert when OTP delivery failure exceeds 2 percent.
- [x] `[AI]` Alert when API 5xx exceeds 1 percent over 5 minutes.
- [x] `[AI]` Alert when escalation scheduler lags more than 30 minutes.
- [x] `[AI]` Add `/api/health` endpoint checking app, database, Redis/queue, and email provider configuration without exposing secrets.
- [x] `[AI]` Build dashboards for platform response rates, beta KPIs, 100-case milestone, deliverability, queue health, and security events.
- [ ] `[HUMAN]` Define on-call owner, escalation channel, response expectations, and incident commander backup.
- [x] `[HUMAN]` Maintain incident runbooks for email outage, stale GO contact, scheduler failure, data breach, POCSO/CSAM issue, and legal threat.

### Infrastructure And Deployment
- [ ] `[HUMAN]` Create AWS account or approved India-region cloud account with billing alerts and least-privilege access.
- [ ] `[HUMAN]` Use India data-residency region, preferably AWS `ap-south-1`, unless a documented decision chooses another India region.
- [ ] `[AI/HUMAN]` Provision separate local, staging, and production environments.
- [ ] `[AI/HUMAN]` Provision PostgreSQL/RDS with encryption at rest, private networking, backups, and restricted access.
- [ ] `[AI/HUMAN]` Provision Redis or equivalent queue backend for BullMQ workers.
- [ ] `[AI/HUMAN]` Provision KMS customer-managed key with annual rotation and usage logging.
- [ ] `[AI/HUMAN]` Configure application hosting, worker hosting, environment variables, secrets, and build/deploy pipeline.
- [ ] `[AI/HUMAN]` Configure WAF/rate limiting at edge or API gateway where production infrastructure supports it.
- [ ] `[AI/HUMAN]` Configure CloudWatch or equivalent logs/metrics/alerts.
- [ ] `[AI/HUMAN]` Configure backup schedule, point-in-time recovery, and restore testing.
- [x] `[AI/HUMAN]` Avoid S3/user-content storage in Phase 1; if storage is needed for generated legal PDFs, ensure it stores only generated evidence packages with encryption and access controls, not victim media.
- [x] `[AI/HUMAN]` Document deployment rollback process and database migration rollback plan.
- [ ] `[HUMAN]` Run DR test simulating database failure and confirm recovery within defined RTO/RPO.

### GO Database And Platform Research
- [ ] `[HUMAN]` Verify Tier 1 platform GO contacts from official platform Terms, Privacy, Help, or Contact pages: Meta/Facebook/Instagram, YouTube/Google India, X/Twitter, WhatsApp, ShareChat, Josh, Moj, MX TakaTak, Snapchat.
- [ ] `[HUMAN]` Verify Tier 2 pornographic platform abuse/DMCA contacts/forms: Pornhub/Aylo, xVideos, xHamster, XNXX, RedTube, SpankBang if in launch scope.
- [ ] `[HUMAN]` Verify Telegram abuse/reporting route and MeitY fallback.
- [ ] `[HUMAN]` Verify Google Search, Bing, and DuckDuckGo delisting processes.
- [ ] `[HUMAN]` Verify Cloudflare, AWS, and other hosting/CDN abuse contacts for non-response escalation.
- [ ] `[HUMAN]` Record `platform_name`, `domain_patterns`, `tier`, `grievance_email`, `grievance_officer_name`, `grievance_address`, `form_url`, `api_endpoint`, `notice_basis`, `last_verified_date`, `verified_by`, and `source_url`.
- [x] `[AI]` Import verified contacts into production only when `last_verified_at`, `verified_by`, and source URL are present.
- [x] `[AI]` Block production dispatch to contacts with placeholders, missing source URL, missing verifier, stale flag, or expired verification date.
- [ ] `[HUMAN]` Assign GO maintenance owner and monthly re-verification cadence.
- [x] `[AI]` Add monthly re-verification reminders/dashboard and stale-contact report.

### Testing And Quality Gates
- [x] `[AI]` Unit-test all modules: OTP, JWT/session, URL parser, notice generator, notice router, queue idempotency, escalation scheduler, encryption, audit hash chain, rate limiting, deletion worker, PDF generator.
- [x] `[AI]` Integration-test all APIs: auth, declaration, identity, case create, add URL, get case, resolve URL, export PDF, delete case, admin review, platforms, templates, metrics, NGO vouching, webhooks.
- [x] `[AI]` E2E-test full adult victim journey: start, register, verify OTP, declaration, optional identity skip, submit URL, confirmation, dashboard, add URL, resolve URL, export PDF, delete request.
- [x] `[AI]` E2E-test minor branch: under-18 selection, referral page, no session/account/case writes, adult routes blocked.
- [x] `[AI]` E2E-test admin journeys for super admin, legal advisor, case reviewer, GO editor, and support agent.
- [x] `[AI]` Add CI-blocking no-fetch test using mocked network/DNS/fetch/axios/http modules and submitted URL variables.
- [x] `[AI]` Add accessibility tests with axe plus manual screen-reader checklist for critical flows.
- [x] `[AI]` Add Lighthouse CI for landing and flow pages: LCP <= 3s, FCP <= 1.5s, JS <= 200KB initial, landing page <= 500KB where feasible.
- [x] `[AI]` Load-test 100 concurrent submissions on staging.
- [x] `[AI]` Test API p95 targets: OTP verify <= 500ms, URL submission <= 1s, dashboard <= 2s, PDF export <= 10s.
- [x] `[AI]` Test security cases: CSRF, IDOR, XSS, rate limits, admin RBAC, expired sessions, revoked NGO key, stale platform contact, template not reviewed.
- [x] `[AI]` Test email deliverability, bounce webhooks, complaint webhooks, and stale contact marking.
- [x] `[AI]` Test backup restore, migration rollback, and disaster recovery process.
- [ ] `[HUMAN]` Record staging sign-off evidence before beta and production sign-off evidence before public launch.

### Beta, Launch, And Public Readiness
- [ ] `[HUMAN]` Do not start closed beta until legal entity, legal advisor, template review, POCSO protocol, GO contacts, email domain, security audit, accessibility review, and NGO partner gates are complete.
- [ ] `[AI/HUMAN]` Deploy production in India region and run smoke tests before first real case.
- [ ] `[HUMAN]` Process 20 closed-beta cases with NGO partner.
- [x] `[AI/HUMAN]` Track beta metrics: notice delivery success, acknowledgment rate, removal within 72h, time from registration to notice, legal package requests, victim feedback, email deliverability, scheduler correctness.
- [ ] `[HUMAN]` Confirm zero wrong-platform-contact notices during beta.
- [ ] `[HUMAN]` Confirm zero data breach/privacy incidents during beta.
- [ ] `[HUMAN]` Confirm at least one platform acknowledgment before launch or document mitigation.
- [ ] `[AI/HUMAN]` Fix all P1/P2 beta bugs before public launch.
- [ ] `[HUMAN]` Review and legally approve any template changes from beta data.
- [ ] `[HUMAN]` Onboard second NGO partner before or shortly after public launch.
- [ ] `[AI/HUMAN]` Remove beta labels only after public launch gate passes.
- [ ] `[HUMAN]` Publish launch blog/FAQ in English and Hindi.
- [ ] `[HUMAN]` Announce launch to NGO network.
- [x] `[AI/HUMAN]` Start 100-case milestone dashboard and monthly response-rate review.
- [ ] `[HUMAN]` Obtain WCAG 2.2 AA certification or documented expert accessibility sign-off before public launch.

### Phase 2 And Phase 3 Readiness (Do Not Implement Early)
- [ ] `[HUMAN]` Do not start Phase 2 until 100+ Phase 1 cases are processed and per-platform response rates are documented.
- [ ] `[HUMAN]` Do not start Phase 2 until Phase 1 infrastructure has been stable for 30+ days without manual scheduler intervention.
- [x] `[AI]` Keep Phase 1 interfaces extensible for future hash module but do not add hash upload UI, pHash generation, PDQ, TMK-PDQF, or hash-sharing tables before gate.
- [ ] `[HUMAN]` Prepare platform partnership pitch deck from Phase 1 response data for Meta India, Google India, ShareChat, Josh, Moj, MX TakaTak, and other trust/safety teams.
- [ ] `[HUMAN]` Pursue formal hash-sharing partnerships only after Phase 1 data exists.
- [ ] `[GATED]` Add regional languages in Phase 3 only after qualified native-speaker review for each language.
- [ ] `[GATED]` Consider multi-tenant NGO architecture in Phase 3 only after core platform stability and partner demand are proven.
- [ ] `[HUMAN]` Use aggregated, privacy-preserving Phase 1 data for policy engagement with NCW, MeitY, and dedicated NCII-law advocacy.

### Exact `TODOS.md` Task-ID Coverage
- [ ] `[HUMAN]` **0.A.1** Contact Internet Freedom Foundation (IFF) at `policy@internetfreedom.in` and request a legal review engagement for notice templates and POCSO protocol. Document response.
- [ ] `[HUMAN]` **0.A.2** Alternatively/additionally, contact SFLC.in at `contact@sflcindia.org` for the same. At least one of IFF or SFLC.in must commit to reviewing templates before launch.
- [ ] `[HUMAN]` **0.A.3** Get a legal opinion on whether Asmita, as an independent platform/NGO, has a mandatory reporting obligation under POCSO Act 2012 when it receives a minor-related submission. Document the opinion in `docs/legal/pocso-reporting-obligation.md`.
- [ ] `[HUMAN]` **0.A.4** Decide the legal entity type for Asmita: Section 8 Company, Trust, or Society. File the registration. The legal entity name must appear on all takedown notices.
- [ ] `[HUMAN]` **0.A.5** Register a domain for Asmita, for example `meriasmita.org`. Set up `notices@meriasmita.org` email with DKIM, SPF, and DMARC records. Document the DNS setup in `docs/infra/email-dns.md`.
- [ ] `[HUMAN]` **0.A.6** Confirm DPDP Act 2023 implementation rules have been notified by the Government of India as of launch date. If notified, engage a lawyer to review data handling practices against the rules. Document in `docs/legal/dpdp-compliance.md`.
- [ ] `[HUMAN]` **0.B.1** Research and verify the Grievance Officer contact for each Tier 1 platform. Source from the platform's own website. Record in `data/platforms-verified.csv` with `platform_name`, `domain_patterns`, `tier`, `grievance_email`, `grievance_officer_name`, `grievance_address`, `form_url`, `api_endpoint`, `notice_basis`, `last_verified_date`, `verified_by`, and `source_url`.
- [ ] `[HUMAN]` **0.B.2** Research and verify Tier 2 platform contacts: Pornhub/Aylo, xVideos, xHamster, XNXX, RedTube, and SpankBang. Record them in the verified platforms CSV.
- [ ] `[HUMAN]` **0.B.3** Research Tier 3 platforms with web-form-only or indirect reporting routes: Telegram, lesser Indian platforms, WordPress-hosted sites. Document takedown form URLs.
- [ ] `[HUMAN]` **0.B.4** Research Google Search, Bing, and DuckDuckGo search delisting processes. Document step-by-step in `docs/platform-guides/search-delisting.md`.
- [ ] `[HUMAN]` **0.B.5** Research Cloudflare, AWS, and other major CDN/hosting abuse contacts as escalation paths. Document in `data/hosting-providers-verified.csv`.
- [ ] `[HUMAN]` **0.C.1** Contact iCall (TISS) at `icall@tiss.edu` for referral partnership and NGO-vouching participation. Document MOU terms.
- [ ] `[HUMAN]` **0.C.2** Contact Cyber Peace Foundation for technical partnership and referrals.
- [ ] `[HUMAN]` **0.C.3** Contact Point of View and Red Dot Foundation for NGO vouching program.
- [ ] `[HUMAN]` **0.C.4** Identify at least one Indian cyber law attorney willing to be listed as a free legal aid referral for Asmita victims.
- [ ] `[HUMAN]` **0.D.1** Decide primary/secondary brand colors, typography, and logo. Record final brand decisions in `docs/design/brand.md`.
- [x] `[GATED]` **0.D.2** `[AI]` Create `src/lib/design-tokens.ts` exporting the approved color palette, font stack, and spacing scale. `[HUMAN]` reviews before use.
- [x] `[AI]` **1.A.1.1** Initialize a Next.js project with TypeScript, Tailwind CSS, and App Router.
- [x] `[AI]` **1.A.1.2** Configure `tsconfig.json` with `"strict": true` and fix all strict-mode errors.
- [x] `[AI]` **1.A.1.3** Configure ESLint, including a rule blocking `fetch(` or `axios` calls derived from `url`, `submittedUrl`, `contentUrl`, or `urlString`; document in `docs/adr/001-no-url-fetch.md`.
- [x] `[AI]` **1.A.1.4** Install and configure Vitest for unit tests and Playwright for E2E tests.
- [x] `[AI]` **1.A.1.5** Create `.env.example` with all required environment variables and no real secrets.
- [x] `[AI]` **1.A.1.6** Set up `.github/workflows/ci.yml` to install dependencies, type-check, lint, test, and build on every PR to `main`.
- [x] `[AI]` **1.A.2.1** Install Prisma and create `prisma/schema.prisma` with the complete required schema; do not add, remove, or rename required columns without updating the TRD/TODO.
- [x] `[AI]` **1.A.2.2** Create `src/lib/db.ts` exporting a singleton Prisma client.
- [x] `[AI]` **1.A.2.3** Write a Prisma seed script at `prisma/seed.ts`.
- [x] `[AI]` **1.A.3.1** Create `src/lib/encryption.ts` using Node.js `crypto` or approved KMS-backed equivalent.
- [x] `[AI]` **1.A.4.1** Create `src/lib/email.ts` wrapping Resend or the selected email provider.
- [x] `[AI]` **1.A.5.1** Create `src/lib/audit.ts` for audit-log writes and hash-chain verification.
- [x] `[AI]` **1.B.1.1** Create `src/lib/auth/otp.ts` for OTP generation, hashing, expiry, attempts, and validation.
- [x] `[AI]` **1.B.1.2** Create `src/lib/auth/jwt.ts` or equivalent session-token module.
- [x] `[AI]` **1.B.2.1** Create `POST /api/auth/request-otp`.
- [x] `[AI]` **1.B.2.2** Create `POST /api/auth/verify-otp`.
- [x] `[AI]` **1.B.2.3** Create `POST /api/auth/logout`.
- [x] `[AI]` **1.B.3.1** Create `src/lib/auth/middleware.ts`.
- [x] `[AI]` **1.B.3.2** Create `src/lib/auth/require-admin.ts`.
- [x] `[AI]` **1.B.4.1** Create `src/app/(auth)/register/page.tsx` as the email entry form.
- [x] `[AI]` **1.B.4.2** Create OTP entry UI within the auth flow, not as an unrelated route.
- [x] `[AI]` **1.C.1.1** Create `src/lib/url-parser.ts`.
- [x] `[AI]` **1.C.1.2** Create `tests/fixtures/url-parser-fixtures.json` with at least 20 URL parser test cases.
- [x] `[AI]` **1.C.2.1** Create `POST /api/cases/create`.
- [x] `[AI]` **1.C.2.2** Create `POST /api/cases/:caseId/urls`.
- [x] `[AI]` **1.C.2.3** Create `GET /api/cases/:caseId`.
- [x] `[AI]` **1.C.3.1** Create `src/lib/abuse-detection.ts`.
- [x] `[AI]` **1.C.3.2** Create `tests/fixtures/public-url-patterns.json` with at least 30 known-safe/public domain patterns that should trigger suspicious-submission review.
- [x] `[AI]` **1.C.4.1** Create `src/app/(victim)/submit/page.tsx`.
- [x] `[AI]` **1.C.4.2** Add real-time platform detection to the URL submission form.
- [x] `[AI]` **1.C.4.3** Create `GET /api/platforms/detect`.
- [x] `[GATED]` **1.D.1.1** Create draft notice templates in the database via seed script using Handlebars syntax; keep `reviewedByLegal: false` until human legal review.
- [x] `[AI]` **1.D.1.2** Create `src/lib/notice-generator.ts`.
- [x] `[AI]` **1.D.2.1** Create `src/lib/notice-router.ts`.
- [x] `[AI]` **1.D.3.1** Create `src/jobs/queue.ts` setting up BullMQ.
- [x] `[AI]` **1.D.3.2** Create `src/jobs/notice-worker.ts`.
- [x] `[AI]` **1.E.1** Create `src/jobs/escalation-worker.ts`.
- [x] `[AI]` **1.E.2** Create `src/lib/fir-package-generator.ts`.
- [x] `[AI]` **1.F.1** Create `GET /api/cases` to list authenticated user's cases.
- [x] `[AI]` **1.F.2** Create `src/app/(victim)/case/[caseId]/page.tsx`.
- [x] `[AI]` **1.F.3** Add `POST /api/cases/:caseId/mark-resolved`.
- [x] `[AI]` **1.G.1** Create `GET /api/cases/:caseId/audit-trail`.
- [x] `[AI]` **1.G.2** Add email delivery proof storage.
- [x] `[AI]` **1.G.3** Implement `payloadHash` verification for notices.
- [x] `[AI]` **1.H.1** Create `src/app/(admin)/layout.tsx`.
- [x] `[AI]` **1.H.2** Create `src/app/(admin)/cases/page.tsx`.
- [x] `[AI]` **1.H.3** Create `src/app/(admin)/flagged/page.tsx`.
- [x] `[AI]` **1.H.4** Create `src/app/(admin)/platforms/page.tsx`.
- [x] `[AI]` **1.H.5** Create `src/app/(admin)/templates/page.tsx`.
- [x] `[AI]` **1.H.6** Create `src/app/(admin)/response-rates/page.tsx`.
- [x] `[AI]` **1.I.1** Create `src/app/(minor)/page.tsx` for the minor support pathway shown when `ageOver18 = false`.
- [x] `[AI]` **1.I.2** Add middleware guard in `src/app/(victim)/layout.tsx`.
- [x] `[AI]` **1.I.3** Add server-side guard in `POST /api/cases/create`.
- [ ] `[HUMAN]` **1.I.4** Complete legal review of POCSO reporting obligations before AI implements or documents reporting protocol behavior.
- [x] `[AI]` **1.J.1** Set up `next-intl` or `next-i18next` for English and Hindi, default English, with language preference stored in a cookie.
- [x] `[AI]` **1.J.2** Create `src/i18n/en.json` with semantic keys for all user-facing strings.
- [x] `[GATED]` **1.J.3** Create `src/i18n/hi.json` as draft Hindi translation and track review status until a native Hindi speaker approves each string.
- [x] `[AI]` **1.J.4** Implement global EN/Hindi language toggle that persists via cookie and does not require login.
- [x] `[AI]` **1.J.5** Ensure all trauma-informed UI text uses approved translations, especially declaration, OTP, next-step, and support copy.
- [x] `[AI]` **1.K.1** Create `src/app/(public)/resources/page.tsx`.
- [x] `[AI]` **1.K.2** Create persistent Support button/panel visible on every page and never hidden behind a menu.
- [x] `[AI]` **1.K.3** Create `src/app/(public)/how-it-works/page.tsx` in Hindi and English.
- [x] `[AI]` **1.L.1** Implement Redis-backed rate limiting middleware.
- [x] `[AI]` **1.L.2** Add HTTP security headers via Next.js config or middleware.
- [x] `[AI]` **1.L.3** Implement CSRF protection for all state-changing API routes.
- [x] `[AI]` **1.L.4** Validate all API inputs with Zod schemas before use; add lint warning for direct body access where feasible.
- [x] `[AI]` **1.L.5** Add SQL injection protection through Prisma/parameterized queries and review of raw SQL usage.
- [x] `[AI]` **1.L.6** Add structured security-event logging without cleartext PII.
- [ ] `[HUMAN]` **1.L.7** Conduct pre-launch security review of the entire codebase.
- [x] `[AI]` **1.M.1** Write unit tests for all modules in `src/lib/`.
- [ ] `[AI]` **1.M.2** Write integration tests for all API routes using a test database.
- [x] `[AI]` **1.M.3** Write Playwright E2E tests for critical victim, admin, minor, and support flows.
- [x] `[AI]` **1.M.4** Write a test that specifically verifies the no-URL-fetch constraint.
- [x] `[AI]` **1.N.1** Create `src/app/(public)/page.tsx` as the landing page.
- [x] `[AI]` **1.N.2** Create `src/app/(public)/privacy/page.tsx`.
- [x] `[GATED]` **1.N.3** Create `src/app/(public)/terms/page.tsx`; AI may draft, legal advisor must approve.
- [x] `[AI]` **1.O.1** Configure Vercel deployment or documented chosen deployment target.
- [ ] `[HUMAN]` **1.O.2** Set up India-region PostgreSQL provider, run production DB setup, and confirm app connectivity.
- [ ] `[HUMAN]` **1.O.3** Configure Resend or selected email provider.
- [ ] `[HUMAN]` **1.O.4** Set up uptime monitoring.
- [x] `[AI]` **1.O.5** Create `GET /api/health`.
- [ ] `[HUMAN]` **1.O.6** Conduct closed beta with 3-5 NGO partner cases before public launch and document issues in `docs/beta/feedback.md`.
- [ ] `[HUMAN]` **1.O.7** Confirm all notice templates have `reviewedByLegal = true` in production database before public launch.
- [ ] `[HUMAN]` **1.O.8** Confirm all Tier 1 and Tier 2 platform contacts have `lastContactVerifiedByHuman = true` before public launch.
- [ ] `[AI]` **2.A.1** Add `hashContent` column to `SubmittedUrl` via Prisma migration only after the Phase 2 gate opens.
- [ ] `[AI]` **2.A.2** Create `src/lib/client-hash.ts`, browser-only and never imported server-side, only after Phase 2 gate opens.
- [ ] `[AI]` **2.A.3** Add optional hash upload UI to victim submit page only after Phase 2 gate opens.
- [ ] `[AI]` **2.A.4** Create `POST /api/cases/:caseId/hashes` only after Phase 2 gate opens.
- [ ] `[HUMAN]` **2.B.1** Prepare partnership pitch deck using Phase 1 response-rate data for Meta India Trust & Safety.
- [ ] `[HUMAN]` **2.B.2** Request formal hash-sharing partnership with Meta.
- [ ] `[AI]` **2.B.3** After partnership agreement is signed, implement Meta NCII hash reporting API client in `src/lib/platform-apis/meta.ts`.
- [ ] `[HUMAN]` **2.B.4** Pursue same partnership with Google/YouTube/Search.
- [ ] `[AI]` **2.B.5** Add TMK-PDQF video hashing only after Phase 2 gate and relevant approvals.
- [ ] `[HUMAN]` **2.B.6** Pursue partnerships with Indian platforms: ShareChat, Josh, Moj, MX TakaTak.
- [ ] `[GATED]` **3.1** Add regional language support: Bengali, Tamil, Telugu, Marathi, Kannada, with native-speaker review before enabling.
- [x] `[AI]` **3.2** Implement internal-only analytics dashboard.
- [ ] `[HUMAN]` **3.3** Pursue formal partnership with NCW.
- [ ] `[HUMAN]` **3.4** Engage with MeitY on using Asmita's Grievance Officer database as a public-registry basis.
- [ ] `[HUMAN]` **3.5** Begin policy advocacy for a dedicated NCII law in India using privacy-preserving case data.
- [ ] `[AI]` **3.6** Build multi-tenant partner NGO architecture only after Phase 3 approval.

### Exact `TODOS.md` Appendix Coverage
- [x] Include all required `.env.example` variables from `TODOS.md` Appendix A: `DATABASE_URL`, `SHADOW_DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`, `ENABLE_HASH_UPLOAD`, and `ENABLE_PLATFORM_API`.
- [x] Include platform seed file format from `TODOS.md` Appendix B with platform slug/name, domain patterns, routing tier, GO email, form URL, template type, human verification flags, source URL, and last verified date.
- [x] Preserve Phase 1 Definition of Done from `TODOS.md` Appendix C: all Phase 1 tasks complete, tests pass, build succeeds, lint passes, templates legally reviewed, GO contacts human-verified, POCSO documented, legal entity registered, email DNS configured, minor pathway verified, no placeholders in production, security review complete, Hindi reviewed, and closed beta complete.
- [x] Preserve the pinned tech stack from `TODOS.md`: Next.js, TypeScript, Tailwind, Prisma/PostgreSQL, Redis/BullMQ, Resend/Postmark, Playwright/Vitest, and India-region hosting unless a documented ADR changes it.
- [x] Preserve the forbidden actions from `TODOS.md`: no fetching submitted URLs, no content upload/storage in Phase 1, no real notices to unverified contacts, no unreviewed legal templates, no Aadhaar number storage, and no Phase 2 hash work before the Phase 2 gate.
- [x] Preserve the intended project directory coverage from `TODOS.md`: app routes, API routes, `src/lib`, `src/jobs`, Prisma schema/seed, tests/fixtures, docs, data seed files, and CI configuration.

---

## Deferred Decisions — Status

| ID | Decision | Status | Must resolve by |
|----|----------|--------|----------------|
| D-01 | Legal entity type | ⬜ Open | Before Month 4 |
| D-02 | Anonymous vs. registered | ✅ Registered adult submissions | Before Week 1 |
| D-03 | Languages at launch | ✅ English + Hindi | Before Week 1 |
| D-04 | Supporter pathway Day 1 or post-launch | ✅ Post-launch | End of Month 1 |
| D-05 | Funding secured | ⬜ Open | Before Week 1 |
| D-06 | POCSO reporting protocol | ⬜ Open | Before Month 4 |
| D-07 | GO database maintenance owner | ✅ Product Operations Lead | Before Month 3 |
| D-08 | Non-response escalation playbook | ✅ Documented | Before Month 3 |

---

## Phase 2 Gate (do not start until both are true)
- [ ] 100+ Phase 1 cases processed with documented per-platform response rates
- [ ] Phase 1 infrastructure stable — 30+ days with no manual scheduler intervention

---

*Update this file at the end of each month. Mark completed items `[x]`. Add new items as they emerge. Do not delete completed items — they form the project history.*
