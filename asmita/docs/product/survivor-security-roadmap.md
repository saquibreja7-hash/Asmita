# Meri Asmita: Survivor-Security Platform Roadmap

Status: draft for review
Owner: Saquib
Last updated: 2026-08-02

## The shift

Meri Asmita moves from a takedown service to a single, trauma-informed response centre. A survivor should be able to understand what is happening, preserve evidence, reduce further spread, submit and track removals, escalate, secure their accounts and devices, and reach legal, psychological, and practical support.

The organising promise is not "we can prove whether an image is AI-generated." It is:

> We help you regain control, by preserving evidence, reducing distribution, securing your accounts, pursuing removals, and connecting you with the right support.

**Deepfake detection is a supporting feature, never a gate.** Real NCII, face swaps, nudify images, mislabeled images, and threats to publish all get the same help. Whether an image is authentic, altered, or generated never decides whether we assist.

## Where we already are

The current codebase covers a meaningful slice of Phase 1 already:

- URL takedown, notice generation and dispatch (`notice-*.ts`, `case-ops.ts`).
- Client-side PDQ hash submission (`hash-submission.ts`, `hash-dispatch.ts`).
- POCSO / minor routing (`/minor-support`), keeping minors out of the adult case flow.
- Admin dispatch with human contact verification and legal review gates.
- English and Hindi throughout, OTP login, audit log, rate limiting, CSRF.
- Client-side content-credential reader (`/check-image`, `ai-provenance.ts`), the first step of the authenticity feature.

So this roadmap is mostly about adding the response-centre layer around a working takedown engine, not starting over.

## The charter decision that governs everything

Moving to an evidence vault, server-side detection, and monitoring breaks the original "no media, ever" rule. We have decided to change it to "media only under strict, consented, encrypted, time-limited conditions." That decision is written up in `docs/adr/002-consented-encrypted-media.md` and is **blocked on legal sign-off**.

Practical consequence: everything in this roadmap that stores or server-processes media is designed now but does not ship until counsel and a security review clear ADR 002. Features that do not touch media can proceed in parallel.

## Product structure

Five areas, matching how a survivor thinks, not how the backend is organised:

1. **Get Help Now** — triage for published content, threats, sextortion, deepfakes, impersonation, account compromise.
2. **My Case** — status, URLs, reports, deadlines, messages.
3. **Protect My Accounts** — account, device, privacy, impersonation checks.
4. **Preserve Evidence** — secure evidence log and downloadable reports.
5. **Support and Recovery** — legal aid, counselling, safety planning, resources.

## Roadmap

Each feature lists what it is, what it maps to in the code, and its main gate or risk. "Gate" means something that must be true before it ships.

### Phase 1: Survivor response MVP

Goal: turn the takedown form into a response centre. Most of this touches no media, so it can move without waiting on ADR 002.

| # | Feature | Maps to / build | Gate |
|---|---|---|---|
| 1 | Guided "Get Help Now" triage | New `(public)` flow feeding case creation; decision tree, not a long form | None. Ships first. |
| 2 | Safe access + Quick Exit | New global component: Quick Exit button, double-Escape, neutral tab title/favicon, session timeout, `noindex` on dashboards, no sensitive text in emails/notifications | None. Safety-critical, build early. |
| 3 | Anonymous / pseudonymous case creation | Extend case model + auth: random case ID, password/passkey, optional contact, recovery code, three modes (self-help / anonymous assisted / verified legal) | Review data model against DPDP minimisation. |
| 4 | Case dashboard | Extend `(victim)` dashboard into a clear timeline with per-URL status, references, escalation deadlines, no vague "processing" | None. |
| 5 | URL + evidence collection (text only) | Extend URL intake to capture usernames, timestamps, threat text, payment demands as text/hashes. No image storage in Phase 1. | Keep to text + hashes to stay inside current charter. |
| 6 | Platform-specific report generator | Extend notice generation with a maintained platform directory (reporting route, NCII policy, deepfake policy, India grievance officer, timelines, last-verified date) | Human contact verification stays required. |
| 7 | Google / Bing de-index assistance | New notice type; treat de-indexing as separate from source removal | None. |
| 8 | India NCRP / Grievance Officer / GAC pathways | New India NCII Action Centre flow; version-controlled deadline rules engine | Deadlines (2-hour vs 24-hour) reviewed by counsel before stated as fact. |
| 9 | StopNCII + Take It Down routing | Guided handoff, not a rebuild: adults to StopNCII, under-18 to Take It Down | Correct minor routing, tested. |
| 10 | Secure caseworker messaging | New secure inbox; role-based access; permissioned case summary so survivor never re-tells their story | Role-based access model reviewed. |
| 11 | English + Hindi | Existing i18n | None. |
| 12 | Explicit retention + deletion controls | Case withdrawal, delete, retention clock surfaced to survivor | Foundation for ADR 002. |

### Phase 2: Security and support

Goal: the "regain control" layer. Several items here store media and are gated on ADR 002.

| # | Feature | Maps to / build | Gate |
|---|---|---|---|
| 7v | Encrypted evidence vault | Encrypted, time-limited object store; SHA-256, access log, redacted copy, downloadable evidence/legal packets | **ADR 002 + security review.** Minors hard-excluded. |
| 12 | Account Security Checkup | Platform-specific checklists; asks first whether abuser has device access | None (content pages). |
| 13 | Stalkerware / device safety assessment | Questionnaire + safer-options guidance; does not tell everyone to uninstall | Follow Coalition Against Stalkerware guidance. |
| 11 | Sextortion emergency mode | Prominent "I am being blackmailed" path; urgent info first, do-not-pay guidance | None. High priority within Phase 2. |
| 17/18 | Support directory + mental-health/grounding | Verified directory (One Stop Centres, DLSAs, cybercrime units, counselling, LGBTQ+, disability, child protection); grounding exercises and referral | Listings vetted, last-verified dates. |
| 19 | "Help someone else" mode | Authorised-representative accounts with survivor-controlled, revocable permissions | Consent model; aligns with MeitY SOP representative provision. |
| 20 | More Indian languages + low-bandwidth | Bengali, Urdu, Tamil, Telugu, Marathi, Malayalam; text-first, save-and-resume, screen-reader, code-mixed | Translation review. |

### Phase 3: Proactive protection

Goal: after partnerships and governance. Highest risk, most governance.

| # | Feature | Maps to / build | Gate |
|---|---|---|---|
| 9 | StopNCII NGO / Global Clearing Centre participation | Partnership application; only run our own hash bank once we have authorised recipients | Partnership + legal. |
| 10 | Resurfacing / exposure monitoring | Opt-in, survivor-controlled searches (hashes, name, known URLs, impersonation) | Consent + governance. |
| 15 | Content-authenticity assessment (deepfake detection) | The `/check-image` reader plus optional server-side detector (our own model on Cloudflare Containers, in-memory, discarded). Strengthens reports, never gates help. Shows "likely," never "97% fake." | **ADR 002.** Framed as non-conclusive. |
| 8 | Evidence-capture extension / bookmarklet | Captures pages the survivor already views; blurs explicit content; no covert surveillance | Security + abuse review. |
| face/voice | Opt-in face / impersonation search | Separate explicit consent; encrypted biometric templates; human review of candidates, no auto-accusation; deletion controls | Consent design, legal review, accuracy testing, deletion controls. Do not launch without these. |

## Internal tools (build alongside the phases they serve)

- **Caseworker console**: risk level, survivor's requested outcome, URLs, deadline clock, actions, evidence refs, consent permissions, history, reappearance alerts.
- **Reviewer-wellbeing protections**: blurred thumbnails by default, text-only where possible, click-and-hold to reveal, no autoplay, limited viewing time, access logging, two-person review for sensitive decisions.
- **Audit and accountability**: who accessed each object and why, what was sent, which template and legal version, survivor authorisation, deletion events, detector version. Extends the existing audit log.

## What we are deliberately not building

- No public "upload and identify NCII" scanner. It becomes an abuse tool.
- No private CSAM database. Minor cases go to authorised child-protection systems.
- No promise of whole-internet removal. We state exactly which platforms, URLs, and search results were addressed.
- No AI detection as a gatekeeper.
- No broad face recognition without the full governance package.
- No indefinite retention of intimate media.

## Immediate next actions

1. **Stop the Cloudflare deepfake-detection container work.** It is a Phase 3 supporting feature, not the centre. The client-side reader already shipped is enough until then.
2. **Start counsel review of ADR 002.** Everything media-related in Phase 2 and 3 waits on it, so the clock should start now.
3. **Build Phase 1, items 1 and 2 first** (triage front door + safe access / Quick Exit). They are low-risk, touch no media, and reframe the entire app immediately.
4. Keep the existing "no media, ever" lint tests and no-fetch monitor in force for the takedown and notice pipelines. The new media paths are separate and get their own tests.

## Sources

Design references: StopNCII, Take It Down (NCMEC), eSafety Commissioner (AU), Revenge Porn Helpline (UK), CCRI Safety Center, Chayn/Bloom, NNEDV Safety Net, Coalition Against Stalkerware, Lila.help, MeitY NCII SOP, I4C/NCRP. Full links in the source brief that seeded this roadmap.
