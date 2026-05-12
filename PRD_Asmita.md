# Asmita — Product Requirements Document
**Asmita (अस्मिता) — Dignity Restoration Platform for Non-Consensual Intimate Images**
**Version:** 0.2 (Draft)
**Date:** 2026-05-12
**Status:** Pre-development

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

### Primary Laws Applicable to NCII

| Law | Provision | Relevance |
|-----|-----------|-----------|
| IT Act 2000, Section 66E | Punishment for violation of privacy — capturing, publishing, transmitting private images without consent | Core offense; 3 years + ₹2 lakh fine |
| IT Act 2000, Section 67 | Publishing obscene material in electronic form | Up to 5 years imprisonment |
| IT Act 2000, Section 67A | Publishing sexually explicit material in electronic form | Up to 5 years + ₹10 lakh fine |
| IPC Section 354C (now BNS Section 77) | Voyeurism — capturing or disseminating private images of women without consent | 1–3 years (first offense), 3–7 years (repeat) |
| POCSO Act 2012, Section 13–15 | Child sexual abuse material — mandatory reporting; platforms must report to NCMEC/police | Zero tolerance; mandatory referral |
| Protection of Women from Domestic Violence Act | Applicable when perpetrator is intimate partner | Supports civil remedies |
| IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 | Rule 3(2)(b): Platforms must remove content within 24 hours for specific sexual content; Grievance Officer mandatory | Most powerful tool for rapid takedown |
| Digital Personal Data Protection Act 2023 | Governs how Asmita handles victim personal data | Design for DPDP principles; implementation rules pending notification |

### How Asmita Uses These Laws
1. **IT Rules 2021 Rule 3(2)(b)** — Primary lever. Cited in every notice to Indian intermediaries. Triggers their 24-hour legal obligation without requiring a court order or police FIR. Any user can invoke this; Asmita makes it easy.
2. **IT Act 66E / 67A + BNS 77** — Cited as the criminal offenses the content constitutes. Makes the platform's liability for continued hosting explicit.
3. **DMCA Section 512** — Primary lever for international platforms (porn sites, US-hosted content). Victim authorizes Asmita to file as designated agent.
4. **DPDP Act** — Governs how Asmita stores and processes victim data. Architecture designed for DPDP principles from day one.

### What Asmita Can and Cannot Claim
- **Can claim:** "This content constitutes an offense under IT Act Section 66E and IPC Section 354C. Under IT Rules 2021 Rule 3(2)(b), you are required to remove this content within 24 hours. Failure to act may expose your platform to liability under Indian law."
- **Cannot claim:** Government enforcement action, police FIR (unless one has been filed), court orders (unless obtained)
- All notices will be drafted and reviewed by a legal advisor before templating

### DMCA (for International Platforms)
Most major porn platforms are US-hosted. Asmita will file DMCA Section 512 takedown notices on behalf of victims:
- Victim assigns copyright to their own image/video (they are the subject and often creator)
- Asmita acts as designated agent with victim's authorization
- Platforms must respond within 10–14 days; repeat infringer policy kicks in

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

**Feature 1.4 — Auto-Escalation Timeline**

| Time Elapsed | Action |
|---|---|
| 0 hours | Initial notice sent; confirmation sent to victim |
| 24 hours (no response) | Escalation notice sent to same contact; victim notified |
| 48 hours (no response) | Notice sent to platform's Indian Grievance Officer (if separate from initial contact); victim advised to file cybercrime.gov.in complaint |
| 7 days (no removal) | Escalation package generated: summary of notices sent, timestamps, non-response record — formatted for police FIR / legal filing |

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

### Priority Tier 1: Social Media (India — Largest Reach)
| Platform | India Users | Grievance Officer / Takedown Contact | Notice Basis |
|----------|-------------|--------------------------------------|-------------|
| Meta (Facebook/Instagram) | 500M+ | grievanceofficer@support.facebook.com (verify); also has NCII-specific form | IT Rules 2021 + DMCA |
| YouTube (Google India) | 450M+ | Designated Grievance Officer published at support.google.com/youtube/answer/2801895 | IT Rules 2021 + DMCA |
| Twitter / X | 25M+ | grievanceofficer-in@twitter.com (verify current contact); also help.twitter.com/forms/private_information | IT Rules 2021 + DMCA |
| Telegram | 100M+ | abuse@telegram.org; no formal IT Rules registration as of 2024 — use DMCA + MeitY fallback | DMCA; MeitY escalation |
| WhatsApp (Meta) | 550M+ | grievanceofficer@support.whatsapp.com (verify); forwarded message removal harder — focus on source | IT Rules 2021 |
| ShareChat | 250M+ | grievance@sharechat.com (verify) | IT Rules 2021 |
| Josh / Moj / MX TakaTak | 100M+ | Research required — all must publish Grievance Officer under IT Rules 2021 | IT Rules 2021 |
| Snapchat | 20M+ | No Indian Grievance Officer as of 2024; use support.snapchat.com DMCA form | DMCA |

*All contacts must be verified before launch. IT Rules 2021 requires platforms to publish this; Asmita's team should pull from each platform's Terms/Privacy/Contact page directly.*

### Priority Tier 2: Pornographic Websites
| Platform | Hosting | Takedown Process |
|----------|---------|-----------------|
| Pornhub (Aylo) | Canada | support.pornhub.com/hc/en-us/requests/new (DMCA) |
| xVideos | Czech Republic | xvideos.com/abuse |
| xHamster | Cyprus | xhamster.com/abuse |
| XNXX (NKL Associates) | Czech Republic | xnxx.com/abuse |
| RedTube (Aylo) | Canada | DMCA via Aylo |
| XNXX | Czech Republic | xnxx.com/abuse |
| Desi-specific sites | Offshore (India-targeted) | Research required; many have no formal process |

*Indian-hosted porn sites:* Many are fly-by-night, frequently change domains, and have no formal takedown process. For these, the fallback is: MeitY complaint + cybercrime.gov.in + ISP blocking request via CERT-In.

### Priority Tier 3: Search Engines
- Google: removals.google.com (explicit content removal tool — very effective)
- Bing: microsoft.com/en-us/concern/bing
- DuckDuckGo: duckduckgo.com/feedback

Removing from search is often as important as removing from the source — even if source is slow to respond, delisting from search dramatically reduces discovery.

### Priority Tier 4: Messaging Apps (Distribution)
- Telegram: File abuse report + request group/channel takedown
- WhatsApp: Forwarded messages — harder to take down at source; focus on awareness
- Hike, ShareChat groups — platform-specific reports

---

## 10. Takedown Notice System

### Notice Architecture
Each notice is tailored to the target platform and cites the correct legal basis. Three template categories:

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

**Template B: International Platforms (DMCA + Indian Law)**
Similar to above but leads with DMCA Section 512 language and appends Indian law as additional basis. Includes victim's authorization for Asmita to act as DMCA agent.

**Template C: Pornographic Platforms (DMCA Primary)**
DMCA-first (most platforms respond to this). Includes the platform's own abuse/DMCA submission form URL. For platforms that ignore DMCA, escalates to registrar and hosting provider.

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
| Legal threat from platforms for "false" notices | Medium | Notice language is factual and legally grounded; no threats beyond what law supports; legal advisor reviews templates |
| Minor content submitted through adult pathway | High | Age attestation; minor pathway (Section 13); no content storage |
| Low platform response rate in Phase 1 | Medium | Track and publish response rates; escalation chain; use as leverage for Phase 2 partnerships |
| Victim re-traumatization by using the platform | Medium | Trauma-informed UX; no graphic content shown; content warnings; counselor referrals prominent |
| Data breach exposing victim information | High | Data minimization; no content stored; encrypted PII; India-region hosting; regular security audits |
| Platform policy changes making current takedown processes obsolete | Low | Platform database maintained continuously; team monitors policy changes |
| DPDP implementation rules create new compliance obligations | Medium | Architecture designed for DPDP principles; legal review once rules notified |
| Scope creep toward global expansion too early | Low | PRD explicitly limits Phase 1–2 to India; global expansion gated on Phase 3 |

---

## 19. Open Questions

These are decisions that must be made before or during development:

1. **Legal entity**: What legal structure should Asmita operate under — Section 8 company (non-profit), trust, or NGO registration? This affects credibility of takedown notices and funding eligibility.

2. **Anonymous vs. registered submissions**: Should victims be required to register (email), or should fully anonymous submissions be allowed? Anonymous reduces barrier to entry but eliminates follow-up and increases abuse risk.

3. **Languages at launch**: Hindi + English only, or include one more regional language? (Recommendation: Hindi + English for Phase 1; add Bengali/Tamil in Phase 2.)

4. **Supporter pathway**: Should third parties (NGO workers, lawyers) be able to submit on behalf of victims from day one, or post-launch feature?

5. **Funding before launch**: Platform needs at least 3–4 months of funded development. What is the funding plan and timeline?

6. **POCSO reporting protocol**: Legal advisor must clarify whether Asmita as an intermediary has a mandatory POCSO reporting obligation if it receives CSAM-related submissions, and draft the protocol.

7. **Platform database maintenance**: Who owns the ongoing research to keep platform contacts, takedown processes, and legal team contacts up to date?

8. **Handling non-response**: What is Asmita's escalation playbook when a platform does not respond within 72 hours? This must be defined before launch.

---

## Appendix A: Reference Links

- StopNCII.org: https://stopncii.org
- TakeItDown (NCMEC, for minors): https://takeitdown.ncmec.org
- National Cyber Crime Reporting Portal: https://cybercrime.gov.in
- NCW Sahyog: https://ncwapps.nic.in/onlinecomplaintregistration.aspx
- IT Rules 2021 (Intermediary Guidelines): https://egazette.nic.in/WriteReadData/2021/225464.pdf
- Google Explicit Content Removal: https://removals.google.com
- Meta NCII Help: https://www.facebook.com/help/nonconsensual-intimate-images
- iCall (TISS Mental Health Support): https://icallhelpline.org
- Cyber Peace Foundation: https://cyberpeace.org

---

*This PRD is a living document. Version history should be maintained as the platform evolves. Major decisions made after this draft should be recorded as dated amendments.*

*Document Owner: [Founder/Product Owner name]*
*Last Updated: 2026-05-11*
