# Asmita — Product Requirements Document
**Asmita (अस्मिता) — Dignity Restoration Platform for Non-Consensual Intimate Images**
**Version:** 0.3 (Draft)
**Date:** 2026-05-17
**Status:** Pre-development; engine substantially built and gated pending legal sign-off

---

## Changelog

### v0.3 (2026-05-17) — Regulatory refresh + verified GO contacts

Between v0.2 (2026-05-12) and v0.3, the regulatory landscape around NCII shifted significantly in both India and the United States. This version captures those changes and the product-level adjustments they require. None of the v0.2 architecture is being reversed; the changes are additive.

**Indian regulatory updates incorporated:**
- **MeitY Standard Operating Procedure of 11 November 2025** mandating a uniform 24-hour NCII takedown across intermediaries, with NCRP 1930 designated as the national victim intake (Section 4).
- **IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules 2026**, notified 10 February 2026, operational 20 February 2026. New accelerated takedown windows: **2 hours for non-consensual nudity, 3 hours for government/court-ordered takedown of synthetic content, 7 days for grievance-officer resolution** (Sections 4 and 6).
- **I4C national hash bank** maintained by the Indian Cybercrime Coordination Centre, with DoT-ISP coordination for URL-level blocking (Sections 4 and 9).
- Madras HC and Delhi HC NCII-specific directives referenced in the legal framework (Section 4).

**US regulatory updates incorporated:**
- **TAKE IT DOWN Act of 2025** (15 U.S.C. § 6851), signed 19 May 2025, full implementation deadline 19 May 2026. Covered platforms (which includes every major social-media and adult site) must remove non-consensual intimate visual depictions within **48 hours** of valid notification. This is the strongest single legal lever for US-hosted platforms and is now cited as a primary basis in Templates B and C (Sections 4 and 10).
- **FTC consent decree against Aylo (Pornhub's parent), September 2025** — $5M settlement obligating consent and identity verification; relevant for any notice routed to Pornhub-network sites (Section 10).

**Product changes:**
- New content-category flag at URL submission so the system can route NCN cases into the 2-hour regime (Feature 1.2, Section 6).
- New conceptual platform tier `TIER_GOVT_ESCALATION_ONLY` for offshore aggregator sites where direct platform notice is known-futile and the only viable escalation is NCRP / DoT / Google de-indexing / Cloudflare abuse (Sections 9 and 10).
- Notice templates rewritten to procedural-skeleton quality (full statutory shape per template type, hedged citation of the 2026 amendment pending legal review). Templates remain gated by `reviewedByLegal: false`; the escalation engine refuses to dispatch any notice whose template flag is false (Section 10).
- Escalation timeline (Feature 1.4) updated to reflect the engine that is now actually implemented in code: L1 follow-up to platform GO (gated), L2 victim notification, L3 FIR readiness with PDF download.

**Verified Grievance Officer contacts (Section 9):**
- Snapchat — Uthara Ganesh, `grievance-officer-in@snap.com` (directly verified from canonical Snapchat help page on 2026-05-17).
- Reddit India — Vijay Pamarathi, Bengaluru office (directly verified from Reddit help page on 2026-05-17).
- Other Tier-1 GOs raised to medium-confidence from secondary sources; all still require final verification by a human researcher via the admin GO editor before being marked `lastContactVerifiedByHuman=true` in production.

**Decisions closed since v0.2:**
- D-02: Anonymous vs. registered submissions → registered (email OTP).
- D-03: Launch languages → English + Hindi.
- D-04: Supporter pathway → post-launch.

**Decisions still open:**
- D-01 (legal entity), D-05 (funding), D-06 (POCSO protocol), D-07 (platform DB maintenance owner), D-08 (non-response playbook) — these carry over from v0.2 with no change.

**Engineering progress note (informational, not contractual):**
The engine described in this PRD has been substantively implemented in the `asmita/` Next.js application as of 2026-05-17. Daily Vercel Cron, L1/L2/L3 escalation handlers, audit hash-chain validation, DB-backed admin GO editor, CSV import script, and procedural notice template drafts are all merged on `master`. Production launch remains gated on the human items (legal review, GO verification, DNS, NGO partnership, POCSO protocol).

---

## Table of Contents

1. [Vision & Mission](#1-vision--mission)
2. [Problem Statement](#2-problem-statement)
3. [Existing Landscape](#3-existing-landscape)
4. [Legal Framework — India](#4-legal-framework--india)
5. [Target Users](#5-target-users)
6. [Core Features & Scope](#6-core-features--scope)
7. [Victim Journey (User Flow)](#7-victim-journey-user-flow)
8. [Trust & Verification](#8-trust--verification)
9. [Platform Database — Target Platforms](#9-platform-database--target-platforms)
10. [Takedown Notice System](#10-takedown-notice-system)
11. [Technical Architecture](#11-technical-architecture)
12. [Privacy & Data Protection](#12-privacy--data-protection)
13. [POCSO / Minor Pathway (Mandatory)](#13-pocso--minor-pathway-mandatory)
14. [Roadmap (Phased)](#14-roadmap-phased)
15. [Metrics & Success Criteria](#15-metrics--success-criteria)
16. [Partnerships & Institutional Relations](#16-partnerships--institutional-relations)
17. [Team & Resources](#17-team--resources)
18. [Risks & Mitigations](#18-risks--mitigations)
19. [Open Questions](#19-open-questions)

---

## 1. Vision & Mission

### Mission
Asmita is a free, victim-controlled digital platform that helps Indian women and survivors of non-consensual intimate image (NCII) abuse — including MMS leaks — rapidly request removal of their content from social media platforms, pornographic websites, and messaging apps. The v1 system operates on URLs: a victim pastes a link, and Asmita generates and routes legally-grounded takedown notices to the right platform contact, automatically. Hash-based proactive blocking is a future phase once URL-based removal infrastructure is proven.

### Vision
A future where no Indian woman has to navigate platform bureaucracy alone, understands her legal rights, and has a single trusted system working on her behalf to restore her dignity.

### Name
"Asmita" (अस्मिता) means dignity, self-respect, and identity in Hindi. The name signals the platform's core purpose: restoring what was taken without consent.

### What Asmita Is
- A URL-based takedown notice engine that operationalizes IT Rules 2021 Rule 3(2)(b) at scale
- A Grievance Officer contact directory — one of the most practically valuable assets the platform will build
- An automated multi-platform notice routing system (API → Grievance Officer email → web form guided handoff)
- A case tracking and escalation dashboard (24-hour, 48-hour, 7-day auto-escalation)
- A legal information resource (Indian law, victim rights)
- A referral network to NGOs, lawyers, and counselors

### What Asmita Is Not
- A content hosting or viewing platform
- A law enforcement body
- A replacement for filing a police FIR (it complements it)
- A vigilante or doxxing tool

---

## 2. Problem Statement

### Scale of the Problem
Non-consensual intimate image (NCII) abuse — commonly called "revenge porn" or "MMS leaks" in India — has reached crisis scale:
- Thousands of Indian women are victimized annually through intimate image leaks
- Content spreads across WhatsApp, Telegram, porn sites, and social media within hours
- Victims face social ostracization, forced marriage, job loss, harassment, and suicide
- The perpetrator is most commonly a former partner, family member, or blackmailer

### Why Existing Systems Fail Victims
| System | Problem |
|--------|---------|
| Police FIR | Victim is often blamed; officers are untrained; response is slow |
| Platform "Report" button | Takes weeks; requires multiple reports; no legal pressure; no multi-platform action |
| cybercrime.gov.in | Portal exists but response is slow, anonymous, and not survivor-friendly |
| NCW Sahyog portal | Handles complaints but not automated cross-platform content removal |
| Legal action | Expensive, inaccessible to most victims; takes months or years |

### The Gap Asmita Fills
Asmita is the first India-specific platform that:
1. Creates a perceptual hash of content on the victim's device — no image/video ever leaves their device
2. Sends legally-grounded, platform-specific takedown notices automatically
3. Tracks response status across all platforms in one dashboard
4. Routes victims to appropriate legal, mental health, and NGO support

---

## 3. Existing Landscape

### Global Systems (Reference Models)

**StopNCII.org (UK / Global)**
- Built by the Revenge Porn Helpline (2021)
- Partners: Meta, Instagram, TikTok, Snapchat, Reddit, Bumble, OnlyFans
- Process: Victim hashes content client-side → hash shared with partner platforms → platforms remove matches
- Limitation: Covers partner platforms only; no porn sites; no India-specific legal notices

**TakeItDown (US — NCMEC)**
- Focused on minors (CSAM) — mandatory for this use case
- Victims under 18 should be routed here in addition to Asmita's minor pathway
- Free and has platform partnerships

**DMCA Takedown (US)**
- Used for copyright-based removal
- Applicable to Indian victims because most porn platforms are US-hosted
- Asmita can file DMCA notices on behalf of victims (with victim authorization)

### Indian Systems (What Already Exists)

**cybercrime.gov.in — National Cyber Crime Reporting Portal**
- Accepts NCII complaints under "Report Cyber Crime"
- Pros: Government authority, can trigger police action
- Cons: Slow response; not victim-friendly; no automated multi-platform removal; requires victim to navigate the system alone

**NCW Sahyog**
- National Commission for Women digital portal
- Handles complaints but not automated hash or takedown
- No tracking, no automated notices

**IT Rules 2021 — Grievance Officers**
- All "significant social media intermediaries" (>5M users) must have a designated Grievance Officer in India
- Must respond to sexual content removal within 24 hours for non-consensual intimate content under Rule 3(2)(b)
- Any user — or someone acting on their behalf with consent — can invoke this rule directly; no court order required
- This is Asmita's primary legal lever. Most victims don't know it exists. Asmita operationalizes it at scale.

### Asmita's Differentiation
Asmita is NOT a replacement for the above — it is an accelerator:
- Operationalizes IT Rules 2021 Rule 3(2)(b) at scale — a real legal right that almost no victim is using
- Covers multiple platforms simultaneously with platform-specific notice routing
- Builds and maintains the Grievance Officer contact database so victims don't have to find contacts themselves
- Creates a documented paper trail (timestamps, delivery receipts, response tracking) for follow-up legal action
- Survivor-centered UX vs. bureaucratic government portals

---

## 4. Legal Framework — India

### Primary Laws Applicable to NCII (Indian)

| Law | Provision | Relevance |
|-----|-----------|-----------|
| IT Act 2000, Section 66E | Punishment for violation of privacy — capturing, publishing, transmitting private images without consent | Core offense; 3 years + ₹2 lakh fine |
| IT Act 2000, Section 67 | Publishing obscene material in electronic form | Up to 5 years imprisonment |
| IT Act 2000, Section 67A | Publishing sexually explicit material in electronic form | Up to 5 years + ₹10 lakh fine |
| IT Act 2000, Section 79 | Intermediary safe-harbour limitation — basis for compelling intermediary action | Statutory hook for Asmita's notices |
| BNS 2023 Section 77 (formerly IPC 354C) | Voyeurism — capturing or disseminating private images of women without consent | 1–3 years (first offense), 3–7 years (repeat) |
| POCSO Act 2012, Section 13–15 | Child sexual abuse material — mandatory reporting; platforms must report to NCMEC/police | Zero tolerance; mandatory referral (see Section 13) |
| Protection of Women from Domestic Violence Act | Applicable when perpetrator is intimate partner | Supports civil remedies |
| IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 | Rule 3(2)(b): Platforms must remove content within 24 hours for specific sexual content; Grievance Officer mandatory | Foundational framework; further accelerated by 2025 SOP and 2026 amendment (below) |
| **MeitY Standard Operating Procedure (11 November 2025)** | **Uniform 24-hour NCII takedown across intermediaries; NCRP 1930 designated national victim intake; I4C hash bank for re-upload prevention; DoT coordination for ISP-level URL blocking** | **First nationally-mandated NCII SOP; binds every intermediary regardless of size** |
| **IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules 2026** (notified 10 Feb 2026, operational 20 Feb 2026) | **Accelerated timelines: 2 hours for non-consensual nudity, 3 hours for government/court-ordered takedown of synthetic / deepfake content, 7-day grievance-officer resolution (was 15 days)** | **Strongest current Indian lever; cite alongside Rule 3(2)(b)** |
| Digital Personal Data Protection Act 2023 | Governs how Asmita handles victim personal data | Design for DPDP principles; implementation rules pending notification |

### Layered Indian timelines (as of 2026-05-17)

| Trigger | Statutory window | Source |
|---|---|---|
| User reporting non-consensual nudity (NCN) | **2 hours** | IT Rules Amendment 2026 |
| User reporting impersonation / deepfake | **2 hours** | IT Rules Amendment 2026 |
| Government / court takedown order | **3 hours** | IT Rules Amendment 2026 |
| General NCII reported via Grievance Officer | **24 hours** | IT Rules 2021 Rule 3(2)(b) + MeitY 2025 SOP |
| Grievance Officer must resolve / acknowledge | **7 days** | IT Rules Amendment 2026 (down from 15 days) |

**Source caveat:** The exact sub-rule citation numbers under the 2026 amendment have been intentionally hedged in Asmita's notice templates ("as amended in 2026 prescribing accelerated removal timelines"). The amendment is well-attested in secondary legal commentary (Mondaq, LawSikho, LiveLaw, Storyboard18, SCC Online), but the legal reviewers at IFF / SFLC.in must substitute verified gazette-text rule numbers before templates ship.

### Recent judicial directives

- **Madras High Court NCII directives (2025)**: Required MeitY to combat NCII spread proactively; directly precipitated the November 2025 SOP. Asmita's notices should be aware of this case-law thread.
- **Delhi High Court directions to search engines (2024–2025)**: Specifically directed Google, Bing, and other search providers to act on NCII de-listing requests within tight timelines. IFF has written about these directions and they support Asmita's escalation-to-de-indexing path.
- Both are starting points for IFF / SFLC.in's template review — they have litigated or written about these directives.

### Primary Laws Applicable to NCII (United States, for international platforms)

| Law | Provision | Relevance |
|-----|-----------|-----------|
| DMCA, 17 U.S.C. § 512(c)(3) | Standard copyright takedown procedure; requires six statutory elements | Foundational; cited in Templates B and C |
| **TAKE IT DOWN Act, 15 U.S.C. § 6851** (signed 19 May 2025; implementation deadline 19 May 2026) | **Covered platforms must remove non-consensual intimate visual depictions within 48 hours of a valid notification. Does NOT require the complainant to hold copyright — applies to deepfakes and covertly-recorded content where DMCA does not.** | **Strongest single US lever for porn-platform NCII as of 2026. Cited as primary basis in Templates B and C.** |

### How Asmita Uses These Laws
1. **IT Rules 2021 Rule 3(2)(b), as accelerated by the 2026 Amendment Rules** — Primary Indian lever. Cited in every notice to Indian intermediaries. Triggers the platform's 24-hour (general) or 2-hour (NCN-flagged) legal obligation without requiring a court order or police FIR. Any user can invoke this; Asmita makes it easy.
2. **IT Act ss.66E / 67 / 67A / 79 + BNS 2023 s.77** — Cited as the criminal offenses the content constitutes. Makes the platform's liability for continued hosting explicit.
3. **MeitY 2025 SOP + NCRP 1930** — For cases where direct platform notice is known-futile (offshore aggregator sites; see Section 9 `TIER_GOVT_ESCALATION_ONLY`), Asmita routes the victim to NCRP 1930 / cybercrime.gov.in for ISP-level blocking via DoT.
4. **DMCA § 512(c)(3)** — Cited for international platforms where the complainant retains rights in the underlying work.
5. **TAKE IT DOWN Act § 6851** — Primary lever for US-covered porn platforms; does not require copyright ownership. Cited in Templates B and C alongside DMCA.
6. **DPDP Act 2023** — Governs how Asmita stores and processes victim data. Architecture designed for DPDP principles from day one.

### What Asmita Can and Cannot Claim
- **Can claim:** "This content constitutes an offense under IT Act Section 66E and BNS Section 77. Under IT Rules 2021 Rule 3(2)(b), as amended in 2026 prescribing accelerated NCII timelines, you are required to remove this content within the applicable statutory window. For non-consensual nudity reported under the 2026 amendment, that window is 2 hours; for general NCII, 24 hours. Failure to act may expose your platform to liability under Indian law and to government-directed blocking under the November 2025 MeitY SOP."
- **Cannot claim:** Government enforcement action, police FIR (unless one has been filed), court orders (unless obtained), gazette-specific sub-rule citations of the 2026 amendment until those citations have been verified by the legal review partners.
- All notices will be drafted by Asmita and reviewed by IFF or SFLC.in before any template is flipped to `reviewedByLegal: true` and dispatched to a real platform.

---

## 5. Target Users

### Primary User: Victim / Survivor
- Indian women whose intimate images or videos have been shared without consent
- Age: 16–45 (primary); minor pathway applies for under 18
- Language: Hindi + English primary; regional language support in future phases
- Tech literacy: Mobile-first; many may be in distress at time of use — UX must be trauma-informed

### Secondary User: Supporter
- A trusted friend, family member, lawyer, or NGO worker helping the victim navigate the process
- Must be able to act on victim's behalf with victim's documented consent

### Edge Cases
- Trans and non-binary victims — same process; intake form must be inclusive
- Male victims — platform must not exclude; NCII affects all genders
- Minors — mandatory separate pathway (see Section 13)

---

## 6. Core Features & Scope

### Phase 1: URL-Based Notice System (Months 1–6)
This is the entire scope of Phase 1. Everything in this section must be functional before Phase 2 begins. Hash-based proactive blocking is explicitly Phase 2.

**Why URLs are the right v1 primitive:**
- Most platforms (Twitter/X, Reddit, Telegram channels, Indian piracy sites, small forums) only accept URL-based notices — they have no hash submission infrastructure
- IT Rules 2021 Rule 3(2)(b) notices are URL-based by design; the Grievance Officer needs a specific URL to act
- Law enforcement complaints (Section 66E, 67A, BNS 77) require URLs as evidence
- Victims can copy a link from their phone in 10 seconds; computing a perceptual hash on their own device is a much higher barrier

**Feature 1.1 — Victim Registration & Verification**
- Name (can be anonymous/pseudonym for initial registration)
- Email (verified via OTP — required; used for case updates only)
- Phone (optional; for NGO follow-up)
- Age attestation (under/over 18 — triggers different pathway; see Section 13)
- State and city (for routing to local NGO/legal aid)
- **Identity verification (DigiLocker / Aadhaar offline KYC):** Victims who want stronger notice authority can optionally verify identity via Aadhaar offline XML or DigiLocker. Verified identity is noted in the notice and carries more legal weight. Not mandatory at intake — reduces barrier for the most vulnerable.
- **Digital declaration:** At submission, victim signs a digital declaration: *"I confirm that I am the person depicted in this content, or an authorized representative with documented consent. I declare under penalty of law (IT Act Section 66, IPC Section 191) that this submission is truthful."* This is the primary abuse deterrent and creates legal accountability.

**Feature 1.2 — URL Submission**
- Victim (or supporter with consent) submits one or more URLs
- System parses each URL: extracts domain, identifies platform from Asmita's platform database
- Each URL is treated as a string token throughout — Asmita's servers **never fetch, download, or render the content at the URL**
- Unknown platforms flagged for human review and platform database update
- Multiple URLs per case supported (content often spreads to multiple platforms simultaneously)
- **Content category flag (new in v0.3):** For each URL the victim is asked one optional question — "Does this content show non-consensual nudity, or is it a deepfake / synthetically-generated intimate depiction of you?" Three-state answer: yes-NCN, yes-deepfake, no/not-sure. Answer is used to:
  - Route NCN and deepfake URLs into the 2-hour and 3-hour regimes under the IT Rules Amendment 2026 (otherwise they get the general 24-hour treatment).
  - Surface the strongest applicable legal citation in the notice body.
  - Tag the case for analytics so we can measure per-category response rates.
  The question is optional because some victims will not be able to characterise the content in distress; absent an answer the case routes via the general 24-hour path.

**Feature 1.3 — Notice Routing Engine (Core System)**

For each URL, the system routes the notice through a three-tier priority chain:

*Tier 1 — Direct API (where available)*
- Platforms with formal NCII removal APIs (currently: Meta, Google SafeSearch removal)
- Notice submitted programmatically; acknowledgment logged automatically

*Tier 2 — Grievance Officer Email (Indian intermediaries under IT Rules 2021)*
- System looks up the platform's designated Grievance Officer contact from Asmita's database
- Generates a platform-specific email notice citing IT Rules 2021 Rule 3(2)(b) and the specific URL
- Sent from Asmita's official legal notice address with DKIM/SPF authentication (deliverability matters)
- Timestamp and message ID logged for escalation tracking

*Tier 3 — Web Form Guided Handoff (platforms with no email/API)*
- For platforms that only accept takedown via a web form (common with porn tubes, foreign platforms)
- Asmita pre-fills a notice template for the victim to copy-paste into the platform's own form
- Links directly to the platform's abuse/DMCA form
- Victim confirms submission; case status updated manually

**Feature 1.4 — Auto-Escalation Timeline (updated v0.3)**

The previous v0.2 timeline (24h / 48h / 7d) is preserved as the default for "general NCII" cases, but the engine now also honors the IT Rules Amendment 2026 windows when the URL is flagged as non-consensual nudity (NCN) or deepfake via Feature 1.2.

**Architectural note:** Asmita runs on Vercel daily Cron under the Hobby tier, which caps cron frequency at once-per-day. The 2-hour statutory window cannot be met by a follow-up cron alone, but it does not need to — the survivor's initial notice is sent **instantly** at submission. The 2-hour clock starts then. The follow-up cadence below is what Asmita controls after the initial send.

| Time after initial notice | Action (general NCII) | Action (NCN / deepfake flagged) |
|---|---|---|
| 0 hours | Initial notice sent to platform (cites IT Rules 2021 Rule 3(2)(b), 2026 amendment, and applicable US statutes where the platform is US-hosted). Victim receives a confirmation email with their case reference and a link to the dashboard. | Same as general, plus body cites the 2-hour rule under the 2026 amendment as the primary statutory hook. |
| 24 hours (no terminal response) | **L1 follow-up:** original notice re-sent verbatim with `[Follow-up #1]` subject prefix. Gated by `template.reviewedByLegal=true` AND `platform.lastContactVerifiedByHuman=true`; refuses to dispatch otherwise. Audit log records the refusal reason. | L1 follow-up fires 24h after initial send (same cadence) — but the notice now reflects that the 2-hour statutory window has been breached, escalating tone and citing breach. |
| 48 hours (no terminal response) | **L2 victim notification:** transactional email to the survivor explaining the platform has not responded and Asmita's team is reviewing the case. Localised by `User.preferredLocale`. | Same. |
| 7 days (no terminal response) | **L3 FIR package readiness:** `Case.firPackageGeneratedAt` is set, and the victim is emailed a direct link to `/api/cases/[caseId]/export` which generates the PDF on demand. The PDF is shaped for filing as an FIR or for handoff to a lawyer. | Same. |

**For `TIER_GOVT_ESCALATION_ONLY` platforms** (offshore aggregators where platform notice is known-futile — see Section 9): the platform notice step is **skipped** entirely. The victim is routed directly to NCRP 1930 / cybercrime.gov.in, Google de-indexing, and (if Cloudflare-fronted) a Cloudflare abuse report. L3 still produces the FIR package.

**Termination conditions** (engine refuses to escalate further):
- Platform response of `ACKNOWLEDGED`, `REMOVED`, or `REJECTED` recorded by an admin or webhook.
- URL status reaches `REMOVED`, `MANUALLY_RESOLVED`, or `REJECTED`.
- Victim manually marks the URL resolved via the dashboard.

**Feature 1.5 — Case Tracking Dashboard**
- Victim logs in with case reference number + OTP
- Sees per-URL status: notice sent → acknowledged → content removed / escalated
- Can add new URLs to an existing case
- Can mark a URL as "manually resolved" (platform acted via their own channel)
- Can download their case record as a PDF for legal filing

**Feature 1.6 — Support & Resources**
- NGO helplines: iCall (TISS), Cyber Peace Foundation, Red Dot Foundation
- Free legal aid: District Legal Services Authority (state-wise)
- Step-by-step guide: how to file an FIR for NCII in India
- Guide: how to use cybercrime.gov.in alongside Asmita
- FAQ: Will Asmita staff see my content? (No — URLs are string tokens; content is never fetched.)

---

### Phase 2: Hash Network (Months 7–18)
*Gated on Phase 1 being operational and building documented platform relationships from Phase 1 response data.*

**Why this is Phase 2, not Phase 1:**
Hash-matching requires the platform to have hash-comparison infrastructure and a formal agreement to check incoming uploads against your database. Twitter/X, Reddit, Telegram, and most Indian platforms have neither. Pursuing hash agreements before proving URL-based removal works is the wrong sequence.

**Feature 2.1 — Client-Side Perceptual Hashing**
- Victim uploads content in browser → perceptual hash computed via Web Worker in JavaScript → hash sent to server → file discarded
- Hash algorithm: PDQ (Meta's open-source, compatible with their hash-matching infrastructure) for images; TMK-PDQF for video
- Asmita servers never receive image bytes at any point

**Feature 2.2 — Hash Network Partnerships**
- Use Phase 1 response-rate data as the basis for platform partnership conversations
- Start with Meta (already a StopNCII hash partner; most receptive)
- Proactive blocking: perpetrator upload rejected by platform before it goes live

**Feature 2.3 — Indian Platform Hash Integrations**
- ShareChat, Josh, MX TakaTak, Moj — require direct engagement; not StopNCII partners
- These are Phase 2 because partnership negotiations take 6–12 months minimum

---

## 7. Victim Journey (User Flow)

```
VICTIM ARRIVES AT ASMITA
        |
        v
[Is the victim under 18?]
        |
   YES  |  NO
        |    \
        v     v
[MINOR PATHWAY]  [ADULT PATHWAY]
(See Section 13)  (continue below)
                     |
                     v
        [REGISTRATION — email OTP + age attestation]
        [Optional: Aadhaar offline KYC for stronger notices]
                     |
                     v
        [DIGITAL DECLARATION — signed under penalty of law]
                     |
                     v
        [SUBMIT URLs — one or more, any platform]
        [URLs treated as string tokens; content never fetched]
                     |
                     v
        [PLATFORM DETECTION — domain → platform lookup]
        [Notice template selected per platform]
                     |
                     v
        [NOTICE ROUTING]
        Tier 1: Direct API (Meta, Google)
        Tier 2: Grievance Officer email (IT Rules 2021)
        Tier 3: Web form guided handoff (no API/email)
                     |
                     v
        [CASE REFERENCE NUMBER ISSUED]
                     |
                     v
        [CASE TRACKING DASHBOARD]
        [Status: Notices sent / Response / Removed]
                     |
                     v
        [SUPPORT RESOURCES — NGO / Legal Aid / Counselor]
                     |
                     v
        [ESCALATION OPTIONS]
        - File complaint on cybercrime.gov.in
        - Contact platform's Indian Grievance Officer directly
        - Legal aid referral
        - Contact Asmita support team
```

---

## 8. Trust & Verification

This is the most critical section of the PRD. Without verification, Asmita's URL submission system can be weaponized by abusers to send false takedown notices against innocent people.

### The Abuse Risk
- An abuser could submit their target's legitimate photos/videos as "leaked content"
- This would trigger takedown notices against platforms, potentially removing the victim's own legitimate content
- It would also waste platform goodwill and destroy Asmita's credibility

### The Abuse Risk (Why This Section Matters)
The URL submission workflow is the most abuse-prone part of the system. Without verification, an abuser can submit their target's legitimate social media URL labeled "NCII" — Asmita fires a takedown notice, the platform removes the victim's own content. This also destroys platform trust in Asmita's notices. Every design decision in this section is about preventing this.

### Verification Model (Phase 1)

**Step 1: Digital declaration under penalty of law (mandatory)**
- At submission, the victim signs: *"I confirm that I am the person depicted in this content, or an authorized representative with documented consent. I declare under IT Act Section 66 and IPC Section 191 (false statement) that this submission is truthful."*
- This is displayed in full, not buried in terms. The legal consequence is explicit.
- Deterrence effect: most bad-faith actors will not sign a legal declaration

**Step 2: Email OTP verification (mandatory)**
- Every account requires a verified email address before any notice is sent
- This creates an audit trail and a contact point for both escalation and abuse investigation
- Throwaway addresses are harder to use when OTP is required

**Step 3: Identity verification via Aadhaar offline KYC (optional but recommended)**
- Victim can optionally verify identity using Aadhaar offline XML download (does not share Aadhaar number with Asmita; only name and verification status)
- Alternatively, DigiLocker credential verification
- Verified identity is noted in the takedown notice — platforms treat these more seriously
- Not mandatory at intake: the most vulnerable victims may not have documents accessible in a crisis moment

**Step 4: Automated abuse detection signals**
- System flags: multiple unrelated submissions from one account within 24 hours; submissions of URLs that are clearly public/non-intimate (YouTube videos, news articles); submissions targeting the same platform account repeatedly
- Flagged cases held in human review queue — notice NOT sent until reviewed
- Rate limiting: maximum 10 URL submissions per verified account per 24 hours

**Step 5: Platform linkage (credibility signal)**
- If victim also submits a URL of their own social media profile, system notes the connection
- Same person appearing in both URLs adds credibility to the notice
- This is optional but recommended; included in notice when provided

**Step 6: NGO Vouching (Phase 1 feature, not future)**
- Partner NGOs can flag a case as "verified by NGO worker" after direct contact with the victim
- Vouched cases: rate limits lifted, identity noted in notice as NGO-verified, faster queue
- This is critical for the most vulnerable victims who cannot self-verify digitally

### For Supporters Acting on Victim's Behalf
- Must upload a signed consent form from the victim (PDF upload)
- Supporter's identity and contact verified by email
- Victim receives a notification that a supporter has acted on their case

### What Asmita Will NOT Do
- Ask the victim to upload or share their actual intimate content
- Require government ID for basic submission (this deters the most vulnerable)
- Share victim information with any third party without explicit consent

---

## 9. Platform Database — Target Platforms

### The Grievance Officer Database Is a Core Product Asset
Under IT Rules 2021, all significant social media intermediaries must publish their Grievance Officer's name, contact email, and address. In practice, this information is scattered, frequently outdated, and hard to find. **Building and maintaining this directory is half the value of Asmita.** Victims currently have no single place to find this. The database should be:
- Publicly accessible (even to non-registered users)
- Updated monthly by the Asmita team
- Traceable: each entry should log when it was last verified and how

**Pre-launch task:** Research and verify Grievance Officer contacts for all Tier 1 and Tier 2 platforms before launch. Do not launch with placeholder contacts.

### Tier model (v0.3)

Asmita's notice-router model now has **four tiers**, up from three in v0.2. The fourth tier handles offshore aggregator sites where direct platform notice is known to fail and the only viable response is government / search / CDN escalation.

| Tier | What it covers | How a notice is dispatched |
|---|---|---|
| `TIER_1` (API) | Platforms with a formal NCII removal API or first-class form (Meta, Google) | Programmatic API call or pre-filled form handoff with API receipt |
| `TIER_2` (Email) | Indian SSMIs with a verified Grievance Officer email under IT Rules 2021 | Direct email to the verified GO address |
| `TIER_3` (Form handoff) | Platforms with a public form but no Grievance Officer email (X / Twitter, Pornhub, Telegram) | Asmita pre-fills a notice template; victim copy-pastes into platform form |
| **`TIER_GOVT_ESCALATION_ONLY` (new)** | **Offshore aggregator sites with no functional takedown channel (Coomer.su, Kemono.su, Thothub, anonymous Indian-language piracy sites)** | **Platform notice skipped. Asmita generates an NCRP 1930 complaint form, a Google de-indexing request, and a Cloudflare abuse report if the domain is Cloudflare-fronted. L3 still produces an FIR package.** |

### Priority Tier 1: Social Media (India — Largest Reach)

Confidence column: **High** means directly verified from the platform's own canonical page as of the date noted. **Medium** means secondary-source confirmed but not yet verified on the platform's page. **Low** means historical or unsourced; must be re-researched before save.

| Platform | India Users | Grievance Officer (name, contact) | Notice Basis | Confidence | Verified |
|---|---|---|---|---|---|
| Meta (Facebook / Instagram / Threads) | 500M+ | `fbgoindia@support.facebook.com` (verify); Gurgaon DLF address; specific GO rotates | IT Rules 2021 + DMCA + TAKE IT DOWN | Medium | Pending |
| YouTube / Google India | 450M+ | Grievance page at `google.com/intl/en_in/contact/grievance-officer.html`; NCII-specific form at `reportcontent.google.com/forms/explicit_content_intimate_imagery` | IT Rules 2021 + DMCA | Medium | Pending |
| X / Twitter | 25M+ | **No email by design** — form-only at `help.x.com/en/forms/report-to-grievance-officer-india`; Bangalore office | IT Rules 2021 | High | 2026-05-17 |
| WhatsApp (Meta) | 550M+ | `grievance_officer_wa@support.whatsapp.com` (email historically stable); GO name rotates (Paresh B Lal → Varun Lamba → Siddhartha Nahar per secondary sources) | IT Rules 2021 | Medium | Pending |
| Telegram | 100M+ | `abuse@telegram.org`, `stopCA@telegram.org`, `dmca@telegram.org`; **not an Indian SSMI**, no India GO | DMCA + MeitY escalation | High | 2026-05-17 |
| ShareChat (Mohalla Tech) | 250M+ | Harleen Sethi (GO); `grievance@sharechat.co`. Note: `nodalofficer@sharechat.co` is LE-only, **never use for survivor reports** | IT Rules 2021 | Medium | Pending |
| Josh, Moj, MX TakaTak | 100M+ | Research pending; all are Indian SSMIs and must publish GOs | IT Rules 2021 | Low | Pending |
| Snapchat (Snap Inc.) | 20M+ | **Uthara Ganesh**; `grievance-officer-in@snap.com`; Mumbai office | IT Rules 2021 + DMCA | **High** | **2026-05-17** |
| Reddit | 30M+ (est.) | **Vijay Pamarathi**; grievance form at `support.reddithelp.com/hc/en-us/articles/28417230073236`; Bengaluru office. Reddit also has a separate NCII-specific page | IT Rules 2021 + DMCA + TAKE IT DOWN | **High** | **2026-05-17** |
| Imgur | (small in India) | Footer DMCA page; US-hosted; covered by TAKE IT DOWN Act | DMCA + TAKE IT DOWN | Low | Pending |

*All medium-and-below entries must be re-verified by a human researcher via the admin GO editor before `lastContactVerifiedByHuman=true` is set. The escalation engine refuses to dispatch to platforms with that flag false.*

### Priority Tier 2: Pornographic Websites

**Regulatory context refresh (v0.3):** Two changes since v0.2 materially affect this tier.

1. **TAKE IT DOWN Act of 2025** (15 U.S.C. § 6851) requires US-covered platforms to remove non-consensual intimate visual depictions within 48 hours of valid notification. Full-implementation deadline 19 May 2026 (i.e. effectively immediate). This applies to Pornhub, xHamster (via US operations), Chaturbate, Imgur, and other US-jurisdictional adult platforms. It is now cited as the **primary** US legal basis, not just DMCA — because TAKE IT DOWN does not require copyright ownership and survivors of covertly-recorded or deepfake content rarely hold copyright.
2. **FTC consent decree against Aylo** (September 2025) — $5M settlement obligating Aylo (Pornhub, RedTube, YouPorn) to verify the consent and identity of everyone in uploaded content and to implement technical NCII blocking. Notices to Aylo-network sites should reference this consent decree by name; the company is under active enforcement and notices that cite the decree are reported to land harder.

| Platform | Hosting | Takedown Channel | Notice Basis | Confidence | Verified |
|---|---|---|---|---|---|
| Pornhub (Aylo) | Canada / US | Form at `pornhub.com/content-removal`. Email DMCA channel deprecated. | DMCA + TAKE IT DOWN + FTC consent decree (Sept 2025) | High | Pending |
| RedTube / YouPorn (Aylo) | Same as Pornhub | Same form covers the Aylo network | Same | High | Pending |
| xVideos (WGCZ, Czech Republic) | EU | `abuse@xvideos.com` (per secondary sources); verify on footer | DMCA + TAKE IT DOWN (via US user base) | Medium | Pending |
| xHamster (Hammy Media, Cyprus) | EU | `xhamster.com/info/dmca` (page blocks programmatic access; human researcher to verify) | DMCA + TAKE IT DOWN + xHamster non-consensual content policy | Low | Pending |
| XNXX (WGCZ, same parent as xVideos) | EU | Footer DMCA link; contact likely shared with xVideos | DMCA + TAKE IT DOWN | Low | Pending |
| Chaturbate | US | DMCA form at `chaturbate.com/dmca/` | DMCA + TAKE IT DOWN | High | Pending |
| SpankBang | US (Delaware) | Has a "Non-Consensual Explicit Content – Immediate Removal Request" category on their support portal; exact URL needs manual verification | DMCA + TAKE IT DOWN | Medium | Pending |
| Eporner, Beeg | EU / unknown | Footer DMCA links; not surfaced in research yet | DMCA | Low | Pending |
| Cam4, Stripchat, MyFreeCams, BongaCams | Various | Each has its own DMCA form; needs per-site research | DMCA + TAKE IT DOWN where applicable | Low | Pending |

### TIER_GOVT_ESCALATION_ONLY: known-futile aggregators

These platforms publish DMCA contact details but do not honour them in practice. Platform notice for these is a waste of cycles. Asmita routes them differently.

| Platform | Why on this tier | Routing |
|---|---|---|
| Coomer.party / Coomer.su | Anonymous operators in offshore TLDs; Coomer.party already went offline once and rebranded | NCRP 1930 + Google de-index + Cloudflare abuse (if fronted) |
| Kemono.su | Sister site to Coomer.su (Patreon/Pixiv-focused but hosts NCII) | Same |
| Thothub, Thotsbay | Same operator pattern | Same |
| Indian-language piracy sites (Antarvasna, DesiPapa, IndianPorn365, etc.) | No public DMCA infrastructure documented; many India-hosted, so directly subject to IT Rules 2026 + DoT-ISP blocking | NCRP 1930 + MeitY ISP-block request + Google de-index. **For India-hosted ones, this is the most effective path: the GoI blocked 63 such sites in 2022 and 857 in 2015 via this mechanism.** |
| Telegram NCII-focused channels / bots | Telegram itself responds slowly; specific channels respond not at all | NCRP + StopCA email + Indian gov't direct request to Telegram |

### Priority Tier 3: Search Engines (used as escalation, not first-line)
- **Google**: `reportcontent.google.com/forms/explicit_content_intimate_imagery` (NCII-specific de-indexing — very effective; should be invoked in parallel with platform notice for any URL surfaced in Google Search)
- **Bing**: `microsoft.com/concern/bing`
- **DuckDuckGo**: `duckduckgo.com/feedback`

Removing from search is often as important as removing from the source — even if source is slow to respond, de-listing from search dramatically reduces discovery. **Under the November 2025 MeitY SOP, search engines must de-index NCII within 24 hours.**

### Priority Tier 4: Messaging Apps (Distribution)
- **Telegram**: File abuse report + request group/channel takedown. Recent Indian gov't pressure has made Telegram more responsive in 2025-2026.
- **WhatsApp**: Forwarded messages — harder to take down at source; focus on the originating account.
- **ShareChat groups**: Platform-specific reports via the GO email above.

### Hosting / CDN escalation (last-resort)
- **Cloudflare** (most offshore adult sites are Cloudflare-fronted): abuse form at `abuse.cloudflare.com/dmca`. Cloudflare cannot remove content but can stop fronting the domain and can disclose the origin host under legal compulsion.
- **AWS, Hetzner, OVH, etc.**: For sites hosted outside Cloudflare, an abuse report to the hosting provider is occasionally effective.
- **Domain registrars**: Last-resort. Most adult-site registrars are in DMCA-resistant jurisdictions, but a `gandi.net` or `namecheap.com` registrar will sometimes act on documented NCII.

---

## 10. Takedown Notice System

### Notice Architecture
Each notice is tailored to the target platform and cites the correct legal basis. Three template categories. **As of v0.3, the templates have been rewritten in the codebase (`asmita/prisma/template-seeds.ts`) to full procedural-skeleton quality so the legal reviewer is editing, not drafting from scratch.** All three remain gated by `reviewedByLegal: false`; the escalation engine refuses to dispatch any notice whose template flag is false.

**Template A: Indian Social Media Platforms (IT Rules 2021)**
```
Subject: Urgent — Non-Consensual Intimate Image Removal Request [Case ID: ASMITA-XXXX]

Dear [Platform Name] Grievance Officer / Legal Team,

We write on behalf of [Victim reference / anonymized], an Indian national, to request 
the immediate removal of non-consensual intimate images/video constituting offenses 
under Indian law.

Content URL: [URL]

This content was shared without the subject's consent and constitutes:
- An offense under Section 66E of the Information Technology Act, 2000
- An offense under Section 67A of the Information Technology Act, 2000  
- An offense under Section 77 of the Bharatiya Nyaya Sanhita, 2023 (formerly IPC 354C)

Under Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital 
Media Ethics Code) Rules, 2021, you are required to remove this content within 
24 hours of receipt of this complaint.

This complaint has also been reported to the National Cyber Crime Reporting Portal 
(cybercrime.gov.in). [Include if FIR filed: An FIR has been filed under [section] at 
[police station].]

Case documentation is available upon request. We request written confirmation of 
removal within 24 hours.

Asmita Digital Safety Platform
[contact email]
[website]
```

**Template B: International Platforms (DMCA + TAKE IT DOWN Act)**
Leads with notification under **15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025)** which obligates covered platforms to remove non-consensual intimate visual depictions within 48 hours, alongside **17 U.S.C. § 512(c)(3) (DMCA)** to the extent the complainant retains rights in the underlying work. Includes the full six-element 512(c)(3) statutory skeleton (identification, contact, good-faith, accuracy, signature) so the reviewer is editing procedurally-shaped text. The TAKE IT DOWN Act citation matters because it does not require copyright ownership — survivors of covertly-recorded or deepfake content rarely hold copyright, and pre-TAKE IT DOWN their DMCA notice could be challenged on that basis.

**Template C: Pornographic Platforms (combined Indian + US bases)**
Used when the target platform operates a Grievance Officer in India AND a designated agent for international takedown. Cites both bases in a single notice so the platform's respective teams can act on whichever is procedurally cleanest. For Aylo-network sites specifically (Pornhub, RedTube, YouPorn), the reviewer should add reference to the **FTC consent decree of September 2025** — Aylo is under active enforcement and notices citing the decree are reported to land harder.

For `TIER_GOVT_ESCALATION_ONLY` sites (Section 9), no platform-bound template is used. Instead the engine generates: (a) a pre-filled NCRP 1930 complaint form for the victim to submit at cybercrime.gov.in, (b) a Google de-indexing request, and (c) a Cloudflare abuse report if the domain is Cloudflare-fronted. The L3 FIR PDF is still produced after 7 days.

### Notice Quality Over Volume
In Phase 1, Asmita must track response rates by platform. If a platform has a 0% response rate to email, the playbook shifts to:
1. Filing directly via their web form (higher visibility)
2. Escalating to their Indian Grievance Officer (if appointed)
3. Filing with cybercrime.gov.in + MeitY for Indian platforms
4. Filing DMCA with their US hosting provider / CDN (Cloudflare, AWS, etc.)

This response-rate data becomes the basis for Phase 2 partnership conversations.

---

## 11. Technical Architecture

### Non-Negotiable Constraint: No Server-Side URL Fetching
Asmita's servers must never fetch, download, render, or preview content at submitted URLs. URLs are treated as opaque string tokens throughout the system — parsed for domain/platform detection only. This is:
- A legal protection (Asmita cannot be liable for content it never processed)
- A safety protection for the team (no staff should ever see the content)
- A privacy protection for the victim (URL as identifier, never as content)

This constraint applies in Phase 1 and Phase 2. It is not a performance optimization — it is a hard architectural requirement.

### Phase 1 Stack

**Frontend**
- Web application (responsive — mobile-first; majority of Indian users are on mobile)
- Languages: Hindi and English at launch (toggle)
- Framework: React or Next.js
- No client-side hash library in Phase 1 — URL submission only

**Backend**
- Node.js or Python FastAPI
- **URL parsing module:** Domain extraction → platform lookup in database. No HTTP requests to the submitted URL.
- **Notice generation:** Template engine selects the correct notice template per platform; fills in URL, case ID, legal citations, victim declaration reference
- **Notice routing:** Three-tier dispatch (API → Grievance Officer email → web form handoff instructions)
- **Escalation scheduler:** Background job checks case timelines; fires 24h / 48h / 7-day escalation actions
- Database: PostgreSQL
  - `cases` — case ID, victim contact (encrypted), state, timestamps
  - `submitted_urls` — URL string, platform FK, status, notice timestamps
  - `platforms` — Grievance Officer contact, notice template FK, routing tier, response rate
  - `notices` — case FK, URL FK, template used, sent timestamp, response received, content removed
- Email service: Postmark or Resend (DKIM/SPF configured — deliverability is critical; Asmita's notices must not land in spam)
- Authentication: Email OTP only — no passwords

**Infrastructure**
- Hosting: India-region cloud (AWS ap-south-1 or Azure India Central) — data residency for DPDP compliance
- No content storage — no S3 bucket, no file uploads accepted by the server in Phase 1
- All PII encrypted at rest (AWS KMS or equivalent)

**Admin Panel (Internal)**
- Flagged case review queue (human review before notices go out)
- Platform response rate dashboard — this is the feedback loop for improving notice quality
- Grievance Officer database editor — team uses this to maintain and update platform contacts
- Notice template editor — legal advisor can update templates without code deployment

### Phase 2 Additional Components
- Client-side PDQ hash (images) and TMK-PDQF (video) via browser Web Workers
- Hash database table added to PostgreSQL
- Hash network API client (outbound to partner platform APIs)
- Webhook/callback receiver (inbound status updates from platform APIs)

---

## 12. Privacy & Data Protection

### Core Principles
1. **No content storage, no content fetching** — Asmita never stores, views, fetches, or transmits the victim's actual images or videos. URLs are string tokens; hashes are Phase 2.
2. **Data minimization** — Collect only what is necessary to send a notice and track its status.
3. **Victim control** — Victim can request deletion of their entire case record at any time.
4. **Anonymization** — Notices sent to platforms use case reference IDs, not victim names, unless victim explicitly consents to name disclosure.

### Data Stored Per Case
| Data Element | Stored | Notes |
|---|---|---|
| Victim email | Yes | Encrypted; used for OTP login and case notifications only |
| Victim name | Optional | Stored only if victim consents to name disclosure in notices |
| Victim phone | Optional | For NGO follow-up only |
| Victim city/state | Yes | For legal aid routing; not in notices |
| Content (image/video) | Never | Not stored at any point |
| Content hash (pHash) | Phase 2 only | Not stored in Phase 1; no hashes until hash network is built |
| Submitted URLs | Yes | Used to generate and track notices |
| Notice log | Yes | Timestamp, platform, response |

### DPDP Alignment
The Digital Personal Data Protection Act 2023 principles Asmita will follow:
- **Purpose limitation**: Data collected only for takedown processing
- **Data minimization**: Minimum data to operate
- **Storage limitation**: Case data deleted 2 years after last activity unless victim opts to keep
- **Consent**: Explicit consent obtained at registration with plain-language explanation
- **Security safeguards**: Encryption at rest and in transit

*Note: DPDP implementation rules were pending notification as of early 2026. Asmita's architecture is designed to meet the Act's principles; specific rule compliance will be verified once rules are notified.*

---

## 13. POCSO / Minor Pathway (Mandatory)

**This section is non-negotiable under Indian law.**

If a victim indicates they are under 18 during intake, the standard adult workflow is suspended and the following applies:

### Age Attestation
- At registration, user selects: "I am under 18" / "I am 18 or older"
- Selecting under 18 triggers the minor pathway

### Minor Pathway Process
1. **NCMEC TakeItDown referral**: Victim is shown clear instructions to submit their case at TakeItDown.org (free, works with platforms globally, built for minors)
2. **Cyber crime.gov.in routing**: Asmita provides step-by-step instructions to file a complaint at cybercrime.gov.in for child sexual abuse material (CSAM)
3. **POCSO mandatory reporting**: If Asmita receives credible information of CSAM, Asmita itself has a potential reporting obligation under POCSO. Legal advisor must clarify scope and draft reporting protocol.
4. **CHILDLINE 1098**: Victim is shown CHILDLINE number prominently
5. **No hash storage for minors**: Asmita does not store hashes of CSAM. The case is referred entirely to law enforcement and NCMEC.

### Legal Note for Operators
Possession or processing of CSAM — even hashed — carries legal risk. The minor pathway deliberately avoids all content interaction and routes entirely to government and established child safety systems. **This design decision is final and cannot be changed.**

---

## 14. Roadmap (Phased)

### Phase 1: URL-Based Notice System (Months 1–6)
**Goal**: First 100 victims' cases processed; measurable takedown rate established; platform response database built; credibility with platforms earned through volume and quality.

| Milestone | Target |
|-----------|--------|
| Grievance Officer database research complete (all Tier 1 + Tier 2 platforms) | Month 1 |
| Legal notice templates drafted and reviewed by IFF or SFLC.in | Month 1 |
| MVP web app: registration, URL submission, three-tier routing, case dashboard | Month 2–3 |
| Auto-escalation engine (24h / 48h / 7-day) | Month 3 |
| Hindi language support | Month 3 |
| Soft launch with NGO partner (closed beta — 20 cases) | Month 4 |
| Track first 100 cases; platform response rates documented | Month 5–6 |
| Public launch | Month 6 |

### Phase 2: Hash Network Foundation (Months 7–18)
**Goal**: Add client-side hash submission; use Phase 1 response data to open platform partnership conversations; build proactive blocking infrastructure.

**Gate condition**: Phase 2 does not start until Phase 1 has processed 100+ cases and documented per-platform response rates. That data is the basis for every partnership conversation.

| Milestone | Target |
|-----------|--------|
| Client-side PDQ hash (images) in-browser | Month 7 |
| Hash database added to backend | Month 8 |
| First formal platform partnership meeting — Meta India (using Phase 1 data) | Month 9 |
| Hash network pilot with 1 partner platform | Month 12 |
| TMK-PDQF video hash support | Month 14 |
| 3+ platform hash partners | Month 18 |

### Phase 3: Scale & Policy (Months 18–36)
- Regional language expansion (Bengali, Tamil, Telugu, Marathi, Kannada)
- NCW / MeitY formal partnership
- Indian platform integration (ShareChat, Josh, MX TakaTak)
- Policy advocacy for stronger NCII law in India
- Potential global expansion (Bangladesh, Pakistan, Nepal — same legal gap)

---

## 15. Metrics & Success Criteria

### North Star Metric
**Removal rate within 72 hours** — percentage of submitted URLs where content is confirmed removed within 72 hours of notice.

### Phase 1 KPIs
| Metric | Target (End of Phase 1) |
|--------|------------------------|
| Cases processed | 100+ |
| Platforms contacted | 15+ |
| Removal rate (72 hours) | >30% (email-only baseline) |
| Platform response rate (acknowledgment) | >50% |
| Victim satisfaction (survey) | >70% feel supported |
| Average time to first notice sent | <2 hours from submission |

### Phase 2 KPIs
| Metric | Target (End of Phase 2) |
|--------|------------------------|
| Cases processed | 1,000+ |
| Hash network partners | 3+ |
| Removal rate (hash network partners) | >80% |
| Proactive blocks (perpetrator upload blocked) | Measurable |

---

## 16. Partnerships & Institutional Relations

### Immediate (Phase 1)
- **NGO partners for victim referral**: iCall (TISS), Cyber Peace Foundation, Point of View, Red Dot Foundation
- **Legal notice review — IFF or SFLC.in (Priority)**: Internet Freedom Foundation (IFF) and Software Freedom Law Centre India (SFLC.in) are the two most credible Indian organizations with actual experience litigating IT Rules 2021 cases. Notice templates must be reviewed by someone who has filed or defended against these notices in court — not just a general cyber lawyer. IFF or SFLC.in should be the first outreach call.
- **POCSO protocol legal review**: Separate from notice templates — a lawyer must define Asmita's reporting obligation under POCSO before launch.

### Medium-Term (Phase 2)
- **NCW (National Commission for Women)**: Formal referral partnership; NCW cases can be cross-submitted to Asmita
- **MeitY (Ministry of Electronics and Information Technology)**: Asmita-generated notices become more powerful with government backing
- **State Police Cyber Cells**: Referral protocol for FIR support

### Platform Partnerships (Phase 2 Priority)
Build credibility through Phase 1 response data before approaching:
- Meta (highest priority — already StopNCII partner; India-focused)
- Google India (YouTube + Search removal)
- Telegram (hardest; no formal API; direct escalation path required)

---

## 17. Team & Resources

### Minimum Team for Phase 1 Launch
| Role | Requirement |
|------|------------|
| Product Owner | 1 person, part-time (can be founder) |
| Backend Developer | 1 person, 3–6 months |
| Frontend Developer | 1 person, 3–6 months |
| Legal Advisor | 1 cyber law lawyer, part-time (retainer) |
| NGO Outreach Lead | 1 person, part-time |
| Translator (Hindi) | Freelance, for content review |

### Funding Options
- **CSR funding**: IT companies, women's safety CSR programs (Infosys Foundation, Tata Trusts)
- **Government grants**: MeitY Digital India grants; NCW support
- **International NGO grants**: Access Now, Electronic Frontier Foundation (EFF), Ford Foundation (digital rights)
- **Pro-bono tech**: GitHub for social good; AWS Activate for nonprofits; Google.org

---

## 18. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Abuse of URL submission by bad actors | High | Verification model (Section 8); human review for flagged cases |
| Legal threat from platforms for "false" notices | Medium | Notice language is factual and legally grounded; no threats beyond what law supports; legal advisor reviews templates; `reviewedByLegal` gate refuses dispatch until human sign-off |
| Minor content submitted through adult pathway | High | Age attestation; minor pathway (Section 13); no content storage |
| Low platform response rate in Phase 1 | Medium | Track and publish response rates; escalation chain; use as leverage for Phase 2 partnerships |
| Victim re-traumatization by using the platform | Medium | Trauma-informed UX; no graphic content shown; content warnings; counselor referrals prominent |
| Data breach exposing victim information | High | Data minimization; no content stored; encrypted PII; India-region hosting; regular security audits; hash-chained audit log (added in implementation) |
| Platform policy changes making current takedown processes obsolete | Low | Platform database maintained continuously; team monitors policy changes; admin GO editor and CSV import script support quick refresh |
| **Regulatory framework churn (new in v0.3)** | **High** | **MeitY SOP Nov 2025 and IT Rules Amendment 2026 both changed the takedown windows within 6 months. PRD review cadence increased to quarterly; notice templates use hedged citations that the legal reviewer plugs verified rule numbers into.** |
| DPDP implementation rules create new compliance obligations | Medium | Architecture designed for DPDP principles; legal review once rules notified |
| **TAKE IT DOWN Act implementation timing (new in v0.3)** | **Low** | **Act deadline is 19 May 2026; templates already cite it. Risk is that some US platforms will not be fully compliant by deadline; mitigation is that Asmita's notice still has DMCA as fallback basis.** |
| **`TIER_GOVT_ESCALATION_ONLY` mis-classification (new in v0.3)** | **Medium** | **A platform mis-flagged as known-futile gets no platform notice and the victim loses that channel. Mitigation: tier classification gated through admin GO editor + audit log; reviewable per-case.** |
| Scope creep toward global expansion too early | Low | PRD explicitly limits Phase 1–2 to India; global expansion gated on Phase 3 |

---

## 19. Open Questions

These are decisions that must be made before or during development. Closed decisions are marked with their resolution.

### Closed since v0.2

- ✅ **D-02 — Anonymous vs. registered submissions** → **Registered (email OTP)**. Implemented in the auth flow.
- ✅ **D-03 — Languages at launch** → **English + Hindi**. Hindi marketing copy scaffolded; awaiting native-speaker translator.
- ✅ **D-04 — Supporter pathway timing** → **Post-launch**. Supporter pathway is a Phase 2 feature; not built in Phase 1.

### Still open from v0.2 (carried forward unchanged)

1. **D-01 — Legal entity**: What legal structure should Asmita operate under — Section 8 company (non-profit), trust, or NGO registration? This affects credibility of takedown notices and funding eligibility.

2. **D-05 — Funding before launch**: Platform needs at least 3–4 months of funded development. What is the funding plan and timeline?

3. **D-06 — POCSO reporting protocol**: Legal advisor must clarify whether Asmita as an intermediary has a mandatory POCSO reporting obligation if it receives CSAM-related submissions, and draft the protocol.

4. **D-07 — Platform database maintenance**: Who owns the ongoing research to keep platform contacts, takedown processes, and legal team contacts up to date? The admin GO editor and CSV importer now exist; the question is staffing.

5. **D-08 — Handling non-response**: For TIER_1 / TIER_2 / TIER_3 platforms this is now answered by the L1/L2/L3 engine described in Section 6. For `TIER_GOVT_ESCALATION_ONLY` sites the routing-to-NCRP / Google / Cloudflare path is also defined. The residual open question is **what happens if even the government / search escalation fails after 30 days** — does Asmita help the victim pursue civil action? Does it refer to a specific list of NCII-litigating lawyers?

### Newly open in v0.3

6. **D-09 — Content-category flag UX (Feature 1.2)**: How is the "non-consensual nudity / deepfake / other" question phrased at submission? A trauma-informed translator + UX writer needs to draft language that captures the legal category without re-traumatising the victim. Recommendation: a 3-state "if you can describe it, which best fits?" with an explicit "skip / I'd rather not say" option, defaulting to the 24-hour general path on skip.

7. **D-10 — NCRP 1930 integration depth**: Does Asmita merely generate a pre-filled complaint form for the victim to submit at cybercrime.gov.in, or does it pursue an MoU with I4C to submit programmatically? The latter would make Asmita a feeder for the national hash bank. Significant policy work; Phase 2 or 3.

8. **D-11 — `TIER_GOVT_ESCALATION_ONLY` operational scope**: Which domains qualify? A starter list (Coomer.su, Kemono.su, Thothub, Indian-language piracy sites) is in Section 9. Maintenance of this list is an ongoing policy decision — too aggressive and Asmita is seen as bypassing platform engagement; too narrow and victims of the worst sites get the worst service.

9. **D-12 — 2-hour NCN regime in practice**: Asmita sends the initial notice instantly when the victim submits, but cannot guarantee delivery / acknowledgement within 2 hours given Vercel cron, Resend deliverability, and platform-side processing. Should the dashboard set victim expectations around this, or aim to upgrade to a sub-hourly cron tier (Vercel Pro) for NCN cases specifically?

10. **D-13 — Madras HC / Delhi HC case-law in templates**: Should the notice body reference these specific judicial directives by case name and citation? Doing so makes the notice land harder but also commits Asmita to maintaining accurate case citations as the law evolves. Decision belongs with IFF / SFLC.in during template review.

11. **D-14 — TAKE IT DOWN Act applicability to non-US-incorporated platforms**: The Act applies to "covered platforms" by definition, but how aggressively does the FTC enforce against EU-incorporated operators (WGCZ for xVideos/XNXX, Hammy Media for xHamster/Beeg)? The notice template asserts applicability "via US user base" — the legal reviewer needs to confirm whether that holds.

---

## Appendix A: Reference Links

### Victim / public-facing
- StopNCII.org: https://stopncii.org
- TakeItDown (NCMEC, for minors): https://takeitdown.ncmec.org
- National Cyber Crime Reporting Portal: https://cybercrime.gov.in
- National Cybercrime Helpline: **1930**
- NCW Sahyog: https://ncwapps.nic.in/onlinecomplaintregistration.aspx
- Google NCII de-indexing form: https://reportcontent.google.com/forms/explicit_content_intimate_imagery
- Google general removal: https://removals.google.com
- Meta NCII Help: https://www.facebook.com/help/nonconsensual-intimate-images
- iCall (TISS Mental Health Support): https://icallhelpline.org
- Cyber Peace Foundation: https://cyberpeace.org

### Indian regulatory primary sources
- IT Rules 2021 (Intermediary Guidelines): https://egazette.nic.in/WriteReadData/2021/225464.pdf
- MeitY 11 November 2025 NCII SOP: covered in [SCC Online](https://www.scconline.com/blog/post/2025/11/12/meity-non-consensual-intimate-imagery-sop-24-hour-takedown-policy-scctimes/) and [The420.in](https://the420.in/meity-24-hour-ncii-takedown-protocol-revenge-porn-deepfake-removal-india/) (gazette link to be added once Asmita verifies)
- IT Rules Amendment 2026 (gazette text): commentary at [Mondaq](https://www.mondaq.com/india/new-technology/1760554/it-rules-2026-deepfake-regulation-three-hour-takedowns-and-ai-labelling-obligations), [LiveLaw](https://www.livelaw.in/law-firms/law-firm-articles-/deepfakes-due-diligence-indias-2026-it-amendment-rules-resolve-global-platform-liability-debate-530344) (gazette link to be added)
- Indian Cybercrime Coordination Centre (I4C) on cybercrime.gov.in

### US regulatory primary sources
- TAKE IT DOWN Act 2025 (15 U.S.C. § 6851): congressional summary at [Congress.gov LSB11314](https://www.congress.gov/crs-product/LSB11314); analysis at [Skadden](https://www.skadden.com/insights/publications/2025/06/take-it-down-act)
- DMCA Section 512 (17 U.S.C. § 512): https://www.copyright.gov/512/
- US Copyright Office DMCA Designated Agent Directory: https://dmca.copyright.gov/osp/
- FTC settlement statement re Aylo (Sept 2025): https://www.ftc.gov/system/files/ftc_gov/pdf/2025.09.03-2123033-pornhub-mindgeek-ferguson-holyoak-meador-statement.pdf

### Asmita internal research
- `asmita/docs/go-research/go-research-2026-05-17.md` — Tier 1 social media GO research
- `asmita/docs/go-research/go-research-porn-sites-2026-05-17.md` — porn-platform pass 1
- `asmita/docs/go-research/go-research-porn-sites-pass2-2026-05-17.md` — porn-platform pass 2 + IT Rules 2026 / TAKE IT DOWN Act analysis
- `asmita/docs/translation/hindi-marketing-handoff.md` — translator handoff for homepage Hindi strings
- `asmita/docs/ai-agent-handoff.md` — handoff doc for the next AI agent picking up the project

---

*This PRD is a living document. Version history should be maintained as the platform evolves. Major decisions made after this draft should be recorded as dated amendments.*

*Document Owner: Saquib Jamil (CSR India)*
*Last Updated: 2026-05-17 (v0.3)*
