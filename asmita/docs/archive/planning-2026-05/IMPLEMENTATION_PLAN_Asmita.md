# Asmita — Implementation Plan
**Version:** 0.1
**Date:** 2026-05-12
**Status:** Pre-development
**Derived from:** PRD_Asmita.md v0.2 · TRD_Asmita.md v0.1

> This document is about **sequencing and ownership** — not a restatement of features. Feature specs live in the PRD; technical requirements in the TRD. Consult those for what to build; this document for when, in what order, and who must unblock whom.

---

## Table of Contents

1. [Assumptions & Preconditions](#1-assumptions--preconditions)
2. [Critical Path](#2-critical-path)
3. [Workstream Lanes](#3-workstream-lanes)
4. [Pre-Development Phase (Week −4 to 0)](#4-pre-development-phase-week-4-to-0)
5. [Month 1 — Foundation](#5-month-1--foundation)
6. [Month 2–3 — Core Build](#6-month-23--core-build)
7. [Month 4 — Soft Launch (Closed Beta)](#7-month-4--soft-launch-closed-beta)
8. [Month 5–6 — Hardening & Public Launch](#8-month-56--hardening--public-launch)
9. [Pre-Launch Non-Code Checklist](#9-pre-launch-non-code-checklist)
10. [Deferred-Decision Resolution Schedule](#10-deferred-decision-resolution-schedule)
11. [Dependency Map (Key Blockers)](#11-dependency-map-key-blockers)
12. [Risk Register](#12-risk-register)
13. [Phase 2 Gate Condition](#13-phase-2-gate-condition)

---

## 1. Assumptions & Preconditions

The plan below assumes the minimum team from PRD §17:

| Role | Time commitment |
|------|----------------|
| Product Owner (Founder) | Part-time |
| Backend Developer | Full-time, Months 1–6 |
| Frontend Developer | Full-time, Months 2–6 |
| Legal Advisor (cyber law) | Part-time retainer; 2–4 hrs/week |
| NGO Outreach Lead | Part-time |
| Hindi Translator | Freelance, Month 2–3 |

**If any of these roles are not staffed before Month 1 begins, adjust the plan accordingly — do not start Month 1 engineering work without the Backend Developer in place.**

### Hard preconditions (nothing starts without these)
- **Funding secured (D-05):** Minimum 3–4 months of funded development. This is Week −4 to 0. No Month 1 milestone is achievable without it. See §4.
- **Legal advisor retained:** Notice templates cannot be drafted without legal review. Retainer must be signed before Month 1 ends.
- **Legal entity decision (D-01):** Section 8 company / trust / NGO. Must be decided and filing initiated before Month 4 soft launch. Notices sent from an unregistered entity carry less legal weight.

---

## 2. Critical Path

The longest chain of must-complete-before-X steps that sets the minimum time to public launch:

```
[Funding secured]
       ↓
[Legal entity filed] → [Legal advisor retained]
       ↓                         ↓
[GO database research]    [Notice templates drafted]
       ↓                         ↓
[GO database seeded]      [IFF / SFLC.in review]
       ↓                         ↓
       └──────────┬──────────────┘
                  ↓
       [Templates activated in DB]
                  ↓
       [Email DNS live + warmed (2 weeks)]
                  ↓
       [Backend: notice routing engine]
                  ↓
       [Backend: escalation scheduler]
                  ↓
       [Security audit on staging]
                  ↓
       [POCSO protocol signed off]  ← hard legal gate
                  ↓
       [Accessibility + screen-reader test]
                  ↓
       [Closed beta with NGO partner — 20 cases]
                  ↓
       [Public launch — Month 6]
```

**What slips the date:**
- IFF/SFLC.in review delayed (external dependency — outreach must start Week 1)
- POCSO protocol not drafted (same legal advisor, capacity conflict — see §4)
- GO database has placeholder contacts at Month 4 (TRD Appendix B: no placeholders at launch)
- Email DNS not warmed before Month 4 (2-week fixed calendar cost)

---

## 3. Workstream Lanes

Six parallel workstreams. Each lane runs independently; dependencies between them are listed in §11.

| Lane | Owner | Runs |
|------|-------|------|
| **E — Engineering** | Backend Dev + Frontend Dev | Month 1–6 |
| **L — Legal Review** | Legal Advisor | Month 1–6 (part-time) |
| **G — GO Research** | NGO Outreach Lead or dedicated researcher | Week 1–Month 2 |
| **N — NGO Outreach** | NGO Outreach Lead | Month 1–4 |
| **T — Translation** | Hindi Translator + Legal Advisor review | Month 2–3 |
| **O — Ops / Infra** | Product Owner + Backend Dev | Month 1 setup; ongoing |

Engineering cannot do GO research, translation, or NGO outreach. These lanes must have dedicated owners from Day 1.

---

## 4. Pre-Development Phase (Week −4 to 0)

These are not engineering tasks. They are founder/product-owner tasks that must complete before the engineering clock starts.

| Task | Owner | Done-when |
|------|-------|-----------|
| Funding secured | Founder | Committed funding for 4 months of team cost |
| Legal entity decision (D-01) | Founder + Legal Advisor | Entity type chosen; filing initiated |
| Legal advisor retainer signed | Founder | Signed contract; first briefing done |
| Legal advisor briefed on: POCSO scope, notice template review, DPDP alignment | Founder + Legal Advisor | Briefing call completed; advisor has PRD + TRD |
| D-06 (POCSO protocol) kicked off | Legal Advisor | Draft scope agreed; timeline set |
| AWS account created; ap-south-1 region selected; billing alerts set | Product Owner | Account live |
| IFF / SFLC.in first outreach email sent | Founder | Email sent, response awaited |
| GO research brief written and researcher assigned | Product Owner | Researcher has brief + platform list (TRD Appendix B) |
| NGO partner outreach initiated (iCall, Cyber Peace Foundation) | NGO Outreach Lead | At least one NGO in conversation |
| D-02 (anonymous vs. registered), D-03 (languages), D-04 (supporter) decided | Founder + Product Owner | Decisions documented; TRD §18 updated |

**Gate to Month 1:** Funding confirmed + legal advisor retained + AWS account live + D-02/D-03/D-04 resolved.

---

## 5. Month 1 — Foundation

**Goal:** Infrastructure live, database schema deployed, GO database seeded for Tier 1 platforms, notice templates drafted and in legal review.

### E — Engineering

| Week | Task | TRD Ref |
|------|------|---------|
| 1 | Dev environment setup; repo structure; CI/CD pipeline skeleton (GitHub Actions / equivalent) | INFRA-02, INFRA-05 |
| 1 | **Write the no-fetch invariant CI test first** — before any URL-handling code | NFI-01, §16.4 |
| 1–2 | PostgreSQL schema deployed on staging: `victims`, `cases`, `submitted_urls`, `platforms`, `notices`, `escalations`, `audit_log`, `notice_templates`, `platform_go_history` | §5.1 |
| 1–2 | KMS key created; field-level encryption helpers written and tested | §5.2, PRIV-02 |
| 2–3 | Auth service: OTP generation, email OTP flow, session token issuance (no passwords) | AUTH-01 – AUTH-06, FR-REG-01, FR-REG-02 |
| 2–3 | Sending domain configured: SPF, DKIM, DMARC records published; Postmark/Resend account created; **IP warm-up started** | EMAIL-01 – EMAIL-06 |
| 3–4 | URL parser: domain extraction, platform lookup, rate-limiting middleware | FR-URL-01 – FR-URL-04, ABU-03 |
| 3–4 | Admin panel scaffolding: RBAC roles, login, GO database editor UI | FR-ADMIN-01, FR-ADMIN-05 |
| 4 | Abuse detection signals: flagging rules, review queue endpoint | ABU-04, FR-ADMIN-02 |

### L — Legal Review

| Task | Done-when |
|------|-----------|
| Draft Template A (Indian IT Rules 2021) | First draft submitted to IFF/SFLC.in |
| Draft Template B (International DMCA + Indian law) | First draft submitted |
| Draft Template C (Pornographic platforms, DMCA primary) | First draft submitted |
| IFF / SFLC.in engagement confirmed | Response received; review timeline set |
| D-06: POCSO protocol first draft | Draft written by legal advisor |

> **Warning:** IFF and SFLC.in have their own timelines. Do not assume review in under 4 weeks. Plan for 6 weeks. First outreach was Week −4; follow up Week 1.

### G — GO Research

| Task | Done-when |
|------|-----------|
| All Tier 1 platforms (8 platforms, TRD Appendix B): GO contact verified via platform's own Terms/Contact page | Contact email + last-verified date recorded |
| All Tier 2 platforms (Pornhub/Aylo, xVideos, xHamster, XNXX, RedTube): abuse/DMCA form URL verified | Form URL + process notes recorded |
| Tier 3 (Search engines): removal tool URLs verified | Recorded |
| Each entry entered in GO database with verification source | Admin panel shows no `is_stale` entries |

> GO research is **not** a sprint ticket. It is a 4–6 week parallel workstream requiring daily researcher time and direct verification from each platform's live site (not from cached sources).

### N — NGO Outreach

| Task | Done-when |
|------|-----------|
| iCall (TISS) partnership discussion initiated | Meeting scheduled |
| Cyber Peace Foundation discussion initiated | Meeting scheduled |
| Red Dot Foundation discussion initiated | Meeting scheduled |
| At least one NGO partner confirmed for Month 4 beta | MOU or written agreement |

**Month 1 Gate (must all be true before Month 2 engineering begins):**
- [ ] Database schema deployed on staging and reviewed by Backend Dev
- [ ] No-fetch invariant CI test is live and green
- [ ] Auth service passes integration tests (OTP register → verify → session)
- [ ] Email sending domain live with SPF/DKIM/DMARC; warm-up in progress
- [ ] GO database seeded for all Tier 1 platforms (no placeholder contacts)
- [ ] Notice templates in legal review (IFF/SFLC.in)
- [ ] D-02, D-03, D-04 decisions documented

---

## 6. Month 2–3 — Core Build

**Goal:** Full notice routing engine, escalation scheduler, victim dashboard, admin panel complete. Hindi translation delivered and reviewed. Templates legally approved and activated.

### E — Engineering

**Month 2:**

| Task | TRD Ref |
|------|---------|
| Victim registration form (email OTP + age attestation + declaration) | FR-REG-01 – FR-REG-07 |
| Minor pathway: hard branch, no data storage, all referral content | FR-MIN-01 – FR-MIN-04 |
| URL submission form: input, local parse, platform lookup, rate-limit UI | FR-URL-01 – FR-URL-06 |
| Notice generation engine: template selection, variable substitution, notice record creation | FR-NR-02, FR-NR-06 |
| Tier 2 notice dispatch: email send via Postmark/Resend with idempotency key | FR-NR-01, FR-NR-04 |
| Bounce/complaint webhook receiver wired to platform `is_stale` flag | EMAIL-04, EMAIL-05 |
| Append-only audit log: DB policy enforced + all required events logged | AUDIT-01, AUDIT-02 |

**Month 3:**

| Task | TRD Ref |
|------|---------|
| Escalation scheduler (background worker): T+24h, T+48h, T+7d; idempotency; UTC clock source | FR-ESC-01 – FR-ESC-05 |
| 7-day legal package PDF generation (Devanagari font embedded) | FR-ESC-05, I18N-04 |
| Case tracking dashboard: per-URL status, add URLs, manual resolve, PDF export | FR-DASH-01 – FR-DASH-06 |
| Admin panel: review queue, notice template editor, platform response rate dashboard | FR-ADMIN-02 – FR-ADMIN-04 |
| Victim confirmation email (case ref + dashboard link, no URLs) | FR-NR-05 |
| Tier 3 web form handoff: instructions, pre-filled template, victim confirmation | FR-NR-08 |
| Tier 1 API client for Meta (if API partnership confirmed) + Google removal | FR-NR-07; mark as Tier 2 fallback if partnership not confirmed |
| Aadhaar offline XML verification (signature check against bundled UIDAI cert chain) | FR-REG-05, ABU-06 |
| Account deletion flow (soft delete + 30-day hard delete job) | FR-DASH-06, PRIV-07 |

### L — Legal Review

| Task | Done-when |
|------|-----------|
| IFF / SFLC.in review of all three templates completed | Written sign-off received |
| Templates entered in DB with `reviewed_by` set; legal advisor activates via admin panel | `notice_templates.reviewed_at` not null |
| POCSO protocol finalised and documented | Written protocol signed by legal advisor |
| D-01: Legal entity registered | Registration filing confirmed |

> **POCSO protocol must be complete before Month 4 soft launch.** This is a hard gate per TRD FR-MIN-05. The legal advisor drafting this is the same person reviewing templates — flag the capacity conflict to the founder by end of Month 1.

### T — Translation

| Task | Done-when |
|------|-----------|
| All UI strings translated to Hindi by qualified translator | Translator delivers string file |
| All legal citations and declaration text translated and reviewed by legal advisor | Legal advisor signs off Hindi legal text |
| Hindi notice templates (A, B, C) translated and reviewed | Templates in DB with Hindi body |
| Support resources page content translated | Content in CMS / string file |

### N — NGO Outreach

| Task | Done-when |
|------|-----------|
| NGO partner for beta confirmed and briefed on the platform | MOU signed; partner has access to staging |
| NGO vouching API documented and shared with partner | API key issued to partner |
| 20 potential beta cases identified through NGO partner | Partner has list ready for Month 4 |

**Month 2–3 Gate (must all be true before Month 4 beta):**
- [ ] Full victim flow works end-to-end on staging: register → declare → submit URL → notice dispatched → dashboard shows status
- [ ] Minor pathway integration test passes (zero rows written to database)
- [ ] Escalation scheduler fires correctly at T+24h and T+48h in staging environment
- [ ] 7-day legal package PDF renders correctly in Hindi and English with all required fields
- [ ] Notice templates activated in DB (legal advisor review complete)
- [ ] POCSO protocol document signed by legal advisor
- [ ] Hindi UI fully translated and reviewed
- [ ] Email IP warm-up complete; test deliverability to major Indian providers (Gmail, Hotmail, Yahoo)
- [ ] Admin panel: all RBAC roles working; GO database editor functional

---

## 7. Month 4 — Soft Launch (Closed Beta)

**Goal:** Process 20 real victim cases with NGO partner oversight. Validate notice delivery, platform responses, escalation logic, and victim UX under real conditions.

### Pre-Beta Checklist (must complete before first real case)
- [ ] Security audit on staging (see §9 — NFR-SEC-05)
- [ ] Accessibility test: WCAG 2.2 AA + screen-reader pass (NVDA / VoiceOver)
- [ ] Legal entity registration confirmed (not just filed)
- [ ] All Tier 1 + Tier 2 platform contacts verified and current in GO database
- [ ] Email DNS fully configured; DMARC policy `p=quarantine` active
- [ ] Founder has reviewed and approved the live notice templates
- [ ] NGO partner briefed; NGO API key issued; vouching workflow tested
- [ ] Victim deletion flow tested on staging (30-day cycle simulated)
- [ ] On-call alert routing configured (OBS-03)
- [ ] DR test: simulated RDS failure; recovery confirmed within RTO

### E — Engineering (Month 4)

| Task | Notes |
|------|-------|
| Deploy to production (ap-south-1) | Final prod environment check |
| Bug fixes from beta cases | Triage daily with NGO partner |
| Platform response tracking: log all acknowledgments and removals from real cases | Feeds response-rate dashboard |
| Monitor email deliverability metrics daily | Bounce rate < 2%; spam < 0.1% |
| Monitor escalation scheduler: confirm T+24h/T+48h fires on real cases | |

### Data to collect during beta (feeds Phase 2)

| Metric | Target to measure |
|--------|------------------|
| Notice delivery success rate per platform | % delivered, % bounced |
| Platform acknowledgment rate | % within 24h, 48h, 7 days |
| Content removal rate | % removed within 72h |
| Victim time-on-task (registration → first notice sent) | Target < 15 minutes |
| Cases where victim requested escalation package | Qualitative feedback |

**Month 4 Gate:**
- [ ] 20 beta cases processed without data breach or privacy incident
- [ ] No notice sent to a wrong platform contact (GO database accuracy)
- [ ] Escalation scheduler fired correctly on all cases with no-response
- [ ] At least one platform acknowledged a notice
- [ ] Zero cases where the no-fetch invariant was violated (audit log confirms)
- [ ] Victim feedback collected (survey or NGO debrief)

---

## 8. Month 5–6 — Hardening & Public Launch

**Goal:** Fix issues from beta. Reach 100 cases processed. Public launch Month 6.

### Month 5 — Hardening

| Lane | Task |
|------|------|
| E | Fix all P1/P2 bugs from Month 4 beta |
| E | Performance: Lighthouse CI passing LCP ≤ 3s, JS ≤ 200KB |
| E | DMARC upgrade from `p=quarantine` to `p=reject` (after 30 days monitoring) |
| E | Load test on staging: 100 concurrent submissions (TRD NFR-AVAIL-01) |
| E | Hash-chaining on audit log (TRD AUDIT-03 — required before legal package feature is relied upon) |
| L | Review any notice template changes indicated by beta response data |
| L | DPDP implementation rules check: any new rules notified since pre-dev? |
| G | Update any GO contacts that bounced during beta |
| N | Expand NGO partner network; onboard second NGO |
| O | Response rate dashboard reviewed: identify lowest-response platforms for different escalation strategy |

### Month 6 — Public Launch

| Task | Owner | Done-when |
|------|-------|-----------|
| Soft-remove "beta" labels from UI | Frontend Dev | UI updated |
| Press/announcement to NGO network | NGO Outreach Lead | Announced |
| Public launch blog/FAQ page (in Hindi + English) | Product Owner + Translator | Live |
| Support resources page verified current (helpline numbers, DLSA directory) | NGO Outreach Lead | Verified |
| 100-case milestone tracking begins | Product Owner | Dashboard live |
| Monthly GO database verification schedule established | GO Research owner | First review done |

**Public Launch Gate (hard — all must be true):**
- [ ] 20+ beta cases closed (removed or escalation package delivered)
- [ ] No open P1 security or privacy bugs
- [ ] POCSO protocol document signed and stored
- [ ] Legal entity registered and active
- [ ] Notice templates legally reviewed and active (all three types)
- [ ] GO database: zero placeholder contacts, zero stale entries
- [ ] Email: DMARC `p=reject`; bounce rate < 2%
- [ ] Audit log hash-chaining live
- [ ] Accessibility: WCAG 2.2 AA certified
- [ ] Victim deletion flow verified on production (test account)
- [ ] DR test passed on production infrastructure

---

## 9. Pre-Launch Non-Code Checklist

These items are not GitHub tickets. Each needs an owner and a completion date.

| Item | Owner | Blocks |
|------|-------|--------|
| Legal entity registered | Founder | Notice credibility; public launch |
| Legal advisor retainer active | Founder | Template review; POCSO protocol |
| IFF or SFLC.in notice template review completed | Legal Advisor | Template activation |
| POCSO reporting protocol written and signed | Legal Advisor | Production deployment |
| All Tier 1 + Tier 2 GO contacts verified (no placeholders) | GO Researcher | Notice routing; soft launch |
| SPF + DKIM + DMARC published for sending domain | Ops | Any email notices sent |
| Email IP warm-up completed | Ops | Any email notices sent |
| Security audit on staging | Backend Dev / External | Soft launch |
| Accessibility test (WCAG 2.2 AA + screen reader) | Frontend Dev | Public launch |
| Hindi legal text reviewed by legal advisor | Legal Advisor + Translator | Hindi template activation |
| DR test (RDS recovery within RTO) | Backend Dev | Public launch |
| NGO partner MOU signed | NGO Outreach Lead | Soft launch |
| DPDP compliance check (once implementation rules notified) | Legal Advisor | Ongoing — track as standing obligation |
| Monthly GO database re-verification cadence assigned | Product Owner | Post-launch operations |
| Victim feedback collection mechanism in place (survey or NGO debrief) | Product Owner | Month 4 beta |

---

## 10. Deferred-Decision Resolution Schedule

From TRD §18. Each decision blocks specific engineering work. Resolving late forces rework.

| Decision | Must resolve by | Blocks if delayed |
|----------|----------------|-------------------|
| **D-01** — Legal entity type | End of Month 2 (file by Month 1) | Notice credibility; funding eligibility |
| **D-02** — Anonymous vs. registered submissions | End of Week −1 (pre-dev) | Auth model; if anonymous, major TRD rework |
| **D-03** — Languages at launch (Hindi+English or add third) | End of Week −1 | Translation scope; add 2+ weeks if third language added |
| **D-04** — Supporter pathway Day 1 or post-launch | End of Month 1 | FR-REG-08; consent form upload; if post-launch, drop from Phase 1 scope |
| **D-05** — Funding secured | Before Week 1 (pre-dev gate) | Everything |
| **D-06** — POCSO reporting protocol | Before Month 4 soft launch | Production deployment; hard legal gate |
| **D-07** — GO database maintenance owner (post-launch) | By Month 3 | Month 4 beta: stale contacts = failed notice delivery |
| **D-08** — Non-response escalation playbook | By Month 3 | Escalation scheduler operational configuration |

---

## 11. Dependency Map (Key Blockers)

For each major system component, what must be complete first.

| Component | Blocked by |
|-----------|-----------|
| Notice dispatch (FR-NR-01) | Email DNS live + warmed; GO database seeded; templates legally reviewed and activated |
| Template activation | IFF/SFLC.in legal review complete; legal advisor signs off in DB |
| Escalation scheduler (FR-ESC) | Notice dispatch working; clock source confirmed (UTC DB time) |
| Minor pathway (FR-MIN) | POCSO protocol signed; hard branch verified by integration test |
| Aadhaar KYC (FR-REG-05) | UIDAI cert chain bundled; signature verification unit-tested |
| 7-day legal package PDF | PDF renderer with Devanagari font tested; Hindi translation reviewed |
| Soft launch | Security audit; accessibility test; GO database complete; templates active; NGO partner confirmed |
| Public launch | Soft launch gate passed + all pre-launch checklist items |
| Phase 2 (hash network) | 100+ Phase 1 cases processed; per-platform response rates documented |

---

## 12. Risk Register

Inherits risks from PRD §18 with owners and trigger dates added.

| Risk | Severity | Trigger date | Owner | Mitigation |
|------|----------|-------------|-------|-----------|
| IFF/SFLC.in review delayed >6 weeks | High | Month 2 end | Legal Advisor | Follow up weekly; identify backup reviewer (cyber law practitioner with IT Rules experience) by Month 2 if no response |
| GO contact bounces after notice sent | High | Month 4 (beta) | GO Researcher | Bounce webhook flags entry as `is_stale`; re-verify within 24h; manual notice resent |
| POCSO protocol not ready by Month 4 | High | Month 3 end | Legal Advisor | Escalate to founder; consider delaying soft launch rather than launching without it |
| Legal entity not registered by Month 4 | Medium | Month 3 end | Founder | File by Month 1; track registration status weekly |
| Email notices land in spam | High | Month 3 (warm-up) | Backend Dev | Monitor inbox placement during warm-up; adjust sending volume; consider dedicated IP |
| D-02 left as anonymous → auth model requires significant rework | High | Week −1 | Founder | Resolve in pre-dev phase; default to registered (OTP) per PRD recommendation |
| Abuse case: bad actor submits legitimate URL as NCII | High | From Month 4 | Case Reviewer | Human review queue SLA 4h; abuse detection signals (ABU-04) must be live before soft launch |
| Minor content submitted through adult pathway | Critical | From Month 4 | Engineering | Age attestation hard branch live; POCSO protocol in place; no workaround |
| Data breach exposing victim information | Critical | Ongoing | Backend Dev | Field-level encryption; no content stored; security audit pre-launch; quarterly review |
| Supporter pathway (D-04) deprioritised creates victim access gap | Medium | Month 1 decision | Product Owner | If deferred, document clearly; NGO partners can still vouch (FR-ADMIN-06) |
| Phase 2 partnership conversations stall because Phase 1 data is thin | Medium | Month 6 | Product Owner | Publish platform response rate data publicly to create accountability pressure |

---

## 13. Phase 2 Gate Condition

Phase 2 (hash network) does not start until **both** conditions are met:

1. **100+ Phase 1 cases processed** with documented per-platform response rates (PRD §14, §15)
2. **Phase 1 infrastructure is stable** — no open P1 bugs; escalation scheduler running without manual intervention for 30+ days

The per-platform response rate data from Phase 1 is the basis for every Phase 2 platform partnership conversation. Starting Phase 2 conversations without it is the wrong sequence.

*Phase 2 technical design is not in scope for this document. See PRD §14 Phase 2 for feature scope; TRD §17 for Phase 1 extension points.*

---

*Document Owner: [Product Owner / Founder]*
*Last Updated: 2026-05-12*
*Derived from: PRD_Asmita.md v0.2 · TRD_Asmita.md v0.1*
*Next Review: End of Month 1 (update with actual dates and staffing)*
